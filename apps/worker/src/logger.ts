import { env } from "./env.js";

/**
 * Structured JSON lines to stdout — captured by Railway/Fly's log viewer.
 * This is the whole observability stack for now (architecture §12): log every
 * phase transition, every LLM call's tokens+latency, every retry/failure.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function emit(level: Level, msg: string, fields: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, fields: Record<string, unknown> = {}) => emit("debug", msg, fields),
  info: (msg: string, fields: Record<string, unknown> = {}) => emit("info", msg, fields),
  warn: (msg: string, fields: Record<string, unknown> = {}) => emit("warn", msg, fields),
  error: (msg: string, fields: Record<string, unknown> = {}) => emit("error", msg, fields),
};
