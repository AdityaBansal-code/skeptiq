/**
 * @repo/shared — the single source of truth for cross-cutting types and
 * validation schemas used by BOTH the web app and the worker.
 *
 * Ships raw .ts with NO build step (docs/decision-log.md D3), so imports here
 * are extensionless: Next's webpack resolves them against .ts, and tsx/esbuild
 * does the same for the worker. (A `.js` specifier would break the webpack
 * build — it does not remap to .ts for a transpiled source package.)
 */
export * from "./status";
export * from "./config";
export * from "./persona";
export * from "./report";
