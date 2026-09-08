import pg from "pg";
import { env } from "./env.js";

const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(env.DATABASE_URL);

/**
 * Single long-lived pool. The worker connects as the postgres/service role,
 * which bypasses RLS — every query here runs with full table access, so the
 * worker code itself is the authorization boundary.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  statement_timeout: 30_000,
  query_timeout: 30_000,
});

pool.on("error", (err) => {
  process.stderr.write(`[pg pool error] ${err instanceof Error ? err.message : String(err)}\n`);
});

/**
 * Ensures any optional newer columns and tables exist automatically.
 */
export async function ensureSchemaUpgrades(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE simulation_jobs 
        ADD COLUMN IF NOT EXISTS rounds int DEFAULT 12,
        ADD COLUMN IF NOT EXISTS debate_level text DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS share_token text UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
        ADD COLUMN IF NOT EXISTS market_context jsonb,
        ADD COLUMN IF NOT EXISTS parent_job_id uuid REFERENCES simulation_jobs(id),
        ADD COLUMN IF NOT EXISTS branch_label text,
        ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz DEFAULT now(),
        ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS audience_preset text DEFAULT 'general_consumer',
        ADD COLUMN IF NOT EXISTS seed int,
        ADD COLUMN IF NOT EXISTS webhook_url text,
        ADD COLUMN IF NOT EXISTS current_stage text DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS stage_checkpoints jsonb DEFAULT '{}'::jsonb;

      UPDATE simulation_jobs 
        SET share_token = encode(gen_random_bytes(12), 'hex') 
        WHERE share_token IS NULL;

      CREATE TABLE IF NOT EXISTS cross_examinations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id uuid NOT NULL REFERENCES simulation_jobs(id) ON DELETE CASCADE,
        persona_id uuid REFERENCES personas(id) ON DELETE SET NULL,
        question text NOT NULL,
        answer text NOT NULL,
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_cross_examinations_job ON cross_examinations(job_id);
      CREATE INDEX IF NOT EXISTS idx_simulation_jobs_heartbeat ON simulation_jobs(heartbeat_at);

      CREATE OR REPLACE FUNCTION create_simulation_job_atomic(
        p_user_id uuid,
        p_raw_text text,
        p_mode text,
        p_panel_size int,
        p_segment_count int DEFAULT NULL,
        p_rounds int DEFAULT 12,
        p_debate_level text DEFAULT 'standard',
        p_audience_preset text DEFAULT 'general_consumer',
        p_seed int DEFAULT NULL,
        p_webhook_url text DEFAULT NULL,
        p_parent_job_id uuid DEFAULT NULL,
        p_branch_label text DEFAULT NULL
      ) RETURNS uuid 
      LANGUAGE plpgsql 
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      DECLARE
        v_caller_id uuid;
        v_active_count int;
        v_idea_id uuid;
        v_job_id uuid;
      BEGIN
        -- 1. Authorization check
        v_caller_id := auth.uid();
        IF v_caller_id IS NOT NULL AND v_caller_id <> p_user_id AND auth.role() <> 'service_role' THEN
          RAISE EXCEPTION 'Unauthorized: Cannot create simulation job on behalf of another user.';
        END IF;

        -- 2. Validate parent job ownership
        IF p_parent_job_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM simulation_jobs 
            WHERE id = p_parent_job_id AND (user_id = p_user_id OR v_caller_id IS NULL)
          ) THEN
            RAISE EXCEPTION 'Invalid parent job: You do not own or have access to parent job %.', p_parent_job_id;
          END IF;
        END IF;

        -- 3. Enforce concurrency limit
        SELECT count(*) INTO v_active_count
        FROM simulation_jobs
        WHERE user_id = p_user_id
          AND status NOT IN ('completed', 'failed');
          
        IF v_active_count >= 2 THEN
          RAISE EXCEPTION 'Concurrency limit reached: you already have % active or queued simulation(s). Maximum allowed is 2.', v_active_count;
        END IF;
        
        -- 4. Insert idea
        INSERT INTO ideas (user_id, raw_text)
        VALUES (p_user_id, p_raw_text)
        RETURNING id INTO v_idea_id;
        
        -- 5. Insert job
        INSERT INTO simulation_jobs (
          idea_id, user_id, mode, panel_size, segment_count,
          rounds, debate_level, audience_preset, seed, webhook_url,
          parent_job_id, branch_label, status, current_stage, stage_checkpoints
        ) VALUES (
          v_idea_id, p_user_id, p_mode, p_panel_size, p_segment_count,
          p_rounds, p_debate_level, p_audience_preset, p_seed, p_webhook_url,
          p_parent_job_id, p_branch_label, 'queued', 'pending', '{}'::jsonb
        ) RETURNING id INTO v_job_id;
        
        RETURN v_job_id;
      END;
      $$;

      REVOKE ALL ON FUNCTION create_simulation_job_atomic FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION create_simulation_job_atomic TO authenticated, service_role;
    `);
  } catch (err) {
    process.stderr.write(`[db schema upgrade notice] ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
