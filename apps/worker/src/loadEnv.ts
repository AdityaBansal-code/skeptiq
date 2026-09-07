/**
 * Loads `apps/worker/.env` into process.env for local dev. Must be imported
 * BEFORE any module that reads process.env (i.e. before ./env.ts).
 *
 * `tsx` does not auto-load .env files the way Next.js does, so this is explicit.
 * In production (Railway/Fly) there is no .env file and the host injects real
 * env vars — dotenv silently no-ops when the file is absent.
 */
import { config } from "dotenv";

config({ quiet: true });
