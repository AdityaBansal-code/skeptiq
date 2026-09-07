# AI Idea Validation Platform

Submit an idea → a panel of AI personas reacts independently, debates the
objections in structured rounds → you get a **segmented** market-reaction report
(who adopts, who rejects, why — a distribution, not a single score) plus the full
transcript.

Planning & reasoning lives in [`docs/`](docs/):

| Doc | What it is |
|---|---|
| [`docs/ai-validation-platform-plan.md`](docs/ai-validation-platform-plan.md) | Product & research — the *why*, the bias-mitigation literature, the cost model |
| [`docs/full-system-architecture.md`](docs/full-system-architecture.md) | Architecture — every major decision argued out |
| [`docs/phase-wise-project-plan.md`](docs/phase-wise-project-plan.md) | Build order, tech stack, per-phase exit criteria |
| [`docs/decision-log.md`](docs/decision-log.md) | Implementation-level decisions made while building |
| [`docs/phase-0-validation-run.md`](docs/phase-0-validation-run.md) | The by-hand Phase 0 validation run |

---

## Layout

```
apps/
  web/        Next.js 15 (App Router) — UI, magic-link auth, thin server actions, Realtime
  worker/     Node + tsx — the simulation pipeline + Postgres job-queue loop
packages/
  shared/     zod schemas + TS types shared by web and worker (ships raw .ts, no build)
supabase/
  migrations/ hand-written SQL: schema, RLS, Realtime publication
```

Four runtime pieces (architecture §0): **web** (Vercel) · **Postgres/Auth/Realtime**
(Supabase) · **worker** (Railway/Fly) · **Anthropic API**.

---

## Prerequisites

- Node ≥ 20 (repo pins 22 via `.nvmrc`; deploy targets use LTS)
- pnpm 11 (`corepack enable`)
- A Supabase project

## Setup

```bash
pnpm install

# 1. Apply the schema to your Supabase project
#    Supabase dashboard → SQL Editor → paste supabase/migrations/20260907120000_init.sql
#    (or: supabase db push, if you use the CLI)

# 2. Web env
cp apps/web/.env.example apps/web/.env.local
#    fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
#    (Supabase dashboard → Project Settings → API)

# 3. Worker env
cp apps/worker/.env.example apps/worker/.env
#    fill DATABASE_URL (Project Settings → Database → Connection string → URI, port 5432)
```

## Run (local)

```bash
pnpm dev:web       # http://localhost:3000
pnpm dev:worker    # polls simulation_jobs, walks jobs through the pipeline
```

## Checks

```bash
pnpm typecheck     # all three packages
pnpm --filter web build
pnpm format        # prettier
```

---

## Status

**Phase 1 (infrastructure skeleton) — code complete, not yet wired to live services.**

The worker's simulation pipeline is a **no-op stub** that walks a job through
every status with delays (see decision-log D18). Real persona generation,
reactions, clustering, cross-talk, and synthesis land in Phase 2.

Remaining Phase 1 steps are a copy-paste checklist in
[`docs/phase-1-verification.md`](docs/phase-1-verification.md): apply the
migration, fill the env files, confirm a `queued` job walks to `completed` live
in the browser, then deploy.

Test the worker in isolation (no web app) once a user exists:

```bash
pnpm --filter worker enqueue "A ₹150/day tiffin subscription for hostel students"
```
