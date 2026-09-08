import { pool } from "../db.js";
import { logger } from "../logger.js";
import { performMarketRecon, type MarketContext } from "../ai/search.js";

export async function stepMarketRecon(
  jobId: string,
  ideaText: string,
  options?: { parentJobId?: string | null }
): Promise<MarketContext> {
  const parentJobId = options?.parentJobId;

  // If this is a pivot branch, reuse the parent's market context to ensure controlled A/B evaluation
  if (parentJobId) {
    try {
      const { rows } = await pool.query<{ market_context: MarketContext | string }>(
        `SELECT market_context FROM simulation_jobs WHERE id = $1`,
        [parentJobId]
      );
      if (rows[0]?.market_context) {
        const parentContext: MarketContext =
          typeof rows[0].market_context === "string"
            ? JSON.parse(rows[0].market_context)
            : rows[0].market_context;

        const clonedContext: MarketContext = {
          ...parentContext,
          isClonedFromParent: true,
        };

        await pool.query(
          `UPDATE simulation_jobs SET market_context = $1 WHERE id = $2`,
          [JSON.stringify(clonedContext), jobId]
        );

        logger.info("reused parent market context for isolated pivot A/B evaluation", {
          jobId,
          parentJobId,
          competitors: clonedContext.topCompetitors,
        });

        return clonedContext;
      }
    } catch (err) {
      logger.warn("failed to clone parent market context, performing fresh recon", {
        jobId,
        parentJobId,
        error: String(err),
      });
    }
  }

  logger.info("starting fresh market recon phase", { jobId });
  const marketContext = await performMarketRecon(ideaText);

  await pool.query(
    `UPDATE simulation_jobs SET market_context = $1 WHERE id = $2`,
    [JSON.stringify(marketContext), jobId]
  );

  logger.info("market recon phase completed", {
    jobId,
    competitors: marketContext.topCompetitors,
    pricing: marketContext.typicalPricingModels,
  });

  return marketContext;
}
