/**
 * Loads `apps/worker/.env` into process.env for local dev. Must be imported
 * BEFORE any module that reads process.env (i.e. before ./env.ts).
 *
 * `tsx` does not auto-load .env files the way Next.js does, so this is explicit.
 * In production (Railway/Fly) there is no .env file and the host injects real
 * env vars — dotenv silently no-ops when the file is absent.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(workerDir, ".env");
const envLocalFile = resolve(workerDir, ".env.local");

if (existsSync(envFile)) {
  config({ path: envFile, quiet: true });
}
if (existsSync(envLocalFile)) {
  config({ path: envLocalFile, override: true, quiet: true });
}
