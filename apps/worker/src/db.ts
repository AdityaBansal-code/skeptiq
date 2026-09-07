import pg from "pg";
import { env } from "./env.js";

const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(env.DATABASE_URL);

/**
 * Single long-lived pool. The worker connects as the postgres/service role,
 * which bypasses RLS — every query here runs with full table access, so the
 * worker code itself is the authorization boundary.
 *
 * SSL: Supabase requires TLS and `pg` does not enable it from the URL by
 * default. `rejectUnauthorized: false` is the setting that works across
 * Supabase's direct + pooler endpoints; tighten it if you pin a CA. Disabled
 * for a local Postgres (used by Phase 2 tests).
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  // Errors on idle clients must not crash the process.
  process.stderr.write(`[pg pool error] ${err instanceof Error ? err.message : String(err)}\n`);
});
