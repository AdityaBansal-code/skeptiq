import type { JobStatus, AudiencePreset } from "@repo/shared";
import { pool } from "./db.js";

export interface ClaimedJob {
  id: string;
  ideaId: string;
  userId: string;
  mode: string;
  panelSize: number;
  segmentCount: number | null;
  rounds: number;
  debateLevel: string;
  audiencePreset: AudiencePreset;
  seed: number | null;
  webhookUrl: string | null;
  ideaText: string;
  parentJobId: string | null;
  branchLabel: string | null;
}

interface ClaimRow {
  id: string;
  idea_id: string;
  user_id: string;
  mode: string;
  panel_size: number;
  segment_count: number | null;
  rounds: number | null;
  debate_level: string | null;
  audience_preset: string | null;
  seed: number | null;
  webhook_url: string | null;
  raw_text: string;
  parent_job_id: string | null;
  branch_label: string | null;
}

/**
 * Atomically claim the oldest queued job. `for update ... skip locked` lets
 * multiple worker instances run safely with no broker (architecture §1): a row
 * another worker already locked is skipped rather than blocked on. The claim
 * and the status flip happen in one transaction so a job can't be double-run.
 * Returns null when the queue is empty.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<ClaimRow>(
      `select j.id, j.idea_id, j.user_id, j.mode, j.panel_size, j.segment_count,
              coalesce(j.rounds, 12) as rounds, coalesce(j.debate_level, 'standard') as debate_level,
              coalesce(j.audience_preset, 'general_consumer') as audience_preset,
              j.seed, j.webhook_url,
              j.parent_job_id, j.branch_label,
              i.raw_text
         from simulation_jobs j
         join ideas i on i.id = j.idea_id
        where j.status = 'queued'
        order by j.created_at
        limit 1
        for update of j skip locked`,
    );
    const row = rows[0];
    if (!row) {
      await client.query("commit");
      return null;
    }
    await client.query(
      `update simulation_jobs
          set status = 'generating_personas',
              started_at = now(),
              heartbeat_at = now(),
              attempt_count = coalesce(attempt_count, 0) + 1
        where id = $1`,
      [row.id],
    );
    await client.query("commit");
    return {
      id: row.id,
      ideaId: row.idea_id,
      userId: row.user_id,
      mode: row.mode,
      panelSize: row.panel_size,
      segmentCount: row.segment_count,
      rounds: row.rounds ?? 12,
      debateLevel: row.debate_level ?? "standard",
      audiencePreset: (row.audience_preset as AudiencePreset) || "general_consumer",
      seed: row.seed ?? null,
      webhookUrl: row.webhook_url ?? null,
      ideaText: row.raw_text,
      parentJobId: row.parent_job_id,
      branchLabel: row.branch_label,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function touchHeartbeat(jobId: string): Promise<void> {
  await pool.query(`update simulation_jobs set heartbeat_at = now() where id = $1`, [jobId]);
}

export async function reapStaleJobs(): Promise<number> {
  const { rowCount } = await pool.query(`
    update simulation_jobs
       set status = case when attempt_count < 3 then 'queued' else 'failed' end,
           error = case when attempt_count >= 3 then 'Simulation timed out after 3 unhandled crash recovery attempts.' else error end,
           completed_at = case when attempt_count >= 3 then now() else completed_at end,
           started_at = case when attempt_count < 3 then null else started_at end,
           heartbeat_at = case when attempt_count < 3 then null else heartbeat_at end
     where status not in ('queued', 'completed', 'failed')
       and (
         (heartbeat_at is null and (started_at is null or started_at < now() - interval '3 minutes'))
         or heartbeat_at < now() - interval '4 minutes'
         or heartbeat_at > now() + interval '1 minute'
       )
  `);
  return rowCount ?? 0;
}

export async function addJobTokens(jobId: string, inputTokens: number, outputTokens: number): Promise<void> {
  if (inputTokens === 0 && outputTokens === 0) return;
  await pool.query(
    `update simulation_jobs
        set input_tokens = input_tokens + $2,
            output_tokens = output_tokens + $3
      where id = $1`,
    [jobId, inputTokens, outputTokens]
  );
}

export async function recordStageCheckpoint(
  jobId: string,
  stage: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  await pool.query(
    `UPDATE simulation_jobs
        SET current_stage = $2,
            stage_checkpoints = stage_checkpoints || $3::jsonb,
            heartbeat_at = now()
      WHERE id = $1`,
    [jobId, stage, JSON.stringify({ [stage]: { completedAt: new Date().toISOString(), ...metadata } })]
  );
}

export async function getStageCheckpoints(jobId: string): Promise<Record<string, any>> {
  const { rows } = await pool.query<{ stage_checkpoints: Record<string, any> | string }>(
    `SELECT coalesce(stage_checkpoints, '{}'::jsonb) as stage_checkpoints FROM simulation_jobs WHERE id = $1`,
    [jobId]
  );
  const raw = rows[0]?.stage_checkpoints;
  if (!raw) return {};
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function cleanStageArtifacts(jobId: string, stage: string): Promise<void> {
  if (stage === "market_recon") {
    await pool.query(`UPDATE simulation_jobs SET market_context = NULL WHERE id = $1`, [jobId]);
  } else if (stage === "generating_personas") {
    await pool.query(`DELETE FROM cross_examinations WHERE job_id = $1`, [jobId]);
    await pool.query(`DELETE FROM turns WHERE job_id = $1`, [jobId]);
    await pool.query(`DELETE FROM clusters WHERE job_id = $1`, [jobId]);
    await pool.query(`DELETE FROM reports WHERE job_id = $1`, [jobId]);
    await pool.query(`DELETE FROM personas WHERE job_id = $1`, [jobId]);
  } else if (stage === "independent_phase") {
    await pool.query(`DELETE FROM turns WHERE job_id = $1 AND phase = 'independent'`, [jobId]);
    await pool.query(`UPDATE personas SET status = 'pending' WHERE job_id = $1`, [jobId]);
  } else if (stage === "clustering") {
    await pool.query(`UPDATE personas SET cluster_id = NULL WHERE job_id = $1`, [jobId]);
    await pool.query(`DELETE FROM clusters WHERE job_id = $1`, [jobId]);
  } else if (stage === "crosstalk_phase") {
    await pool.query(`DELETE FROM turns WHERE job_id = $1 AND phase = 'crosstalk'`, [jobId]);
  } else if (stage === "synthesizing") {
    await pool.query(`DELETE FROM reports WHERE job_id = $1`, [jobId]);
  }
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const { rows } = await pool.query<{ status: string; error: string | null }>(
    `select status, error from simulation_jobs where id = $1`,
    [jobId]
  );
  const row = rows[0];
  if (!row) return true;
  return row.status === "failed" && (row.error?.toLowerCase().includes("cancel") ?? false);
}

export async function setJobStatus(jobId: string, status: JobStatus): Promise<void> {
  await pool.query(
    `update simulation_jobs set status = $2, current_stage = $2, heartbeat_at = now() where id = $1`,
    [jobId, status]
  );
}

export async function completeJob(jobId: string): Promise<void> {
  await pool.query(
    `update simulation_jobs set status = 'completed', current_stage = 'completed', completed_at = now(), heartbeat_at = now() where id = $1`,
    [jobId],
  );
}

export async function failJob(jobId: string, message: string): Promise<void> {
  await pool.query(
    `update simulation_jobs set status = 'failed', current_stage = 'failed', error = $2, completed_at = now(), heartbeat_at = now() where id = $1`,
    [jobId, message.slice(0, 2000)],
  );
}
