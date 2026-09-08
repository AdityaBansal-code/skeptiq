import {
  personaGenerationResultSchema,
  AUDIENCE_PRESETS,
  COGNITIVE_BIAS_LABELS,
  type AudiencePreset,
  type CognitiveBias,
  type PersonaProfile,
} from "@repo/shared";
import { GROQ_MODELS, jsonCompletion, TokenTracker } from "../ai/groq.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";

export interface PersonaRecord {
  id: string;
  job_id: string;
  profile: PersonaProfile;
  system_prompt: string;
}

export function buildPersonaSystemPrompt(profile: PersonaProfile): string {
  const biasKey = (profile.cognitiveBias as CognitiveBias) || "status_quo_bias";
  const biasInfo = COGNITIVE_BIAS_LABELS[biasKey] || COGNITIVE_BIAS_LABELS.status_quo_bias;

  return `You are roleplaying as a real human participant in a market validation focus group.

YOUR PROFILE:
- Name: ${profile.name}
- Role / Archetype: ${profile.archetype}
- Demographics: ${profile.demographics}
- Psychographics: ${profile.psychographics}
- Relevance / Context: ${profile.relationshipToIdea}
- Current Alternative or Routine: ${profile.currentAlternative || "Existing manual routine or familiar incumbent tool"}
- Underlying Psychological Temperament (${biasInfo.label}): ${biasInfo.behavioralTendency}
- Switching Friction: ${profile.switchingFriction || "Hesitant about disruption, learning curve, or unproven reliability"}

WHAT MATTERS TO YOU:
${profile.caresAbout.map((c) => `- ${c}`).join("\n")}

YOUR DEALBREAKERS:
${profile.wouldSayNoIf.map((w) => `- ${w}`).join("\n")}

CONVERSATIONAL GUIDELINES:
1. Speak in your natural, authentic voice as a real human. Use realistic vocabulary, contractions, and direct phrasing.
2. Your psychological temperament (${biasInfo.label}) is an underlying lens, NOT a repetitive catchphrase. Do not robotically restate your current tool or bias in every turn.
3. React dynamically to others: You can ask clarifying questions, acknowledge when a fellow participant makes a valid point, or challenge assumptions with practical trade-offs.
4. If a proposal solves your real pain point or offers a reasonable compromise, show genuine nuance or conditional openness.
5. STRICTLY AVOID repetitive clichés like "Look...", "Honestly...", "You're missing the point...", or "My final stance is a hard NO...". Talk like a real person in a live room.
6. Keep each spoken turn concise (1 to 3 natural sentences). Never sound like an AI assistant or marketing analyst.`;
}

import type { MarketContext } from "../ai/search.js";

export async function clonePersonasFromParent(
  jobId: string,
  parentJobId: string
): Promise<PersonaRecord[]> {
  logger.info("cloning personas from parent job", { jobId, parentJobId });
  const { rows } = await pool.query<{ profile: PersonaProfile; system_prompt: string }>(
    `SELECT profile, system_prompt FROM personas WHERE job_id = $1 ORDER BY id ASC`,
    [parentJobId]
  );

  if (rows.length === 0) {
    throw new Error(`Parent job ${parentJobId} has no personas to clone.`);
  }

  const values: any[] = [];
  const valueClauses: string[] = [];
  const parsedProfiles: PersonaProfile[] = [];
  const systemPrompts: string[] = [];

  rows.forEach((row, i) => {
    const profile = typeof row.profile === "string" ? JSON.parse(row.profile) : row.profile;
    parsedProfiles.push(profile);
    systemPrompts.push(row.system_prompt);
    const offset = i * 3;
    valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'pending')`);
    values.push(jobId, JSON.stringify(profile), row.system_prompt);
  });

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO personas (job_id, profile, system_prompt, status)
     VALUES ${valueClauses.join(", ")}
     RETURNING id`,
    values
  );

  const records: PersonaRecord[] = inserted.map((ins, i) => ({
    id: ins.id,
    job_id: jobId,
    profile: parsedProfiles[i]!,
    system_prompt: systemPrompts[i]!,
  }));

  logger.info("cloned personas from parent job", { jobId, count: records.length });
  return records;
}

