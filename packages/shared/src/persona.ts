import { z } from "zod";

/**
 * Shape of personas.profile (jsonb). Produced by the Sonnet persona-generation
 * call via structured output, validated with this schema before insert so the
 * rest of the pipeline works with typed data, not hand-parsed text.
 * See phase-wise-project-plan.md Phase 2.1.
 */
export const personaProfileSchema = z.object({
  name: z.string().min(1),
  /** Short label, e.g. "Budget-strict 2nd-year engineering student". */
  archetype: z.string().min(1),
  demographics: z.string().min(1),
  psychographics: z.string().min(1),
  /** Why this persona is plausibly in the idea's target market. */
  relationshipToIdea: z.string().min(1),
  caresAbout: z.array(z.string().min(1)).min(1),
  wouldSayNoIf: z.array(z.string().min(1)).min(1),
});
export type PersonaProfile = z.infer<typeof personaProfileSchema>;

export const personaGenerationResultSchema = z.object({
  personas: z.array(personaProfileSchema).min(3).max(30),
});
export type PersonaGenerationResult = z.infer<typeof personaGenerationResultSchema>;

/** Per-persona lifecycle within a run — allows partial-panel completion. */
export const personaStatusSchema = z.enum(["pending", "reacted", "failed"]);
export type PersonaStatus = z.infer<typeof personaStatusSchema>;
