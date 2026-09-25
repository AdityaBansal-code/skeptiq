import { z } from "zod";

/**
 * Granular job status. Deliberately 8 states, not queued/running/done:
 * the live UI needs to render which phase a long-running simulation is in.
 *
 * This is the single source of truth for the status vocabulary. The SQL
 * CHECK constraint in supabase/migrations mirrors this list by hand, because
 * SQL cannot import TypeScript. Keep the two definitions in sync.
 */
export const jobStatusSchema = z.enum([
  "queued",
  "generating_personas",
  "independent_phase",
  "clustering",
  "crosstalk_phase",
  "synthesizing",
  "completed",
  "failed",
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export const JOB_STATUSES = jobStatusSchema.options;

export const TERMINAL_JOB_STATUSES = [
  "completed",
  "failed",
] as const satisfies readonly JobStatus[];

export function isTerminal(status: JobStatus): boolean {
  return (TERMINAL_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

/**
 * Ordered non-terminal phases the worker advances through, each entered
 * right before the corresponding pipeline step runs. Used by the UI to
 * show progress ("step 3 of 5") and by the worker to assert legal transitions.
 */
export const PIPELINE_PHASES = [
  "generating_personas",
  "independent_phase",
  "clustering",
  "crosstalk_phase",
  "synthesizing",
] as const satisfies readonly JobStatus[];

export type PipelinePhase = (typeof PIPELINE_PHASES)[number];
