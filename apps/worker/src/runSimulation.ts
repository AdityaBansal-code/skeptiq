import { PIPELINE_PHASES } from "@repo/shared";
import { setJobStatus, type ClaimedJob } from "./claimJob.js";
import { logger } from "./logger.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ── PHASE 1 STUB ────────────────────────────────────────────────────────────
 * Walks a claimed job through every pipeline phase with no real work, writing
 * `status` at each step so the full plumbing path — worker → Postgres →
 * Supabase Realtime → live UI — can be proven end to end before any LLM code
 * exists (phase-wise-project-plan.md Phase 1 exit criteria).
 *
 * Phase 2 replaces the body with the real pipeline:
 *   generatePersonas → independentReaction (parallel) → cluster →
 *   crossTalk (sequential in cluster, parallel across) → synthesize
 * writing personas / turns / clusters / reports rows as each step completes.
 */
export async function runSimulation(job: ClaimedJob): Promise<void> {
  for (const phase of PIPELINE_PHASES) {
    // claimNextJob already set 'generating_personas'.
    if (phase !== "generating_personas") {
      await setJobStatus(job.id, phase);
      logger.info("phase transition", { jobId: job.id, phase });
    }
    await sleep(750);
  }
}
