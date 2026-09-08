"use server";

import { redirect } from "next/navigation";
import { createJobInputSchema, DEBATE_LEVELS, type DebateLevel, type AudiencePreset } from "@repo/shared";
import { createClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";

export interface CreateJobState {
  ok: boolean;
  error?: string;
}

/**
 * Pings the background worker health endpoint (if configured) to wake it up on Render/serverless hosts.
 */
function wakeWorkerIfNeeded(): void {
  const workerUrl = process.env.WORKER_HEALTH_URL || process.env.NEXT_PUBLIC_WORKER_URL;
  if (!workerUrl) return;
  try {
    const url = workerUrl.endsWith("/health") ? workerUrl : `${workerUrl.replace(/\/+$/, "")}/health`;
    void fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(3500),
    }).catch(() => {
      // Best-effort background ping; do not block user flow
    });
  } catch {
    // Ignore error
  }
}

/**
 * Server action behind the homepage form: validate → call atomic Postgres stored procedure →
 * redirect to the live job page. Runs in a single atomic transaction.
 */
export async function createJobAction(
  _prev: CreateJobState,
  formData: FormData
): Promise<CreateJobState> {
  const debateLevelRaw = (formData.get("debateLevel") as DebateLevel) || "standard";
  const rounds = DEBATE_LEVELS[debateLevelRaw]?.rounds ?? 12;
  const audiencePresetRaw = (formData.get("audiencePreset") as AudiencePreset) || "general_consumer";
  const seedRaw = formData.get("seed") ? Number(formData.get("seed")) : null;
  const webhookUrlRaw = (formData.get("webhookUrl") as string)?.trim() || null;

  const parsed = createJobInputSchema.safeParse({
    ideaText: formData.get("ideaText"),
    config: {
      mode: formData.get("mode") || "segmentation",
      panelSize: Number(formData.get("panelSize") || 6),
      debateLevel: debateLevelRaw,
      rounds,
      audiencePreset: audiencePresetRaw,
      seed: seedRaw,
      webhookUrl: webhookUrlRaw,
      segmentCount: null,
    },
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input parameters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let jobId: string;
  try {
    const { rows } = await pool.query<{ create_simulation_job_atomic: string }>(
      `SELECT create_simulation_job_atomic($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        user.id,
        parsed.data.ideaText,
        parsed.data.config.mode,
        parsed.data.config.panelSize,
        parsed.data.config.segmentCount,
        parsed.data.config.rounds,
        parsed.data.config.debateLevel,
        parsed.data.config.audiencePreset,
        parsed.data.config.seed,
        parsed.data.config.webhookUrl,
        null, // p_parent_job_id
        null, // p_branch_label
      ]
    );

    const createdId = rows[0]?.create_simulation_job_atomic;
    if (!createdId) throw new Error("Job creation failed to return an ID");
    jobId = createdId;
    wakeWorkerIfNeeded();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("createJobAction error:", errMsg);
    if (errMsg.includes("Concurrency limit reached")) {
      return {
        ok: false,
        error: "You already have 2 active or queued simulations. Please wait for one to finish.",
      };
    }
    return { ok: false, error: "Could not create simulation job. Please try again." };
  }

  redirect(`/jobs/${jobId}`);
}

export async function createQuickSimulationAction(
  formData: FormData
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  const parsed = createJobInputSchema.safeParse({
    ideaText: formData.get("rawText") || formData.get("ideaText"),
    config: {
      mode: formData.get("mode") || "segmentation",
      panelSize: Number(formData.get("panelSize") || 6),
      debateLevel: formData.get("debateLevel") || "standard",
      rounds: Number(formData.get("rounds") || 12),
      audiencePreset: formData.get("audiencePreset") || "general_consumer",
      seed: formData.get("seed") ? Number(formData.get("seed")) : null,
      webhookUrl: (formData.get("webhookUrl") as string)?.trim() || null,
      segmentCount: null,
    },
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input parameters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const { rows } = await pool.query<{ create_simulation_job_atomic: string }>(
      `SELECT create_simulation_job_atomic($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        user.id,
        parsed.data.ideaText,
        parsed.data.config.mode,
        parsed.data.config.panelSize,
        parsed.data.config.segmentCount,
        parsed.data.config.rounds,
        parsed.data.config.debateLevel,
        parsed.data.config.audiencePreset,
        parsed.data.config.seed,
        parsed.data.config.webhookUrl,
        null,
        null,
      ]
    );

    const createdId = rows[0]?.create_simulation_job_atomic;
    if (!createdId) throw new Error("Failed to create simulation job.");
    wakeWorkerIfNeeded();
    return { ok: true, jobId: createdId };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("Concurrency limit reached")) {
      return {
        ok: false,
        error: "You already have 2 active or queued simulations. Please wait for one to finish.",
      };
    }
    return { ok: false, error: "Could not create simulation job. Please try again." };
  }
}

export async function branchJobAction(
  _prev: CreateJobState,
  formData: FormData
): Promise<CreateJobState> {
  const parentJobId = formData.get("parentJobId") as string;
  const ideaText = formData.get("ideaText") as string;
  const branchLabel = (formData.get("branchLabel") as string) || "Pivot Test";
  const debateLevelRaw = (formData.get("debateLevel") as DebateLevel) || "standard";
  const rounds = DEBATE_LEVELS[debateLevelRaw]?.rounds ?? 12;

  if (!parentJobId || !ideaText?.trim()) {
    return { ok: false, error: "Missing parent job or idea description." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let jobId: string;
  try {
    // 1. Fetch parent job config
    const parentRes = await pool.query<{ mode: string; panel_size: number; audience_preset: string }>(
      `SELECT mode, panel_size, coalesce(audience_preset, 'general_consumer') as audience_preset
       FROM simulation_jobs
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [parentJobId, user.id]
    );

    const parentJob = parentRes.rows[0];
    if (!parentJob) {
      return { ok: false, error: "Parent simulation not found or access denied." };
    }

    const { rows } = await pool.query<{ create_simulation_job_atomic: string }>(
      `SELECT create_simulation_job_atomic($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        user.id,
        ideaText.trim(),
        parentJob.mode,
        parentJob.panel_size,
        null,
        rounds,
        debateLevelRaw,
        parentJob.audience_preset,
        null,
        null,
        parentJobId,
        branchLabel.trim(),
      ]
    );

    const createdId = rows[0]?.create_simulation_job_atomic;
    if (!createdId) throw new Error("Branch creation failed to return an ID");
    jobId = createdId;
    wakeWorkerIfNeeded();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("branchJobAction error:", errMsg);
    if (errMsg.includes("Concurrency limit reached")) {
      return {
        ok: false,
        error: "You already have 2 active or queued simulations. Please wait for one to finish.",
      };
    }
    return { ok: false, error: "Could not queue branched run. Please try again." };
  }

  redirect(`/jobs/${jobId}`);
}

export async function cancelJobAction(jobId: string): Promise<{ ok: boolean; error?: string }> {
  if (!jobId) return { ok: false, error: "Missing jobId." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const { rowCount } = await pool.query(
      `UPDATE simulation_jobs
       SET status = 'failed',
           error = 'Simulation was cancelled by user.',
           completed_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND status NOT IN ('completed', 'failed')`,
      [jobId, user.id]
    );

    if (rowCount === 0) {
      return { ok: false, error: "Job could not be cancelled or was already finished." };
    }

    return { ok: true };
  } catch (err) {
    console.error("cancelJobAction error:", err);
    return { ok: false, error: "Failed to cancel simulation." };
  }
}
