import pg from "pg";
import { env } from "./env.js";

/**
 * Single long-lived pool. The worker connects as the postgres/service role,
 * which bypasses RLS — every query here runs with full table access, so the
 * worker code itself is the authorization boundary.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  // Errors on idle clients must not crash the process.
  process.stderr.write(`[pg pool error] ${err instanceof Error ? err.message : String(err)}\n`);
});
