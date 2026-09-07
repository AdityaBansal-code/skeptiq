import "./loadEnv.js"; // must be first — populates process.env before ./env.ts runs

import { claimNextJob, completeJob, failJob } from "./claimJob.js";
import { pool } from "./db.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { runSimulation } from "./runSimulation.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let shuttingDown = false;

async function tick(): Promise<void> {
  const job = await claimNextJob();
  if (!job) return;

  logger.info("job claimed", { jobId: job.id, mode: job.mode, panelSize: job.panelSize });
  const startedAt = Date.now();
  try {
    await runSimulation(job);
    await completeJob(job.id);
    logger.info("job completed", { jobId: job.id, durationMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, message);
    logger.error("job failed", { jobId: job.id, error: message, durationMs: Date.now() - startedAt });
  }
}

async function main(): Promise<void> {
  logger.info("worker started", { pollIntervalMs: env.WORKER_POLL_INTERVAL_MS });
  while (!shuttingDown) {
    try {
      await tick();
    } catch (err) {
      // A failure in the claim/poll path itself (e.g. DB blip) — log and keep going.
      const message = err instanceof Error ? err.message : String(err);
      const hint = /ENOTFOUND|ENETUNREACH/.test(message)
        ? "DNS/route failure — if this is db.<ref>.supabase.co, that host is IPv6-only; use the Session pooler connection string instead."
        : undefined;
      logger.error("tick error", { error: message, ...(hint ? { hint } : {}) });
    }
    if (!shuttingDown) await sleep(env.WORKER_POLL_INTERVAL_MS);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    void pool.end().then(() => process.exit(0));
  });
}

main().catch((err) => {
  logger.error("fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
