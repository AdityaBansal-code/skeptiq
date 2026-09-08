import { z } from "zod";

/**
 * Fail fast at boot if the environment is misconfigured. Every var the worker
 * reads goes through here — nothing else touches process.env directly.
 */
const envSchema = z.object({
  /** Postgres connection string for the Supabase project (direct / session pooler, port 5432). */
  DATABASE_URL: z.string().url(),
  /** How often to poll simulation_jobs for queued work. */
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Groq API Key for running multi-agent LLM inference. Free from https://console.groq.com */
  GROQ_API_KEY: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().min(1).optional()
  ),
  /** Optional OpenRouter API Key for free multi-provider model fallback. */
  OPENROUTER_API_KEY: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().min(1).optional()
  ),
});

export const env = envSchema.parse(process.env);
