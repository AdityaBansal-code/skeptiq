import { z } from "zod";

/**
 * Shape of reports.summary_json. The design rule from the research doc:
 * never collapse to a single score — always report a distribution and a range.
 * See ai-validation-platform-plan.md §3 and full-system-architecture.md §4.
 */
export const segmentStanceSchema = z.enum(["adopt", "conditional", "reject"]);
export type SegmentStance = z.infer<typeof segmentStanceSchema>;

/**
 * Pivot Comparison / A/B Delta Analysis when branching from a parent simulation.
 */
export const pivotDeltaSchema = z.object({
  parentJobId: z.string().uuid().optional().or(z.string()),
  previousAdoptionLow: z.number().min(0).max(100),
  previousAdoptionHigh: z.number().min(0).max(100),
  deltaLow: z.number(), // e.g. +15 or -10
  deltaHigh: z.number(),
  resolvedObjections: z.array(z.string().min(1)).default([]),
  newObjections: z.array(z.string().min(1)).default([]),
  verdictComparison: z.string().min(1),
});
export type PivotDelta = z.infer<typeof pivotDeltaSchema>;

export function sanitizeRange(low: unknown, high: unknown): { low: number; high: number } {
  const numLow = typeof low === "number" ? low : Number(low) || 0;
  const numHigh = typeof high === "number" ? high : Number(high) || 0;
  const clampedLow = Math.max(0, Math.min(100, numLow));
  const clampedHigh = Math.max(0, Math.min(100, numHigh));
  return {
    low: Math.min(clampedLow, clampedHigh),
    high: Math.max(clampedLow, clampedHigh),
  };
}

export const reportSegmentSchema = z.preprocess((val) => {
  if (val && typeof val === "object") {
    const raw = val as Record<string, unknown>;
    const { low, high } = sanitizeRange(raw.adoptionLikelihoodLow, raw.adoptionLikelihoodHigh);
    return {
      ...raw,
      adoptionLikelihoodLow: low,
      adoptionLikelihoodHigh: high,
      sizePct: Math.max(0, Math.min(100, Number(raw.sizePct) || 0)),
    };
  }
  return val;
}, z
  .object({
    label: z.string().min(1),
    /** Share of the panel in this segment; segment sizes should sum to ~100. */
    sizePct: z.number().min(0).max(100),
    stance: segmentStanceSchema,
    adoptionLikelihoodLow: z.number().min(0).max(100),
    adoptionLikelihoodHigh: z.number().min(0).max(100),
    keyObjections: z.array(z.string().min(1)).default([]),
    conditions: z.array(z.string().min(1)).default([]),
    notableQuotes: z.array(z.string().min(1)).default([]),
  })
  .refine((s) => s.adoptionLikelihoodLow <= s.adoptionLikelihoodHigh, {
    message: "adoptionLikelihoodLow must be <= adoptionLikelihoodHigh",
    path: ["adoptionLikelihoodLow"],
  }));

export type ReportSegment = z.infer<typeof reportSegmentSchema>;

export const priceSensitivitySchema = z.object({
  optimalPricePoint: z.number().min(0),
  indifferencePricePoint: z.number().min(0),
  pointOfMarginalCheapness: z.number().min(0),
  pointOfMarginalExpensiveness: z.number().min(0),
  acceptableRangeLow: z.number().min(0),
  acceptableRangeHigh: z.number().min(0),
  currency: z.string().default("USD"),
  priceRecommendation: z.string().min(1),
  sampleSize: z.number().int().min(1),
});
export type PriceSensitivity = z.infer<typeof priceSensitivitySchema>;

/**
 * Consensus Mode Metrics: Captures Delphi-style alignment and convergence across the panel.
 */
export const consensusMetricsSchema = z.object({
  convergenceScore: z.number().min(0).max(100), // 0 to 100% agreement index
  universalAgreements: z.array(z.string().min(1)).default([]),
  unresolvedContestations: z.array(z.string().min(1)).default([]),
  keyCompromisesRequired: z.array(z.string().min(1)).default([]),
  finalGroupStance: z.enum(["strong_consensus", "conditional_compromise", "divided_stalemate", "universal_rejection"]),
});
export type ConsensusMetrics = z.infer<typeof consensusMetricsSchema>;

/**
 * Concrete Decision-Support Action Plan synthesized from the simulation.
 */
export const actionPlanSchema = z.object({
  riskiestAssumption: z.string().min(1),
  cheapestValidationExperiment: z.string().min(1),
  targetInterviewProfile: z.string().min(1),
  suggestedQuestions: z.array(z.string().min(1)).default([]),
  successThreshold: z.string().min(1),
  invalidationCriteria: z.string().min(1),
});
export type ActionPlan = z.infer<typeof actionPlanSchema>;

/**
 * Evidence & Citation Map connecting report claims to persona viewpoints.
 */
export const evidenceClaimSchema = z.object({
  claim: z.string().min(1),
  supportingPersonaNames: z.array(z.string().min(1)).default([]),
  opposingPersonaNames: z.array(z.string().min(1)).default([]),
  verbatimExcerpt: z.string().min(1),
});
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;

export const reportSummarySchema = z.preprocess((val) => {
  if (val && typeof val === "object") {
    const raw = val as Record<string, unknown>;
    const { low, high } = sanitizeRange(raw.overallAdoptionLow, raw.overallAdoptionHigh);
    return {
      ...raw,
      overallAdoptionLow: low,
      overallAdoptionHigh: high,
      panelSizeEffective: Math.max(1, Number(raw.panelSizeEffective) || 1),
    };
  }
  return val;
}, z
  .object({
    /** One line. Explicitly a distribution statement, not "scores 80%". */
    headline: z.string().min(1),
    segments: z.array(reportSegmentSchema).default([]),
    crossCuttingObjections: z.array(z.string().min(1)).default([]),
    overallAdoptionLow: z.number().min(0).max(100),
    overallAdoptionHigh: z.number().min(0).max(100),
    /** Effective panel size after any persona dropouts (partial-panel handling). */
    panelSizeEffective: z.number().int().min(1),
    caveats: z.array(z.string().min(1)).default([]),
    pivotDelta: pivotDeltaSchema.optional(),
    priceSensitivity: priceSensitivitySchema.optional(),
    cognitiveBiasesEncountered: z.array(z.string().min(1)).default([]),
    consensusMetrics: consensusMetricsSchema.optional(),
    actionPlan: actionPlanSchema.optional(),
    evidenceClaims: z.array(evidenceClaimSchema).default([]),
  })
  .refine((r) => r.overallAdoptionLow <= r.overallAdoptionHigh, {
    message: "overallAdoptionLow must be <= overallAdoptionHigh",
    path: ["overallAdoptionLow"],
  }));

export type ReportSummary = z.infer<typeof reportSummarySchema>;


