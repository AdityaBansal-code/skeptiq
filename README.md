# Skeptiq (working name)

Skeptiq is an AI-assisted market-validation platform for stress-testing a product or business idea before investing heavily in it. A founder submits a proposition, selects an audience and simulation depth, and receives a structured synthetic focus-group report: independent reactions, opinion segments, objections, price-sensitivity signals, a multi-persona discussion, evidence-linked conclusions, and a concrete real-world validation plan.

The repository contains a Next.js application, a long-running simulation worker, shared TypeScript contracts, and a Supabase/PostgreSQL schema. The name is provisional and can be changed without altering the core architecture.

> [!IMPORTANT]
> The participants are AI-generated personas. Adoption ranges, segments, quotes, and pricing outputs are simulated decision-support signals—not measured market demand. Use the report to form hypotheses and design interviews or experiments, not as a substitute for evidence from real customers.

## What the product does

- Runs either a **segmentation** simulation to discover distinct audience positions or a **consensus** simulation to examine convergence and unresolved disagreement.
- Supports panels from 3 to 30 personas and quick, standard, or exhaustive deliberation depths.
- Targets general consumers, B2B SaaS buyers, Gen Z creators, small-business owners, developers, or healthcare audiences.
- Performs source-aware market reconnaissance and handles novel ideas without inventing direct competitors.
- Generates personas with different roles, constraints, buying behavior, and cognitive tendencies.
- Captures each persona's independent reaction before group discussion to reduce immediate group influence.
- Embeds reactions locally and clusters them with k-means; the worker can select the cluster count using silhouette scoring.
- Simulates cross-talk between opposing audience segments and rejects truncated or instruction-leaking model responses before storage.
- Produces an executive report with audience segments, objections, conditional adoption ranges, price sensitivity, supporting dialogue, and a next-step validation experiment.
- Lets authenticated users monitor runs in real time, browse archives, inspect personas and dialogue, export Markdown or JSON, and cross-examine a persona after a run.
- Supports public report links and branch simulations for testing a revised proposition against the original persona cohort.
- Optionally sends completion email notifications and signed, SSRF-guarded webhooks.

## How a simulation works

```text
Idea + configuration
        |
        v
0. Market reconnaissance
        |
        v
1. Persona generation (or parent-cohort cloning for a branch)
        |
        v
2. Independent reactions + four-point price questions
        |
        v
3. Local embeddings + opinion clustering
        |
        v
4. Adversarial cross-talk / Delphi-style deliberation
        |
        v
5. Structured synthesis + evidence map + action plan
        |
        v
Report, export, sharing, follow-up Q&A, and notifications
```

Each stage is checkpointed. The worker records heartbeats, retries transient stage failures, cleans partial stage artifacts before a retry, tracks token usage, and checks for cancellation. A stale-job reaper can reclaim interrupted work after the worker restarts.

### Simulation controls

| Control    | Options                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| Mode       | `segmentation`, `consensus`                                                 |
| Panel size | 3–30 personas (default 6)                                                   |
| Depth      | Quick: 5 turns; Standard: 12 turns; Exhaustive: 24 turns                    |
| Audience   | General consumer, B2B SaaS, Gen Z/creator, SMB, developer tools, healthcare |
| Segments   | Automatic, or a requested count from 2–6                                    |
| Seed       | Optional deterministic seed passed through supported generation steps       |
| Branch     | Reuse a completed run's cohort to test a pivot                              |

## Architecture

```text
Browser
  |
  v
Next.js web app  <---- Supabase Auth + Realtime
  |                         |
  | server actions/API      |
  v                         v
PostgreSQL / Supabase <---- background worker
                              |       |
                              |       +-- local transformer embeddings
                              +---------- Groq, with optional OpenRouter fallback
```

### Repository layout

```text
apps/
  web/        Next.js 15 App Router UI, auth, API routes, exports, and live updates
  worker/     Queue polling, multi-agent pipeline, health server, and notifications
packages/
  shared/     Zod schemas and TypeScript contracts shared by web and worker
supabase/
  migrations/ PostgreSQL schema, indexes, RLS policies, Realtime, and job RPCs
```

