import { z } from "zod";

/**
 * Shape of reports.summary_json. The design rule from the research doc:
 * never collapse to a single score — always report a distribution and a range.
 * See ai-validation-platform-plan.md §3 and full-system-architecture.md §4.
 */
export const segmentStanceSchema = z.enum(["adopt", "conditional", "reject"]);
export type SegmentStance = z.infer<typeof segmentStanceSchema>;

export const reportSegmentSchema = z
  .object({
    label: z.string().min(1),
    /** Share of the panel in this segment; segment sizes should sum to ~100. */
    sizePct: z.number().min(0).max(100),
    stance: segmentStanceSchema,
    adoptionLikelihoodLow: z.number().min(0).max(100),
    adoptionLikelihoodHigh: z.number().min(0).max(100),
    keyObjections: z.array(z.string().min(1)),
    conditions: z.array(z.string().min(1)),
    notableQuotes: z.array(z.string().min(1)),
  })
  .refine((s) => s.adoptionLikelihoodLow <= s.adoptionLikelihoodHigh, {
    message: "adoptionLikelihoodLow must be <= adoptionLikelihoodHigh",
    path: ["adoptionLikelihoodLow"],
  });
export type ReportSegment = z.infer<typeof reportSegmentSchema>;

export const reportSummarySchema = z
  .object({
    /** One line. Explicitly a distribution statement, not "scores 80%". */
    headline: z.string().min(1),
    segments: z.array(reportSegmentSchema).min(1),
    crossCuttingObjections: z.array(z.string().min(1)),
    overallAdoptionLow: z.number().min(0).max(100),
    overallAdoptionHigh: z.number().min(0).max(100),
    /** Effective panel size after any persona dropouts (partial-panel handling). */
    panelSizeEffective: z.number().int().min(1),
    caveats: z.array(z.string().min(1)),
  })
  .refine((r) => r.overallAdoptionLow <= r.overallAdoptionHigh, {
    message: "overallAdoptionLow must be <= overallAdoptionHigh",
    path: ["overallAdoptionLow"],
  });
export type ReportSummary = z.infer<typeof reportSummarySchema>;
