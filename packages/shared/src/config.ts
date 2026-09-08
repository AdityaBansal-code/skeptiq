import { z } from "zod";

/** Two modes share one engine. Segmentation is the default and flagship. */
export const simulationModeSchema = z.enum(["segmentation", "consensus"]);
export type SimulationMode = z.infer<typeof simulationModeSchema>;
export const SIMULATION_MODES = simulationModeSchema.options;

/** Bounds mirror the DB CHECK constraint on simulation_jobs.panel_size. */
export const PANEL_SIZE_MIN = 3;
export const PANEL_SIZE_MAX = 30;
export const PANEL_SIZE_DEFAULT = 6;

/** Rigor/Depth levels for the multi-agent focus group deliberation. */
export const debateLevelSchema = z.enum(["quick", "standard", "exhaustive"]);
export type DebateLevel = z.infer<typeof debateLevelSchema>;

export const DEBATE_LEVELS: Record<
  DebateLevel,
  { label: string; rounds: number; description: string }
> = {
  quick: {
    label: "Quick Assessment",
    rounds: 5,
    description: "Fast initial screening (~5 rounds)",
  },
  standard: {
    label: "Deep Deliberation",
    rounds: 12,
    description: "Multi-turn debate & price stress test (~12 rounds)",
  },
  exhaustive: {
    label: "Exhaustive Stress-Test",
    rounds: 24,
    description: "Adversarial cross-examination & edge cases (~24 rounds)",
  },
};

/** Audience archetypes / preset packs for targeting specific focus groups. */
export const audiencePresetSchema = z.enum([
  "general_consumer",
  "b2b_saas_enterprise",
  "gen_z_creator",
  "smb_owners",
  "developer_tools",
  "healthcare_bio",
]);
export type AudiencePreset = z.infer<typeof audiencePresetSchema>;

export const AUDIENCE_PRESETS: Record<
  AudiencePreset,
  { label: string; description: string; sampleRoles: string[] }
> = {
  general_consumer: {
    label: "General Consumer Market",
    description: "Diverse everyday consumers spanning various ages, incomes, and tech comfort.",
    sampleRoles: ["Working Parent", "Budget-Conscious Shopper", "Tech Enthusiast", "Casual User"],
  },
  b2b_saas_enterprise: {
    label: "B2B SaaS & Enterprise",
    description: "Corporate decision-makers, budget owners, procurement, security, and end users.",
    sampleRoles: ["CFO / Budget Gatekeeper", "VP of Engineering", "Security & Compliance Lead", "Department End-User"],
  },
  gen_z_creator: {
    label: "Gen-Z & Creator Economy",
    description: "Digital natives, content creators, freelancers, and mobile-first trendsetters.",
    sampleRoles: ["Full-time Content Creator", "College Student", "Micro-Influencer", "Freelance Gig Worker"],
  },
  smb_owners: {
    label: "SMB & Local Business Owners",
    description: "Main-street shop owners, service providers, and cost-conscious operators.",
    sampleRoles: ["Local Retail Owner", "Service Contractor", "Franchise Operator", "Boutique Agency Lead"],
  },
  developer_tools: {
    label: "Developers & Technical Leads",
    description: "Software engineers, DevOps leads, system architects, and open-source users.",
    sampleRoles: ["Senior Backend Engineer", "DevOps / SRE Lead", "Staff Architect", "Fullstack Indie Hacker"],
  },
  healthcare_bio: {
    label: "Healthcare & Regulated Markets",
    description: "Medical practitioners, clinic administrators, compliance officers, and patients.",
    sampleRoles: ["Clinic Administrator", "Practicing Clinician", "HIPAA/Compliance Officer", "Chronic Care Patient"],
  },
};

export const jobConfigSchema = z.object({
  mode: simulationModeSchema.default("segmentation"),
  panelSize: z
    .number()
    .int()
    .min(PANEL_SIZE_MIN)
    .max(PANEL_SIZE_MAX)
    .default(PANEL_SIZE_DEFAULT),
  debateLevel: debateLevelSchema.default("standard"),
  rounds: z.number().int().min(3).max(50).default(12),
  audiencePreset: audiencePresetSchema.default("general_consumer"),
  seed: z.number().int().nullable().default(null),
  webhookUrl: z.string().url().nullable().default(null),
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

