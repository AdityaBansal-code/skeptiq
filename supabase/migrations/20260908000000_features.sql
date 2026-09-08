-- 20260908000000_features
-- Feature upgrades: Debate rigor scaling, public sharing, market reconnaissance context,
-- cohort branching (A/B testing), worker heartbeat/crash recovery, and interactive cross-examinations.

-- ── simulation_jobs additions ────────────────────────────────────────────────
alter table simulation_jobs
  add column if not exists rounds         int default 12 check (rounds between 3 and 50),
  add column if not exists debate_level   text default 'standard' check (debate_level in ('quick', 'standard', 'exhaustive')),
  add column if not exists share_token    text unique default encode(gen_random_bytes(12), 'hex'),
  add column if not exists market_context jsonb,
  add column if not exists parent_job_id  uuid references simulation_jobs(id) on delete set null,
  add column if not exists branch_label   text,
  add column if not exists heartbeat_at   timestamptz default now(),
  add column if not exists attempt_count  int not null default 0;

-- Backfill share_token if null on any existing rows
update simulation_jobs
  set share_token = encode(gen_random_bytes(12), 'hex')
  where share_token is null;

-- Partial & lookup indices for share tokens and worker reaper
create index if not exists simulation_jobs_share_token_idx on simulation_jobs (share_token);
create index if not exists simulation_jobs_parent_idx      on simulation_jobs (parent_job_id);
create index if not exists simulation_jobs_reaper_idx      on simulation_jobs (status, heartbeat_at)
  where status not in ('queued', 'completed', 'failed');

-- ── cross_examinations ───────────────────────────────────────────────────────
-- Interactive founder cross-examination Q&A with synthetic focus group members
create table if not exists cross_examinations (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references simulation_jobs(id) on delete cascade,
  persona_id uuid references personas(id) on delete set null,
  question   text not null,
  answer     text not null,
  created_at timestamptz not null default now()
);

create index if not exists cross_examinations_job_idx on cross_examinations (job_id, created_at asc);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table cross_examinations enable row level security;

create policy "cross_examinations: owner reads" on cross_examinations
  for select using (exists (
    select 1 from simulation_jobs j where j.id = cross_examinations.job_id and j.user_id = auth.uid()
  ));

create policy "cross_examinations: owner inserts" on cross_examinations
  for insert with check (exists (
    select 1 from simulation_jobs j where j.id = cross_examinations.job_id and j.user_id = auth.uid()
  ));

-- Allow public viewing of reports/turns/personas/cross_examinations via share_token
create policy "jobs: public share token reads" on simulation_jobs
  for select using (share_token is not null);

create policy "personas: public share token reads" on personas
  for select using (exists (
    select 1 from simulation_jobs j where j.id = personas.job_id and j.share_token is not null
  ));

create policy "turns: public share token reads" on turns
  for select using (exists (
    select 1 from simulation_jobs j where j.id = turns.job_id and j.share_token is not null
  ));

create policy "reports: public share token reads" on reports
  for select using (exists (
    select 1 from simulation_jobs j where j.id = reports.job_id and j.share_token is not null
  ));

create policy "cross_examinations: public share token reads" on cross_examinations
  for select using (exists (
    select 1 from simulation_jobs j where j.id = cross_examinations.job_id and j.share_token is not null
  ));