### Web application

The web app provides:

- a public landing page and magic-link authentication;
- an authenticated overview and new-simulation workflow;
- simulation archive, persona explorer, reports, and settings;
- a live job page driven by Supabase Realtime updates;
- Markdown and JSON report exports;
- public report sharing using an exact share token checked server-side;
- branch/pivot creation and post-run persona cross-examination;
- worker health, queue state, and wake endpoints for hosts that sleep idle services.

### Worker

The worker claims queued jobs from PostgreSQL and advances them through the pipeline. It exposes:

- `GET /health` (and `/`) for liveness and current-job state;
- `GET /metrics` for worker metrics;
- `POST /chat` (and `/api/chat`) for persona follow-up inference used by the web server.

The inference router uses Groq first and can fall back to free OpenRouter routes when configured. Model identifiers and free-tier availability can change, so treat the constants in `apps/worker/src/ai/groq.ts` as deployment configuration that should be rechecked periodically.

### Database

Supabase/PostgreSQL stores ideas, simulation jobs, clusters, personas, dialogue turns, reports, and cross-examinations. Migrations also configure:

- owner-scoped row-level security for browser access;
- Realtime publication for job and dialogue updates;
- atomic simulation creation through a database function;
- status constraints shared conceptually with `packages/shared/src/status.ts`;
- heartbeat and recovery fields for long-running work.

The worker and server routes use a privileged PostgreSQL connection, so their authorization checks remain security-critical even when RLS is enabled for browser clients.

## Technology stack

- **Web:** Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **Authentication and realtime:** Supabase Auth, Supabase Realtime
- **Database:** PostgreSQL via Supabase, `pg`, SQL migrations
- **Validation/contracts:** Zod and a shared workspace package
- **AI inference:** Groq SDK with optional OpenRouter fallback
- **Embeddings/clustering:** `@xenova/transformers` and `ml-kmeans`, run in the worker
- **Workspace:** pnpm monorepo

## Local setup

### Prerequisites

- Node.js 20 or newer (the worker container uses Node 22)
- pnpm 11.5.1 through Corepack
- a Supabase project or compatible PostgreSQL database
- a Groq API key for worker inference
- optionally, an OpenRouter key for fallback inference

### 1. Install dependencies

```bash
corepack enable
pnpm install --frozen-lockfile
```

### 2. Apply database migrations

Link the Supabase CLI to your project and apply the files in `supabase/migrations` in timestamp order:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

For a fresh local Supabase stack, `npx supabase db reset` applies the same migration sequence. Review destructive database commands before running them against an existing project.

### 3. Configure the web app

```bash
cp apps/web/.env.example apps/web/.env.local
```

Required variables:

| Variable                        | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL used by browser and server clients               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anonymous key                                         |
| `DATABASE_URL`                  | Server-side PostgreSQL connection for dashboard, exports, and sharing |
| `WORKER_HEALTH_URL`             | Base URL of the worker, such as `http://localhost:3001`               |

`WORKER_URL` and `NEXT_PUBLIC_WORKER_URL` are accepted aliases, but `WORKER_HEALTH_URL` is the recommended server-side setting. If the worker is unavailable, the web chat route can use optional `GROQ_API_KEY` and `OPENROUTER_API_KEY` values directly; these keys must never use a `NEXT_PUBLIC_` prefix.

Configure the application's local and deployed auth callback URLs in Supabase Authentication settings.

### 4. Configure the worker

```bash
cp apps/worker/.env.example apps/worker/.env
```

