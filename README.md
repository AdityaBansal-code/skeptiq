# 🍦 Autonomous Market Validation Platform

An autonomous, multi-agent focus group simulation engine that subjects product and startup ideas to multi-persona adversarial deliberation, market reconnaissance, behavioral cognitive bias stress-testing, and Van Westendorp Price Sensitivity Metering (PSM) at **$0 operational cost**.

---

## 🎯 Architecture & Capabilities

1. **Market Reconnaissance (Step 0)**: Scrapes competitive intelligence and substitute solutions via a multi-endpoint fallback engine ($0 cost) or deep parametric research.
2. **Autonomous Persona Generation & Cognitive Biases (Step 1)**: Generates psychologically grounded personas with explicit behavioral traits (`loss_aversion`, `status_quo_bias`, `sunk_cost_fallacy`, `switching_friction`, `budget_gatekeeper`, `early_adopter_optimist`) and audience presets (`b2b_saas_enterprise`, `gen_z_creator`, `smb_owners`, `developer_tools`, `healthcare_bio`).
3. **Independent Reactions & PSM (Step 2)**: Collects unprimed reactions, private unspoken reservations, and Van Westendorp 4-point price sensitivity data (`tooCheap`, `bargain`, `expensive`, `tooExpensive`). Embeds reactions via local ONNX.
4. **Auto-$k$ Silhouette Clustering (Step 3)**: Discovers natural consumer market segments using in-memory Euclidean distance and Silhouette Score evaluation.
5. **Dynamic Focus Group Cross-Talk (Step 4)**: Executes structured multi-stage deliberation (5, 12, or 24 rounds) with internal monologues and cross-cluster debate.
6. **Synthesis & A/B Pivot Delta (Step 5)**: Computes optimal price points (OPP/IPP), acceptable pricing bands, and A/B adoption shifts ($\Delta$) if branched from a parent idea.
7. **Founder Cross-Examination (`/api/chat`)**: Interactive Q&A with synthetic personas primed with their exact simulation history.
8. **Investor & Founder Export API (`/api/export/[id]`)**: Instant Markdown Dossiers (`.md`) and raw `.json` downloads.

---

## 🏗️ Monorepo Layout

```
apps/
  web/        Next.js 15 (App Router) — Interactive dashboard, Live Realtime Stepper, Cross-Examination Q&A, Export API
  worker/     Node + tsx — Multi-agent pipeline, Groq + OpenRouter cascade, Health/Metrics HTTP server (:3001)
packages/
  shared/     Zod schemas, Van Westendorp PSM models, and TypeScript types shared across apps
supabase/
  migrations/ Consolidated idempotent SQL: schema, RLS, heartbeat indexes, atomic job creation RPC
```

---

## 🔑 Environment Setup

### 1. Worker Environment: `apps/worker/.env`
```bash
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
GROQ_API_KEY=gsk_...
# Optional free OpenRouter backup
OPENROUTER_API_KEY=sk-or-v1-...
WORKER_POLL_INTERVAL_MS=2000
LOG_LEVEL=info
```

### 2. Web App Environment: `apps/web/.env.local`
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-v1-...
```

---

## 🚀 Running Locally

```bash
# Start Web UI (http://localhost:3000)
pnpm dev:web

# Start Worker Engine & Health Server (http://localhost:3001/health)
pnpm dev:worker
```

---

## 🧪 Verification & Checks

```bash
# Typecheck entire monorepo
pnpm typecheck

# Build Next.js Web App
pnpm --filter web build
```
