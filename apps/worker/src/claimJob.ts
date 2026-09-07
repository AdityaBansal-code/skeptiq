import type { JobStatus } from "@repo/shared";
import { pool } from "./db.js";

export interface ClaimedJob {
  id: string;
  ideaId: string;
  userId: string;
  mode: string;
  panelSize: number;
  segmentCount: number | null;
  ideaText: string;
}

interface ClaimRow {
  id: string;
  idea_id: string;
  user_id: string;
  mode: string;
  panel_size: number;
  segment_count: number | null;
  raw_text: string;
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
      `select j.id, j.idea_id, j.user_id, j.mode, j.panel_size, j.segment_count, i.raw_text
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
      `update simulation_jobs set status = 'generating_personas', started_at = now() where id = $1`,
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
      ideaText: row.raw_text,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function setJobStatus(jobId: string, status: JobStatus): Promise<void> {
  await pool.query(`update simulation_jobs set status = $2 where id = $1`, [jobId, status]);
}

export async function completeJob(jobId: string): Promise<void> {
  await pool.query(
    `update simulation_jobs set status = 'completed', completed_at = now() where id = $1`,
    [jobId],
  );
}

export async function failJob(jobId: string, message: string): Promise<void> {
  await pool.query(
    `update simulation_jobs set status = 'failed', error = $2, completed_at = now() where id = $1`,
    [jobId, message.slice(0, 2000)],
  );
}
