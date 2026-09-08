import { z } from "zod";
import { jsonCompletion, GROQ_MODELS, TokenTracker } from "../ai/groq.js";
import { embedText } from "../ai/embedding.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import { touchHeartbeat } from "../claimJob.js";
import type { PersonaRecord } from "./1-generatePersonas.js";
import type { VanWestendorpPricing } from "@repo/shared";

export interface IndependentReaction {
  turnId: string;
  personaId: string;
  personaName: string;
  content: string;
  embedding: number[];
  pricing?: VanWestendorpPricing;
  privateReservation?: string;
}

export interface IndependentReactionsResult {
  reactions: IndependentReaction[];
  activePersonas: PersonaRecord[];
}

const reactionPayloadSchema = z.object({
  publicReaction: z.string().min(1),
  primaryObjection: z.string().min(1),
  privateReservation: z.string().default(""),
  pricing: z.object({
    tooCheap: z.number().min(0),
    bargain: z.number().min(0),
    expensive: z.number().min(0),
    tooExpensive: z.number().min(0),
    currency: z.string().default("USD"),
  }),
});

export function inferJobCurrency(ideaText: string): string {
  if (/₹|INR|rupee|lakh|crore/i.test(ideaText)) return "INR";
  if (/€|EUR|euro/i.test(ideaText)) return "EUR";
  if (/£|GBP|pound/i.test(ideaText)) return "GBP";
  if (/\$|USD|dollar/i.test(ideaText)) return "USD";
  return "USD";
}

export async function runIndependentReactions(
  jobId: string,
  ideaText: string,
  personas: PersonaRecord[],
  options?: {
    seed?: number | null;
    tracker?: TokenTracker;
  }
): Promise<IndependentReactionsResult> {
  const targetCurrency = inferJobCurrency(ideaText);
  logger.info("running independent reactions with PSM modeling", {
    jobId,
    personaCount: personas.length,
    canonicalCurrency: targetCurrency,
  });

  const reactions: IndependentReaction[] = [];
  // Sequential evaluation ensures steady pacing without burst spikes
  const CONCURRENCY_LIMIT = 1;

  for (let i = 0; i < personas.length; i += CONCURRENCY_LIMIT) {
    const chunk = personas.slice(i, i + CONCURRENCY_LIMIT);

    const chunkPromises = chunk.map(async (persona) => {
      try {
        const userPrompt = `Here is a proposed product / business idea being pitched to you:
"""
${ideaText}
"""

As ${persona.profile.name} (${persona.profile.archetype}), evaluate this proposition honestly.
Provide your candid evaluation and Van Westendorp Price Sensitivity points in JSON:
{
  "publicReaction": "2-3 candid sentences on whether you would personally use/buy this and why.",
  "primaryObjection": "Your single biggest objection or friction point.",
  "privateReservation": "Your private, unvoiced doubt or hidden switching barrier.",
  "pricing": {
    "tooCheap": number (Price so low you would suspect poor quality or a gimmick in ${targetCurrency}),
    "bargain": number (Price that feels like a great bargain/deal you'd happily pay in ${targetCurrency}),
    "expensive": number (Price getting expensive, but you would still consider it in ${targetCurrency}),
    "tooExpensive": number (Price so high you would reject it immediately in ${targetCurrency}),
    "currency": "${targetCurrency}" (All pricing numbers MUST be in ${targetCurrency})
  }
}`;

        const payload = await jsonCompletion({
          model: GROQ_MODELS.FAST,
          messages: [
            { role: "system", content: persona.system_prompt },
            { role: "user", content: userPrompt },
          ],
          schema: reactionPayloadSchema,
          temperature: 0.6,
          seed: options?.seed,
          tracker: options?.tracker,
        });

        const rawPricing = payload.pricing;
        const sortedPrices = [
          rawPricing.tooCheap,
          rawPricing.bargain,
          rawPricing.expensive,
          rawPricing.tooExpensive,
        ]
          .map((v) => Math.max(0, Number(v) || 0))
          .sort((a, b) => a - b);

        const sanitizedPricing: VanWestendorpPricing = {
          tooCheap: sortedPrices[0] ?? 0,
          bargain: sortedPrices[1] ?? sortedPrices[0] ?? 0,
          expensive: sortedPrices[2] ?? sortedPrices[1] ?? 0,
          tooExpensive: sortedPrices[3] ?? sortedPrices[2] ?? 0,
          currency: targetCurrency,
        };

        const formattedContent = `${payload.publicReaction}\n\nCore Objection: ${payload.primaryObjection}`;

        // Compute local ONNX embedding ($0 cost, fast)
        const embedding = await embedText(formattedContent);

        // Store into turns table immediately for live stream
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO turns (job_id, persona_id, phase, round_number, content, embedding)
           VALUES ($1, $2, 'independent', 0, $3, $4)
           RETURNING id`,
          [jobId, persona.id, formattedContent, JSON.stringify(embedding)]
        );

        const inserted = rows[0];
        if (!inserted) throw new Error("Insert turn failed");

        await pool.query(
          `UPDATE personas SET status = 'reacted' WHERE id = $1`,
          [persona.id]
        );

        logger.info("independent reaction recorded", {
          jobId,
          personaId: persona.id,
          personaName: persona.profile.name,
        });

        return {
          turnId: inserted.id,
          personaId: persona.id,
          personaName: persona.profile.name,
          content: formattedContent,
          embedding,
          pricing: sanitizedPricing,
          privateReservation: payload.privateReservation,
        };
      } catch (err) {
        logger.error("persona reaction failed", {
          jobId,
          personaId: persona.id,
          error: err instanceof Error ? err.message : String(err),
        });
        await pool.query(
          `UPDATE personas SET status = 'failed' WHERE id = $1`,
          [persona.id]
        );
        return null;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    for (const res of chunkResults) {
      if (res) reactions.push(res);
    }
    await touchHeartbeat(jobId);
  }

  // Ensure we have a critical mass of reactions
  const minRequired = Math.ceil(personas.length * 0.5);
  if (reactions.length < minRequired) {
    throw new Error(
      `Insufficient reactions gathered: ${reactions.length}/${personas.length} completed (minimum required: ${minRequired}). Aborting to prevent biased synthesis.`
    );
  }

  const activePersonaIds = new Set(reactions.map((r) => r.personaId));
  const activePersonas = personas.filter((p) => activePersonaIds.has(p.id));

  logger.info("independent reactions completed", {
    jobId,
    successfulReactions: reactions.length,
    activePersonas: activePersonas.length,
    totalPersonas: personas.length,
  });

  return { reactions, activePersonas };
}
