import {
  addJobTokens,
  cleanStageArtifacts,
  isJobCancelled,
  recordStageCheckpoint,
  setJobStatus,
  touchHeartbeat,
  type ClaimedJob,
} from "./claimJob.js";
import { JOB_STATUSES, type JobStatus } from "@repo/shared";
import { TokenTracker } from "./ai/groq.js";
import { logger } from "./logger.js";
import { notifyJobCompletion } from "./notify/email.js";
import { dispatchSignedWebhook } from "./notify/webhook.js";
import { stepMarketRecon } from "./pipeline/0-marketRecon.js";
import { clonePersonasFromParent, generatePersonas } from "./pipeline/1-generatePersonas.js";
import { runIndependentReactions } from "./pipeline/2-independentReactions.js";
import { runClustering } from "./pipeline/3-clustering.js";
import { runCrossTalk } from "./pipeline/4-crossTalk.js";
import { synthesizeReport } from "./pipeline/5-synthesizeReport.js";

/**
 * ── FULL MULTI-AGENT SIMULATION PIPELINE ────────────────────────────────────
 */
export async function runSimulation(job: ClaimedJob): Promise<void> {
  const mode = (job.mode as "segmentation" | "consensus") || "segmentation";

  logger.info("starting simulation pipeline", {
    jobId: job.id,
    mode,
    panelSize: job.panelSize,
    rounds: job.rounds,
    debateLevel: job.debateLevel,
    audiencePreset: job.audiencePreset,
    seed: job.seed,
    hasWebhook: !!job.webhookUrl,
    isBranch: !!job.parentJobId,
  });

  const tokenTracker = new TokenTracker();

  async function checkCancellation(): Promise<void> {
    if (await isJobCancelled(job.id)) {
      throw new Error("Simulation was cancelled by user.");
    }
  }

  async function flushTokens(): Promise<void> {
    const { inputTokens, outputTokens } = tokenTracker.consume();
    if (inputTokens > 0 || outputTokens > 0) {
      await addJobTokens(job.id, inputTokens, outputTokens);
    }
  }

  // Helper to execute a stage with automatic cleanup, transient retry, and checkpointing
  async function runStage<T>(
    stageName: string,
    action: () => Promise<T>,
    jobStatus?: JobStatus,
    retryCount = 2
  ): Promise<T> {
    await checkCancellation();
    const statusToSet = jobStatus || (JOB_STATUSES.includes(stageName as any) ? (stageName as JobStatus) : null);
    if (statusToSet) {
      await setJobStatus(job.id, statusToSet);
    }

    for (let attempt = 1; attempt <= retryCount + 1; attempt++) {
      try {
        await cleanStageArtifacts(job.id, stageName);
        const result = await action();
        await touchHeartbeat(job.id);
        await flushTokens();
        await recordStageCheckpoint(job.id, stageName);
        return result;
      } catch (err) {
        const isLastAttempt = attempt > retryCount;
        logger.warn(`stage ${stageName} error on attempt ${attempt}/${retryCount + 1}`, {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });

        if (isLastAttempt) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    throw new Error(`Stage ${stageName} failed after ${retryCount + 1} attempts`);
  }

  // Start background heartbeat interval to signal liveness
  const heartbeatTimer = setInterval(() => {
    void touchHeartbeat(job.id).catch((err) => {
      logger.warn("heartbeat update error", { jobId: job.id, error: String(err) });
    });
  }, 15_000);

  try {
    // Step 0: Market Reconnaissance (reusing parent snapshot if pivot branch)
    const marketContext = await runStage(
      "market_recon",
      async () => {
        return await stepMarketRecon(job.id, job.ideaText, { parentJobId: job.parentJobId });
      },
      "generating_personas"
    );

    // Step 1: Personas (Cohort Cloning if branching, else generation)
    const personas = await runStage("generating_personas", async () => {
      if (job.parentJobId) {
        logger.info("job has parent_job_id, cloning persona cohort from parent", {
          parentJobId: job.parentJobId,
          branchLabel: job.branchLabel,
        });
        return await clonePersonasFromParent(job.id, job.parentJobId);
      } else {
        return await generatePersonas(job.id, job.ideaText, job.panelSize, {
          marketContext,
          audiencePreset: job.audiencePreset,
          seed: job.seed,
          tracker: tokenTracker,
        });
      }
    });

    // Step 2: Independent Reactions (with canonical currency & PSM pricing)
    const { reactions, activePersonas } = await runStage("independent_phase", async () => {
      return await runIndependentReactions(job.id, job.ideaText, personas, {
        seed: job.seed,
        tracker: tokenTracker,
      });
    });

    // Step 3: Semantic Clustering (or Alignment Mapping in consensus mode)
    const clusters = await runStage("clustering", async () => {
      return await runClustering(
        job.id,
        job.ideaText,
        activePersonas,
        reactions,
        job.segmentCount
      );
    });

    // Step 4: Scalable Cross-Talk Debate (or Delphi Consensus Deliberation)
    const crossTalkTurns = await runStage("crosstalk_phase", async () => {
      return await runCrossTalk(
        job.id,
        job.ideaText,
        activePersonas,
        reactions,
        clusters,
        {
          mode,
          targetRounds: job.rounds ?? 12,
          marketContext,
          seed: job.seed,
          tracker: tokenTracker,
        }
      );
    });

    // Step 5: Synthesis & Report Generation (with PSM, Action Plan & Citations)
    const report = await runStage("synthesizing", async () => {
      return await synthesizeReport(
        job.id,
        job.ideaText,
        activePersonas,
        clusters,
        reactions,
        crossTalkTurns,
        {
          mode,
          parentJobId: job.parentJobId,
          seed: job.seed,
          tracker: tokenTracker,
        }
      );
    });

    // Step 6: Dispatch completion notification to user
    await notifyJobCompletion({
      jobId: job.id,
      userId: job.userId,
      ideaText: job.ideaText,
      report,
    });

    // Step 7: Trigger SSRF-guarded Webhook if configured
    if (job.webhookUrl) {
      await dispatchSignedWebhook(job.webhookUrl, {
        event: "simulation.completed",
        jobId: job.id,
        status: "completed",
        mode,
        headline: report.headline,
        adoptionRange: { low: report.overallAdoptionLow, high: report.overallAdoptionHigh },
        priceSensitivity: report.priceSensitivity,
        actionPlan: report.actionPlan,
        consensusMetrics: report.consensusMetrics,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info("simulation pipeline finished", { jobId: job.id });
  } catch (err) {
    if (job.webhookUrl) {
      void dispatchSignedWebhook(job.webhookUrl, {
        event: "simulation.failed",
        jobId: job.id,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
    throw err;
  } finally {
    clearInterval(heartbeatTimer);
    try {
      await flushTokens();
    } catch {
      // ignore
    }
  }
}
