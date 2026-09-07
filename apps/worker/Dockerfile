# Worker image for Railway / Fly.io.
# BUILD CONTEXT MUST BE THE REPO ROOT (needs pnpm-workspace.yaml + packages/shared).
# On Railway: set Root Directory = repo root, Dockerfile Path = apps/worker/Dockerfile.
#
# Single stage on purpose: production runs the TypeScript entry directly via tsx
# (this is a long-lived process, cold-start ms are irrelevant). Switch to a
# multi-stage build + tsup pre-bundle only if image size or boot time bite. (D7)
FROM node:22-slim

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --filter worker...

WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