| Variable                  | Required         | Purpose                                                              |
| ------------------------- | ---------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`            | Yes              | PostgreSQL session-pooler connection used by the long-running worker |
| `GROQ_API_KEY`            | For inference    | Primary model provider key                                           |
| `OPENROUTER_API_KEY`      | No               | Fallback model provider key                                          |
| `WORKER_POLL_INTERVAL_MS` | No               | Queue polling interval; defaults to `2000`                           |
| `LOG_LEVEL`               | No               | `debug`, `info`, `warn`, or `error`                                  |
| `WORKER_PORT` / `PORT`    | No               | Health-server port; defaults to `3001`                               |
| `RESEND_API_KEY`          | No               | Enables completion emails; otherwise notifications are logged        |
| `EMAIL_FROM`              | No               | Sender address for completion emails                                 |
| `NEXT_PUBLIC_SITE_URL`    | No               | Base URL placed in completion email links                            |
| `TEST_USER_ID`            | Development only | User selected by the manual enqueue utility                          |

Use Supabase's IPv4-compatible **session pooler** URL on hosts that cannot reach the direct IPv6 database endpoint. Keep all real credentials in ignored environment files or the deployment platform's secret store.

### 5. Start both processes

In separate terminals:

```bash
pnpm dev:web
```

```bash
pnpm dev:worker
```

Open `http://localhost:3000`. The worker health endpoint is available at `http://localhost:3001/health` by default.

To enqueue a development job from the terminal after at least one user exists:

```bash
pnpm --filter worker enqueue
```

## Verification

```bash
# Type-check every workspace
pnpm typecheck

# Build every workspace (the worker build is a TypeScript check)
pnpm build

# Check formatting
pnpm format:check
```

Focused worker tests use Node's test runner through `tsx`; there is not yet a single repository-wide test command:

```bash
pnpm --filter worker exec node --import tsx --test \
  src/ai/search.test.ts \
  src/ai/completion-quality.test.ts \
  src/pipeline/dialogue-quality.test.ts
```

The current `lint` scripts are placeholders, not a configured ESLint gate.

## Deployment

1. Deploy the Supabase migrations and configure authentication redirect URLs.
2. Deploy `apps/web` to a Next.js-compatible host and add the web environment variables.
3. Deploy the worker as a persistent Node service. Build its Docker image from the repository root using `apps/worker/Dockerfile`.
4. Set the web app's `WORKER_HEALTH_URL` to the worker's public base URL.
5. Verify `/health`, create a small simulation, watch every pipeline transition, and confirm the final report before increasing panel size.

Hosts that suspend free services can terminate an active simulation. The worker's heartbeat and stale-job recovery reduce the chance of a permanently stuck job, but they do not make an interrupted model call instantaneous or guarantee zero duplicated provider work.

## Security and operational notes

- Never commit `.env`, `.env.local`, provider keys, database passwords, or Supabase service-role keys.
- Browser access is protected by Supabase Auth and row-level security; privileged worker and server database access must retain explicit ownership checks.
- Public shares are resolved server-side using the complete token rather than broad anonymous table access.
- Webhook delivery validates HTTPS targets and blocks private/reserved network destinations to reduce SSRF risk.
- The browser-facing chat API authenticates the user before proxying to the worker. In production, also keep the worker private or add service-to-service authentication and restrict CORS; the worker's direct chat endpoint is not intended as a public unauthenticated API.
- Free model tiers have changing quotas, model inventories, latency, and availability. Configure fallbacks and monitor provider failures.
- Reports may contain model-generated inaccuracies or stereotypes. Do not use them for high-stakes decisions or claims about protected groups.

## Known limitations

- The platform simulates qualitative feedback; it does not establish product-market fit or statistically valid demand.
- Search reconnaissance depends on public search results and can be incomplete.
- Price sensitivity is directional because the sample is synthetic and small.
- Provider output quality and quotas can materially change a run.
- ESLint and a repository-wide automated test command are not configured yet.
- The worker chat endpoint needs network isolation or service authentication for a hardened public deployment.
- No open-source license is currently included; the repository is not automatically licensed for reuse.

## Contributing

Keep changes scoped and source-grounded. Before opening a pull request:

1. update shared schemas and SQL constraints together when changing persisted status or configuration values;
2. add migrations instead of editing an already-deployed migration;
3. keep secrets in local environment files;
4. run type-checking, the production build, formatting checks, and relevant focused tests;
5. document limitations honestly, especially where outputs are simulated rather than measured.

## Project status

This is an active pre-release project. The product name, model routing, deployment choices, and some operational controls may change as real-user validation continues.
