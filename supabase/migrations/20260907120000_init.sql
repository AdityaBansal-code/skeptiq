-- 20260907120000_init
-- Core schema for the AI idea-validation platform.
-- Mirrors full-system-architecture.md §6 (data model), §8 (auth/RLS), §9 (cost logging).
-- Rationale for individual choices lives in docs/decision-log.md (D5–D10).

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector; enabled now, used later (see D8)

-- ── ideas ────────────────────────────────────────────────────────────────────
-- Separate entity from jobs: a user re-runs one idea with different panel
-- sizes/modes to compare. Splitting avoids re-pasting the idea text. (§6)
create table ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  raw_text   text not null,
  created_at timestamptz not null default now()
);
create index ideas_user_idx on ideas (user_id, created_at desc);

-- ── simulation_jobs ──────────────────────────────────────────────────────────
create table simulation_jobs (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references ideas (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  mode          text not null check (mode in ('segmentation', 'consensus')),
  panel_size    int  not null check (panel_size between 3 and 30),
  segment_count int  check (segment_count between 2 and 6),  -- null = auto-pick k (§4)
  status        text not null default 'queued' check (status in (
                  'queued', 'generating_personas', 'independent_phase', 'clustering',
                  'crosstalk_phase', 'synthesizing', 'completed', 'failed'
                )),
  error         text,
  -- Cost/observability from day one (§9); populated by the worker per Anthropic response.
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

-- Partial index tuned for the worker's claim query:
--   select ... from simulation_jobs where status = 'queued' order by created_at
--   limit 1 for update skip locked;
create index simulation_jobs_queue_idx on simulation_jobs (created_at) where status = 'queued';
create index simulation_jobs_user_idx  on simulation_jobs (user_id, created_at desc);

-- ── clusters ─────────────────────────────────────────────────────────────────
-- Created during the clustering step; label is LLM-generated (§4).
create table clusters (
  id      uuid primary key default gen_random_uuid(),
  job_id  uuid not null references simulation_jobs (id) on delete cascade,
  label   text not null,
  summary text,
  size    int  not null default 0
);
create index clusters_job_idx on clusters (job_id);

-- ── personas ─────────────────────────────────────────────────────────────────
create table personas (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references simulation_jobs (id) on delete cascade,
  profile       jsonb not null,                       -- @repo/shared personaProfileSchema
  system_prompt text,                                 -- generated once, reused per turn (§7)
  status        text not null default 'pending'
                  check (status in ('pending', 'reacted', 'failed')),  -- partial-panel (§7)
  cluster_id    uuid references clusters (id) on delete set null,      -- null until clustering
  created_at    timestamptz not null default now()
);
create index personas_job_idx on personas (job_id);

-- ── turns ────────────────────────────────────────────────────────────────────
-- One flat table for both phases (distinguished by `phase`) rather than two:
-- the frontend renders one continuous transcript and Realtime subscribes to
-- one target. `responding_to_turn_id` carries the crosstalk thread. (§6)
create table turns (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references simulation_jobs (id) on delete cascade,
  persona_id            uuid not null references personas (id) on delete cascade,
  phase                 text not null check (phase in ('independent', 'crosstalk')),
  round_number          int  not null default 0,
  content               text not null,
  responding_to_turn_id uuid references turns (id) on delete set null,
  -- Embedding of independent-phase reactions. Stored as jsonb (dimension-agnostic)
  -- because clustering runs in-memory in the worker and the embedding model is
  -- not locked yet. Migrate to a typed vector(N) column when it is. (D8)
  embedding             jsonb,
  created_at            timestamptz not null default now()
);
-- Hot path: transcript ordering + Realtime tail reads (§6 index decision).
create index turns_job_created_idx on turns (job_id, created_at);

-- ── reports ──────────────────────────────────────────────────────────────────
create table reports (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null unique references simulation_jobs (id) on delete cascade,
  summary_json jsonb not null,                        -- @repo/shared reportSummarySchema
  generated_at timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Every table scoped by user_id. Jobs carry a denormalized user_id; child
-- tables trace back through the job. The worker connects as the postgres/
-- service role and BYPASSES RLS — these policies guard only the browser path. (§8)
alter table ideas           enable row level security;
alter table simulation_jobs enable row level security;
alter table personas        enable row level security;
alter table clusters        enable row level security;
alter table turns           enable row level security;
alter table reports         enable row level security;

create policy "ideas: owner reads"   on ideas
  for select using (auth.uid() = user_id);
create policy "ideas: owner inserts" on ideas
  for insert with check (auth.uid() = user_id);

create policy "jobs: owner reads"   on simulation_jobs
  for select using (auth.uid() = user_id);
create policy "jobs: owner inserts" on simulation_jobs
  for insert with check (auth.uid() = user_id);
-- No end-user update/delete: the worker owns every status transition.

create policy "personas: owner reads" on personas
  for select using (exists (
    select 1 from simulation_jobs j where j.id = personas.job_id and j.user_id = auth.uid()
  ));

create policy "clusters: owner reads" on clusters
  for select using (exists (
    select 1 from simulation_jobs j where j.id = clusters.job_id and j.user_id = auth.uid()
  ));

create policy "turns: owner reads" on turns
  for select using (exists (
    select 1 from simulation_jobs j where j.id = turns.job_id and j.user_id = auth.uid()
  ));

create policy "reports: owner reads" on reports
  for select using (exists (
    select 1 from simulation_jobs j where j.id = reports.job_id and j.user_id = auth.uid()
  ));

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- The live UI subscribes to job status changes and to new transcript turns.
-- Realtime respects the RLS policies above when the channel uses the user JWT. (§5, §8)
alter publication supabase_realtime add table simulation_jobs;
alter publication supabase_realtime add table turns;
