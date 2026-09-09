import { z } from "zod";

export const cognitiveBiasSchema = z.enum([
  "loss_aversion",
  "status_quo_bias",
  "sunk_cost_fallacy",
  "switching_friction",
  "budget_gatekeeper",
  "early_adopter_optimist",
]);
export type CognitiveBias = z.infer<typeof cognitiveBiasSchema>;

export const COGNITIVE_BIAS_LABELS: Record<
  CognitiveBias,
  { label: string; behavioralTendency: string }
> = {
  loss_aversion: {
    label: "Loss Aversion",
    behavioralTendency: "Weighs risks and potential losses 2x heavier than prospective gains; demands clear safety nets.",
  },
  status_quo_bias: {
    label: "Status Quo Bias",
    behavioralTendency: "Strong inertia with existing routine/habits; demands a 3x-10x improvement to justify switching.",
  },
  sunk_cost_fallacy: {
    label: "Sunk Cost Fallacy",
    behavioralTendency: "Heavily invested in incumbent tools or legacy workflows; resistant to discarding past setup.",
  },
  switching_friction: {
    label: "Switching Friction Sensitivity",
    behavioralTendency: "Hypersensitive to migration effort, learning curves, data transfer, and workflow disruptions.",
  },
  budget_gatekeeper: {
    label: "Budget Gatekeeper",
    behavioralTendency: "Requires immediate tangible ROI and fast payback period; ruthless on unnecessary recurring expenses.",
  },
  early_adopter_optimist: {
    label: "Early Adopter Optimist",
    behavioralTendency: "Forgives rough edges for novel competitive advantage; eager to experiment with modern paradigms.",
  },
};

export interface PersonaProfile {
  name: string;
  archetype: string;
  demographics: string;
  psychographics: string;
  relationshipToIdea: string;
  targetRelevance?: "core_target" | "adjacent_buyer" | "fringe_evaluator" | string;
  cognitiveBias?: CognitiveBias | string;
  switchingFriction?: string;
  currentAlternative?: string;
  caresAbout: string[];
  wouldSayNoIf: string[];
}

export interface VanWestendorpPricing {
  tooCheap: number;
  bargain: number;
  expensive: number;
  tooExpensive: number;
  currency: string;
}

export const vanWestendorpPricingSchema = z.object({
  tooCheap: z.number().min(0),
  bargain: z.number().min(0),
  expensive: z.number().min(0),
  tooExpensive: z.number().min(0),
  currency: z.string().default("USD"),
});

const preprocessToString = z.preprocess((val) => {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("; ");
  }
  return typeof val === "string" ? val : String(val ?? "");
}, z.string().min(1));

const preprocessToStringArray = z.preprocess((val) => {
  if (typeof val === "string") return [val];
  if (Array.isArray(val)) {
    return val.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item)));
  }
  return val;
}, z.array(z.string().min(1)).min(1));

export const personaProfileSchema: z.ZodType<PersonaProfile, z.ZodTypeDef, unknown> = z.object({
  name: z.string().min(1),
  archetype: z.string().min(1),
  demographics: preprocessToString,
  psychographics: preprocessToString,
  relationshipToIdea: preprocessToString,
  targetRelevance: z.enum(["core_target", "adjacent_buyer", "fringe_evaluator"]).or(z.string()).optional(),
  cognitiveBias: z.string().optional(),
  switchingFriction: z.string().optional(),
  currentAlternative: z.string().optional(),
  caresAbout: preprocessToStringArray,
  wouldSayNoIf: preprocessToStringArray,
});

export interface PersonaGenerationResult {
  personas: PersonaProfile[];
}

export const personaGenerationResultSchema: z.ZodType<
  PersonaGenerationResult,
  z.ZodTypeDef,
  unknown
> = z.object({
  personas: z.array(personaProfileSchema).min(1).max(50),
});

export const personaStatusSchema = z.enum(["pending", "reacted", "failed"]);
export type PersonaStatus = z.infer<typeof personaStatusSchema>;

