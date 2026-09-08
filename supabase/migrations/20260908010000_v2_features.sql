-- 20260908010000_v2_features
-- Phase 3 enhancements: Audience presets, deterministic seed, webhook dispatch,
-- tightened RLS security policies, stage checkpoints, and hardened atomic job creation.

-- ── simulation_jobs additions ────────────────────────────────────────────────
alter table simulation_jobs
  add column if not exists audience_preset text default 'general_consumer',
  add column if not exists seed            int,
  add column if not exists webhook_url     text,
  add column if not exists current_stage   text,
  add column if not exists stage_checkpoints jsonb default '{}'::jsonb;

-- ── Tighten Public Share RLS Policies ─────────────────────────────────────────
-- Drop overly broad public policies that allowed enumerating any job with a non-null token.
-- Public access is securely served via server-side queries matching the exact share token.
drop policy if exists "jobs: public share token reads" on simulation_jobs;
drop policy if exists "personas: public share token reads" on personas;
drop policy if exists "turns: public share token reads" on turns;
drop policy if exists "reports: public share token reads" on reports;
drop policy if exists "cross_examinations: public share token reads" on cross_examinations;

-- ── Hardened Atomic Job Creation Stored Procedure ────────────────────────────
create or replace function create_simulation_job_atomic(
  p_user_id uuid,
  p_raw_text text,
  p_mode text,
  p_panel_size int,
  p_segment_count int default null,
  p_rounds int default 12,
  p_debate_level text default 'standard',
  p_audience_preset text default 'general_consumer',
  p_seed int default null,
  p_webhook_url text default null,
  p_parent_job_id uuid default null,
  p_branch_label text default null
) returns uuid 
language plpgsql 
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_active_count int;
  v_idea_id uuid;
  v_job_id uuid;
begin
  -- 1. Verify Caller Authorization: caller must match p_user_id (or be service_role)
  v_caller_id := auth.uid();
  if v_caller_id is not null and v_caller_id <> p_user_id and auth.role() <> 'service_role' then
    raise exception 'Unauthorized: Cannot create simulation job on behalf of another user.';
  end if;

  -- 2. Validate Parent Job Ownership if branching
  if p_parent_job_id is not null then
    if not exists (
      select 1 from simulation_jobs 
      where id = p_parent_job_id and (user_id = p_user_id or v_caller_id is null)
    ) then
      raise exception 'Invalid parent job: You do not own or have access to parent job %.', p_parent_job_id;
    end if;
  end if;

  -- 3. Enforce max 2 concurrent active/queued jobs per user
  select count(*) into v_active_count
  from simulation_jobs
  where user_id = p_user_id
    and status not in ('completed', 'failed');
    
  if v_active_count >= 2 then
    raise exception 'Concurrency limit reached: you already have % active or queued simulation(s). Maximum allowed is 2.', v_active_count;
  end if;
  
  -- 4. Insert idea
  insert into ideas (user_id, raw_text)
  values (p_user_id, p_raw_text)
  returning id into v_idea_id;
  
  -- 5. Insert simulation job
  insert into simulation_jobs (
    idea_id, user_id, mode, panel_size, segment_count,
    rounds, debate_level, audience_preset, seed, webhook_url,
    parent_job_id, branch_label, status, current_stage, stage_checkpoints
  ) values (
    v_idea_id, p_user_id, p_mode, p_panel_size, p_segment_count,
    p_rounds, p_debate_level, p_audience_preset, p_seed, p_webhook_url,
    p_parent_job_id, p_branch_label, 'queued', 'pending', '{}'::jsonb
  ) returning id into v_job_id;
  
  return v_job_id;
end;
$$;

-- Revoke execution from PUBLIC and grant strictly to authenticated users and service_role
revoke all on function create_simulation_job_atomic from public;
grant execute on function create_simulation_job_atomic to authenticated, service_role;