export async function generatePersonas(
  jobId: string,
  ideaText: string,
  panelSize: number,
  options?: {
    marketContext?: MarketContext;
    audiencePreset?: AudiencePreset;
    seed?: number | null;
    tracker?: TokenTracker;
  }
): Promise<PersonaRecord[]> {
  const marketContext = options?.marketContext;
  const audiencePreset = options?.audiencePreset || "general_consumer";
  const presetConfig = AUDIENCE_PRESETS[audiencePreset] || AUDIENCE_PRESETS.general_consumer;

  logger.info("generating personas", { jobId, panelSize, audiencePreset, hasMarketContext: !!marketContext });

  // Re-use already created personas if this stage is resuming from a crash recovery
  const existing = await pool.query<{ id: string; profile: PersonaProfile; system_prompt: string }>(
    `SELECT id, profile, system_prompt FROM personas WHERE job_id = $1 ORDER BY id ASC`,
    [jobId]
  );
  if (existing.rows.length >= panelSize) {
    logger.info("reusing existing personas for job", { jobId, count: existing.rows.length });
    return existing.rows.slice(0, panelSize).map((r) => ({
      id: r.id,
      job_id: jobId,
      profile: typeof r.profile === "string" ? JSON.parse(r.profile) : r.profile,
      system_prompt: r.system_prompt,
    }));
  }

  // Clear any partial personas from previous failed attempts
  await pool.query(`DELETE FROM personas WHERE job_id = $1`, [jobId]);

  const marketBlock = marketContext
    ? `\nCOMPETITIVE MARKET REALITY:
- Top competitors/incumbents in this space: ${marketContext.topCompetitors.join(", ")}
- Prevailing pricing models: ${marketContext.typicalPricingModels.join(", ")}
- How customers currently solve this: ${marketContext.existingSubstitutesSummary}
Ensure personas use realistic industry-standard tools and workflows (e.g. Crunchbase, SEC filings, Google Alerts, Substack, GitHub, Notion, RSS feeds, specialized SaaS) rather than nonsensical combinations.\n`
    : "";

  const systemMessage = `You are a world-class market research methodologist.
Your task is to generate a diverse, highly realistic panel of exactly ${panelSize} distinct stakeholder personas to evaluate an idea.

TARGET AUDIENCE COHORT: "${presetConfig.label}"
Cohort Description: ${presetConfig.description}
Representative Target Roles: ${presetConfig.sampleRoles.join(", ")}
${marketBlock}
CRITICAL RECRUITMENT & METHODOLOGICAL RULES:
1. STRICT AUDIENCE RELEVANCE: Every persona generated MUST belong to the specified Target Audience Cohort and have genuine domain/operational relevance to the idea. Do NOT recruit out-of-scope personas (e.g., do NOT recruit unrelated suburban parents or retirees for a B2B creator M&A tool).
2. Diverse Psychological Biases: Distribute diverse psychological temperaments across the cohort:
   - "loss_aversion" (fears reputational risk, bad data, or waste)
   - "status_quo_bias" (habit inertia, needs high proof of value to switch)
   - "sunk_cost_fallacy" (invested time/effort in current setup)
   - "switching_friction" (worries about integration, onboarding, and workflow disruption)
   - "budget_gatekeeper" (evaluates unit ROI, prefers free or sponsor-backed alternatives)
   - "early_adopter_optimist" (welcomes new tools for competitive edge)
3. Operational Grounding: Ground each persona with realistic demographics, their actual current tool/workflow, concrete switching friction, and specific target relevance ("core_target", "adjacent_buyer", or "fringe_evaluator").
4. Output format: You MUST return a valid JSON object matching this schema:
{
  "personas": [
    {
      "name": "Full Name",
      "archetype": "Specific professional or consumer role",
      "demographics": "Age, occupation, city, budget/income tier",
      "psychographics": "Core values, day-to-day priorities, workflow habits",
      "relationshipToIdea": "Exact reason they care or are affected by this category",
      "targetRelevance": "core_target | adjacent_buyer | fringe_evaluator",
      "cognitiveBias": "loss_aversion | status_quo_bias | sunk_cost_fallacy | switching_friction | budget_gatekeeper | early_adopter_optimist",
      "currentAlternative": "Realistic tool, competitor, or manual process they currently use",
      "switchingFriction": "The exact barrier or hesitation they face when switching",
      "caresAbout": ["priority 1", "priority 2"],
      "wouldSayNoIf": ["dealbreaker 1", "dealbreaker 2"]
    }
  ]
}`;

  const userMessage = `Here is the product/business idea to evaluate:
"""
${ideaText}
"""

Generate exactly ${panelSize} realistic, highly relevant personas strictly from the "${presetConfig.label}" cohort.`;

  const result = await jsonCompletion({
    model: GROQ_MODELS.REASONING,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    schema: personaGenerationResultSchema,
    temperature: 0.7,
    seed: options?.seed,
    tracker: options?.tracker,
  });

  const personasToInsert = result.personas.slice(0, panelSize);
  if (personasToInsert.length === 0) {
    throw new Error(`No personas generated for job ${jobId}`);
  }

  const values: any[] = [];
  const valueClauses: string[] = [];
  const systemPrompts: string[] = [];

  personasToInsert.forEach((profile, i) => {
    const systemPrompt = buildPersonaSystemPrompt(profile);
    systemPrompts.push(systemPrompt);
    const offset = i * 3;
    valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'pending')`);
    values.push(jobId, JSON.stringify(profile), systemPrompt);
  });

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO personas (job_id, profile, system_prompt, status)
     VALUES ${valueClauses.join(", ")}
     RETURNING id`,
    values
  );

  const records: PersonaRecord[] = inserted.map((ins, i) => ({
    id: ins.id,
    job_id: jobId,
    profile: personasToInsert[i]!,
    system_prompt: systemPrompts[i]!,
  }));

  logger.info("personas inserted", { jobId, count: records.length });
  return records;
}
