import Groq from "groq-sdk";
import type { z } from "zod";
import { env } from "../env.js";
import { logger } from "../logger.js";

export const GROQ_MODELS = {
  REASONING: "openai/gpt-oss-120b",
  FAST: "qwen/qwen3.8-27b",
  BACKUP_REASONING: "openai/gpt-oss-20b",
  BACKUP_FAST: "qwen/qwen3.6-27b",
} as const;

export const OPENROUTER_FREE_MODELS = [
  "liquid/lfm-2.5-2.6b:free",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/free",
] as const;

let groqClient: Groq | null = null;

export function getGroqClient(): Groq {
  if (!env.GROQ_API_KEY) {
    throw new Error(
      "Missing GROQ_API_KEY. Please add GROQ_API_KEY=gsk_... to apps/worker/.env (free at https://console.groq.com)."
    );
  }
  if (!groqClient) {
    groqClient = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return groqClient;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class TokenTracker {
  private input = 0;
  private output = 0;

  record(inputTokens: number, outputTokens: number): void {
    this.input += inputTokens;
    this.output += outputTokens;
  }

  consume(): { inputTokens: number; outputTokens: number } {
    const res = { inputTokens: this.input, outputTokens: this.output };
    this.input = 0;
    this.output = 0;
    return res;
  }

  getTotal(): { inputTokens: number; outputTokens: number } {
    return { inputTokens: this.input, outputTokens: this.output };
  }
}

const globalTokenTracker = new TokenTracker();

export function recordTokenUsage(input: number, output: number): void {
  globalTokenTracker.record(input, output);
}

export function consumeTokenUsage(): { inputTokens: number; outputTokens: number } {
  return globalTokenTracker.consume();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Serialized FIFO Pacing Queue: enforces strict minimum interval between all requests to stay under Groq 30 RPM limit
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 2200; // ~27 RPM max, safely under 30 RPM
let pacingMutex: Promise<void> = Promise.resolve();

export async function paceRequest(): Promise<void> {
  const next = pacingMutex.then(async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastRequestTime = Date.now();
  });
  pacingMutex = next.catch(() => {});
  return next;
}

/**
 * Robust JSON extraction helper that parses raw model output,
 * stripping markdown code fences or reasoning text preamble.
 */
export function extractJsonFromText(raw: string): string {
  let text = raw.trim();

  // Strip markdown ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }

  // Find start and end of outer JSON object or array
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let start = -1;
  let end = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = text.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = text.lastIndexOf("]");
  }

  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1);
  }

  return text;
}

/**
 * Fallback to OpenRouter free models if configured and Groq is down/rate-limited.
 */
export async function callOpenRouter(options: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
  seed?: number | null;
  tracker?: TokenTracker;
}): Promise<{ content: string; inputTokens: number; outputTokens: number } | null> {
  if (!env.OPENROUTER_API_KEY) return null;

  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      await paceRequest();
      logger.info("attempting OpenRouter fallback", { model });
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai-validation-platform.local",
          "X-Title": "AI Idea Validator",
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
          ...(options.seed != null ? { seed: options.seed } : {}),
          ...(options.responseFormatJson ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        logger.warn("OpenRouter model returned non-200", { model, status: res.status });
        continue;
      }

      const data = (await res.json()) as any;
      const rawContent = data.choices?.[0]?.message?.content;
      if (rawContent && typeof rawContent === "string") {
        const content = options.responseFormatJson ? extractJsonFromText(rawContent) : rawContent;
        if (options.responseFormatJson) {
          try {
            JSON.parse(content);
          } catch {
            logger.warn("OpenRouter model returned unparseable JSON, trying next candidate", {
              model,
              rawPreview: rawContent.slice(0, 100),
            });
            continue;
          }
        }

        const inputTokens = data.usage?.prompt_tokens ?? 0;
        const outputTokens = data.usage?.completion_tokens ?? 0;
        if (options.tracker) {
          options.tracker.record(inputTokens, outputTokens);
        } else {
          recordTokenUsage(inputTokens, outputTokens);
        }
        logger.info("OpenRouter fallback succeeded", { model, inputTokens, outputTokens });
        return { content, inputTokens, outputTokens };
      }
    } catch (e) {
      logger.warn("OpenRouter model attempt failed", { model, error: String(e) });
    }
  }

  return null;
}

/**
 * Executes an operation with exponential backoff on 429 (rate-limit) errors,
 * with fast failover to OpenRouter when configured.
 */
