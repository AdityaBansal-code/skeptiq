/**
 * Dev helper: insert a test idea + queued simulation_jobs row straight into
 * Postgres, so the worker's claim/status path can be exercised without the web
 * app (phase-wise-project-plan.md Phase 1 task 4).
 *
 *   pnpm --filter worker enqueue "your idea text here"
 *   pnpm --filter worker enqueue "idea" --panel 8 --mode consensus
 *
 * User id resolution: TEST_USER_ID env var, else the oldest row in auth.users
 * (sign in once through the web app first so a user exists).
 */
import "../loadEnv.js"; // must be first — populates process.env before ../env.ts runs

import { jobConfigSchema } from "@repo/shared";
import { pool } from "../db.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const ideaText = process.argv[2];
  if (!ideaText || ideaText.startsWith("--")) {
    console.error('usage: pnpm --filter worker enqueue "idea text" [--panel N] [--mode segmentation|consensus]');
    process.exit(1);
  }

  const config = jobConfigSchema.parse({
    mode: arg("--mode") ?? "segmentation",
    panelSize: arg("--panel") ? Number(arg("--panel")) : 6,
    segmentCount: null,
  });

  const userId =
    process.env.TEST_USER_ID ??
    (await pool.query<{ id: string }>("select id from auth.users order by created_at limit 1")).rows[0]?.id;

  if (!userId) {
    console.error("No user found. Set TEST_USER_ID or sign in through the web app once.");
    process.exit(1);
  }

  const { rows: [idea] } = await pool.query<{ id: string }>(
    "insert into ideas (user_id, raw_text) values ($1, $2) returning id",
    [userId, ideaText],
  );

  const { rows: [job] } = await pool.query<{ id: string }>(
    `insert into simulation_jobs (idea_id, user_id, mode, panel_size, segment_count)
     values ($1, $2, $3, $4, $5) returning id`,
    [idea!.id, userId, config.mode, config.panelSize, config.segmentCount],
  );

  console.log(`queued job ${job!.id} (idea ${idea!.id}, user ${userId})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
