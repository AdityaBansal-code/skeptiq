import { GROQ_MODELS, jsonCompletion } from "./groq.js";
import { logger } from "../logger.js";
import { z } from "zod";

export const marketSourceSchema = z.object({
  query: z.string().default(""),
  snippet: z.string(),
  retrievedAt: z.string().default(() => new Date().toISOString()),
});
export type MarketSource = z.infer<typeof marketSourceSchema>;

export const marketContextSchema = z.object({
  topCompetitors: z.array(z.string()).default([]),
  typicalPricingModels: z.array(z.string()).default([]),
  knownPainPoints: z.array(z.string()).default([]),
  existingSubstitutesSummary: z.string().default(""),
  sources: z.array(marketSourceSchema).default([]),
  isClonedFromParent: z.boolean().default(false),
});

export type MarketContext = z.infer<typeof marketContextSchema>;

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

/**
 * Searches the web via zero-cost DuckDuckGo multi-endpoint fallbacks (HTML -> Lite -> API).
 */
async function searchWebSnippets(query: string): Promise<string[]> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
  const snippets: string[] = [];

  // Strategy 1: DuckDuckGo HTML
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const html = await res.text();
      const matches = html.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g) || [];
      for (const snippet of matches.slice(0, 5)) {
        const clean = snippet.replace(/<[^>]+>/g, "").trim();
        if (clean.length > 20) snippets.push(clean);
      }
      if (snippets.length > 0) return snippets;
    }
  } catch {
    // Proceed to next zero-cost strategy
  }

  // Strategy 2: DuckDuckGo Lite
  try {
    const liteUrl = `https://lite.duckduckgo.com/lite/`;
    const res = await fetch(liteUrl, {
      method: "POST",
      headers: {
        "User-Agent": ua,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const html = await res.text();
      const matches = html.match(/<td class="result-snippet">([\s\S]*?)<\/td>/g) || [];
      for (const snippet of matches.slice(0, 5)) {
        const clean = snippet.replace(/<[^>]+>/g, "").trim();
        if (clean.length > 20) snippets.push(clean);
      }
      if (snippets.length > 0) return snippets;
    }
  } catch {
    // Proceed to next zero-cost strategy
  }

  // Strategy 3: DuckDuckGo Instant Answer API
  try {
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.AbstractText && typeof data.AbstractText === "string" && data.AbstractText.length > 20) {
        snippets.push(data.AbstractText);
      }
      if (Array.isArray(data?.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 4)) {
          if (topic?.Text && typeof topic.Text === "string" && topic.Text.length > 20) {
            snippets.push(topic.Text);
          }
        }
      }
    }
  } catch {
    // Fall back to parametric search
  }

  return snippets;
}

/**
 * Executes Phase 0: Market Recon.
 * Gathers real competitors, pricing conventions, and existing substitutes.
 */
export async function performMarketRecon(ideaText: string): Promise<MarketContext> {
  const searchQuery = `${ideaText.slice(0, 80)} competitors alternatives pricing model`;
  logger.info("performing market recon", { searchQuery });

  const webSnippets = await searchWebSnippets(searchQuery);

  const prompt = `You are a venture capital market research analyst conducting competitive reconnaissance.
Analyze this startup product idea:
"${ideaText}"

${
  webSnippets.length > 0
    ? `Recent web search snippets about this space:\n${webSnippets.map((s, i) => `[${i + 1}] ${s}`).join("\n")}`
    : `(No live web snippets returned. Conduct an expert parametric competitive landscape evaluation using established industry benchmarks and incumbent products.)`
}

Identify:
1. "topCompetitors": 3 to 5 real or direct competitors/incumbents in this space (e.g. Notion, Linear, Peloton, Jira, Zapier, etc.).
2. "typicalPricingModels": 2 to 4 prevailing pricing structures (e.g. "$12/user/mo", "Freemium with usage tiers", "$299 upfront hardware").
3. "knownPainPoints": 2 to 4 major known complaints users have with existing solutions.
4. "existingSubstitutesSummary": 2-3 sentences explaining how potential customers currently solve this problem today without this new product.

Output strictly valid JSON matching this schema:
{
  "topCompetitors": ["string"],
  "typicalPricingModels": ["string"],
  "knownPainPoints": ["string"],
  "existingSubstitutesSummary": "string"
}`;

  try {
    const result = await jsonCompletion({
      model: GROQ_MODELS.FAST,
      messages: [{ role: "user", content: prompt }],
      schema: marketContextSchema,
      temperature: 0.3,
    });
    result.sources = webSnippets.map((s) => ({
      query: searchQuery,
      snippet: s,
      retrievedAt: new Date().toISOString(),
    }));
    return result;
  } catch (err) {
    logger.warn("market recon synthesis failed, returning default context", { error: String(err) });
    return {
      topCompetitors: ["Existing manual processes", "Generic spreadsheet tools"],
      typicalPricingModels: ["Subscription ($10 - $50/mo)", "Ad-supported free tier"],
      knownPainPoints: ["High manual effort", "Lack of specialized automation"],
      existingSubstitutesSummary: "Customers currently piece together spreadsheets and manual workarounds.",
      sources: webSnippets.map((s) => ({
        query: searchQuery,
        snippet: s,
        retrievedAt: new Date().toISOString(),
      })),
      isClonedFromParent: false,
    };
  }
}
