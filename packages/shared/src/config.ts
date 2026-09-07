import { z } from "zod";

/** Two modes share one engine. Segmentation is the default and flagship. */
export const simulationModeSchema = z.enum(["segmentation", "consensus"]);
export type SimulationMode = z.infer<typeof simulationModeSchema>;
export const SIMULATION_MODES = simulationModeSchema.options;

/** Bounds mirror the DB CHECK constraint on simulation_jobs.panel_size. */
export const PANEL_SIZE_MIN = 3;
export const PANEL_SIZE_MAX = 30;
export const PANEL_SIZE_DEFAULT = 6;

export const jobConfigSchema = z.object({
  mode: simulationModeSchema.default("segmentation"),
  panelSize: z
    .number()
    .int()
    .min(PANEL_SIZE_MIN)
    .max(PANEL_SIZE_MAX)
    .default(PANEL_SIZE_DEFAULT),
  /**
   * Number of opinion segments to cluster into. `null` = let the worker
   * auto-pick k via silhouette score (see architecture §4).
   */
  segmentCount: z.number().int().min(2).max(6).nullable().default(null),
});
export type JobConfig = z.infer<typeof jobConfigSchema>;

/** Payload the web form/API accepts to create a run. */
export const createJobInputSchema = z.object({
  ideaText: z
    .string()
    .trim()
    .min(20, "Describe the idea in at least a sentence or two.")
    .max(4000, "Keep the idea under ~4000 characters."),
  config: jobConfigSchema,
});
export type CreateJobInput = z.infer<typeof createJobInputSchema>;