async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  context: {
    model: string;
    operationName: string;
    openRouterFallback?: () => Promise<T | null>;
  }
): Promise<T> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await paceRequest();
    try {
      return await operation();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.includes("rate_limit_exceeded") ||
        errMsg.includes("Rate limit reached") ||
        (err as { status?: number })?.status === 429;

      // If rate limited and OpenRouter is available, try immediate failover to OpenRouter
      if (isRateLimit && context.openRouterFallback) {
        logger.warn("Groq rate limit hit (429), attempting immediate OpenRouter failover...", {
          model: context.model,
          operation: context.operationName,
        });
        try {
          const fallbackRes = await context.openRouterFallback();
          if (fallbackRes !== null) {
            logger.info("OpenRouter failover succeeded on Groq 429", {
              operation: context.operationName,
            });
            return fallbackRes;
          }
        } catch (fbErr) {
          logger.warn("OpenRouter failover attempt failed, continuing backoff retry", {
            error: String(fbErr),
          });
        }
      }

      if (isRateLimit && attempt < maxRetries) {
        const backoffMs = Math.min(3000 * Math.pow(2, attempt - 1), 12000);
        logger.warn("Groq rate limit hit (429), backing off", {
          model: context.model,
          attempt,
          backoffMs,
          operation: context.operationName,
        });
        await sleep(backoffMs);
        continue;
      }

      throw err;
    }
  }
  throw new Error(`Exceeded max retries for ${context.operationName}`);
}

/**
 * Standard chat completion with Groq and OpenRouter fallback.
 */
export async function chatCompletion(options: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  seed?: number | null;
  tracker?: TokenTracker;
}): Promise<string> {
  const groq = getGroqClient();
  const primaryModel = options.model ?? GROQ_MODELS.FAST;
  const modelsToTry = [
    primaryModel,
    GROQ_MODELS.FAST,
    GROQ_MODELS.BACKUP_FAST,
    GROQ_MODELS.REASONING,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const openRouterFallback = async (): Promise<string | null> => {
    const res = await callOpenRouter({
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      seed: options.seed,
      tracker: options.tracker,
    });
    return res ? res.content : null;
  };

  for (const model of modelsToTry) {
    try {
      return await withRateLimitRetry(
        async () => {
          const response = await groq.chat.completions.create({
            model,
            messages: options.messages,
            temperature: options.temperature ?? 0.7,
            max_completion_tokens: options.maxTokens ?? 1024,
            ...(options.seed != null ? { seed: options.seed } : {}),
          });

          if (response.usage) {
            const inTokens = response.usage.prompt_tokens ?? 0;
            const outTokens = response.usage.completion_tokens ?? 0;
            if (options.tracker) {
              options.tracker.record(inTokens, outTokens);
            } else {
              recordTokenUsage(inTokens, outTokens);
            }
          }

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error(`Empty response returned from Groq model: ${model}`);
          }
          return content;
        },
        { model, operationName: "chatCompletion", openRouterFallback }
      );
    } catch (err) {
      logger.warn("model attempt failed in chatCompletion, trying next", {
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback to OpenRouter free models
  const openRouterResult = await openRouterFallback();
  if (openRouterResult) {
    return openRouterResult;
  }

  throw new Error("All chat completion model candidates and providers exhausted");
}

/**
 * Structured JSON completion that parses and validates output against a Zod schema.
 */
export async function jsonCompletion<T>(options: {
  model?: string;
  messages: ChatMessage[];
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  temperature?: number;
  maxTokens?: number;
  seed?: number | null;
  tracker?: TokenTracker;
}): Promise<T> {
  const groq = getGroqClient();
  const primaryModel = options.model ?? GROQ_MODELS.REASONING;
  const modelsToTry = [
    primaryModel,
    GROQ_MODELS.REASONING,
    GROQ_MODELS.FAST,
    GROQ_MODELS.BACKUP_REASONING,
    GROQ_MODELS.BACKUP_FAST,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const openRouterFallback = async (): Promise<T | null> => {
    const res = await callOpenRouter({
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      responseFormatJson: true,
      seed: options.seed,
      tracker: options.tracker,
    });
    if (!res) return null;
    try {
      const cleanJson = extractJsonFromText(res.content);
      const parsed = JSON.parse(cleanJson);
      return options.schema.parse(parsed);
    } catch (parseErr) {
      logger.warn("failed to parse OpenRouter fallback JSON output", {
        error: String(parseErr),
        rawPreview: res.content.slice(0, 100),
      });
      return null;
    }
  };

  for (const model of modelsToTry) {
    try {
      return await withRateLimitRetry(
        async () => {
          const response = await groq.chat.completions.create({
            model,
            messages: options.messages,
            response_format: { type: "json_object" },
            temperature: options.temperature ?? 0.4,
            max_completion_tokens: options.maxTokens ?? 4096,
            ...(options.seed != null ? { seed: options.seed } : {}),
          });

          if (response.usage) {
            const inTokens = response.usage.prompt_tokens ?? 0;
            const outTokens = response.usage.completion_tokens ?? 0;
            if (options.tracker) {
              options.tracker.record(inTokens, outTokens);
            } else {
              recordTokenUsage(inTokens, outTokens);
            }
          }

          const raw = response.choices[0]?.message?.content;
          if (!raw) throw new Error("Empty response from Groq");

          const cleanJson = extractJsonFromText(raw);
          const parsed = JSON.parse(cleanJson);
          return options.schema.parse(parsed);
        },
        { model, operationName: "jsonCompletion", openRouterFallback }
      );
    } catch (err) {
      logger.warn("jsonCompletion model attempt failed, trying backup", {
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback to OpenRouter
  const openRouterResult = await openRouterFallback();
  if (openRouterResult !== null) {
    return openRouterResult;
  }

  throw new Error("Failed to produce valid JSON from completion across available models and providers");
}
