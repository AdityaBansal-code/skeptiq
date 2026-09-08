import { chatCompletion, GROQ_MODELS, TokenTracker } from "../ai/groq.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import type { PersonaRecord } from "./1-generatePersonas.js";
import type { IndependentReaction } from "./2-independentReactions.js";
import type { ClusterRecord } from "./3-clustering.js";
import type { MarketContext } from "../ai/search.js";

export interface CrossTalkTurn {
  id: string;
  personaId: string;
  content: string;
  roundNumber: number;
}

export async function runCrossTalk(
  jobId: string,
  ideaText: string,
  personas: PersonaRecord[],
  reactions: IndependentReaction[],
  clusters: ClusterRecord[],
  options?: {
    mode?: "segmentation" | "consensus";
    targetRounds?: number;
    marketContext?: MarketContext;
    seed?: number | null;
    tracker?: TokenTracker;
  }
): Promise<CrossTalkTurn[]> {
  const mode = options?.mode ?? "segmentation";
  const targetRounds = options?.targetRounds ?? 12;
  const marketContext = options?.marketContext;

  logger.info("running cross-talk focus group deliberation", {
    jobId,
    mode,
    targetRounds,
    clusterCount: clusters.length,
    personaCount: personas.length,
    hasMarketContext: !!marketContext,
  });

  if (personas.length === 0) return [];

  const personaMap = new Map<string, PersonaRecord>(personas.map((p) => [p.id, p]));
  const turns: CrossTalkTurn[] = [];

  // Helper to record a turn
  async function recordTurn(
    personaId: string,
    content: string,
    roundNumber: number,
    respondingToTurnId?: string
  ): Promise<CrossTalkTurn | null> {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO turns (job_id, persona_id, phase, round_number, content, responding_to_turn_id)
         VALUES ($1, $2, 'crosstalk', $3, $4, $5)
         RETURNING id`,
        [jobId, personaId, roundNumber, content, respondingToTurnId ?? null]
      );
      const inserted = rows[0];
      if (!inserted) return null;

      const record: CrossTalkTurn = {
        id: inserted.id,
        personaId,
        content,
        roundNumber,
      };
      turns.push(record);
      return record;
    } catch (err) {
      logger.warn("failed to record crosstalk turn", { error: String(err) });
      return null;
    }
  }

  const clusterCount = Math.max(1, clusters.length);
  const verdictTurnsTarget = Math.min(clusterCount, Math.max(1, Math.floor(targetRounds * 0.25)));
  const openingTurnsTarget = Math.min(clusterCount, Math.max(1, Math.floor(targetRounds * 0.25)));
  const middleTurnsTarget = Math.max(1, targetRounds - (verdictTurnsTarget + openingTurnsTarget));
  const debateTurnsTarget = Math.ceil(middleTurnsTarget * 0.6);
  const pricingTurnsTarget = Math.max(1, middleTurnsTarget - debateTurnsTarget);

  let currentRound = 1;

  const ANTI_CLICHE_RULES = `
CRITICAL CONVERSATIONAL RULES:
- STRICTLY FORBIDDEN OPENERS: Never start your response with "Look...", "Honestly...", "I think you're missing the point...", "You're completely missing the point...", "Look, I get...", "My final stance is...", or "The #1 non-negotiable condition is...".
- NO REPETITIVE SCRIPTS: Do NOT repeat the exact same tool or complaint you or others already mentioned. Advance the discussion with new details, trade-offs, or questions.
- REAL HUMAN DYNAMICS: Talk like a real person in a live room. You can acknowledge good points made by others ("That's a fair point on citations...", "Wait, why would you need a CSV if..."), qualify your position, or ask practical questions.
- Length: 1 to 3 natural spoken sentences.`;

  function getRecentDialogueContext(count = 3): string {
    const recent = turns.slice(-count);
    if (recent.length === 0) return "";
    return `RECENT GROUP CONVERSATION:\n` +
      recent
        .map((t) => {
          const p = personaMap.get(t.personaId);
          // Strip internal monologue for the other participants' listening context
          const cleanSpoken = t.content.replace(/💭\s*\*\([^)]+\)\*\s*/g, "").trim();
          return `${p?.profile.name || "Participant"} (${p?.profile.archetype || "User"}): "${cleanSpoken}"`;
        })
        .join("\n");
  }

  // ── PHASE 1: Initial Discovery & Practical Probing ──────────────────────────
  logger.info("starting crosstalk phase 1: practical probing", { jobId, targetTurns: openingTurnsTarget });
  const openingTurns: { turnId: string; persona: PersonaRecord; clusterLabel: string; content: string }[] = [];

  for (let i = 0; i < openingTurnsTarget && turns.length < targetRounds; i++) {
    const cluster = clusters[i % clusters.length];
    if (!cluster) continue;
    const clusterPersonas = cluster.personaIds
      .map((id) => personaMap.get(id))
      .filter((p): p is PersonaRecord => Boolean(p));
    const speaker = clusterPersonas[0] || personas[i % personas.length];
    if (!speaker) continue;

    const initialReaction = reactions.find((r) => r.personaId === speaker.id);
    const prompt = `You are participating in a live market research focus group evaluating:
"""
${ideaText}
"""
You represent the perspective of "${cluster.label}".
Your initial thought was: "${initialReaction?.content || "I have some reservations about this."}"
${initialReaction?.privateReservation ? `Your private unspoken thought: "${initialReaction.privateReservation}"` : ""}
${ANTI_CLICHE_RULES}

Format your output in two parts:
💭 *(Internal: 1 realistic, unvarnished gut thought about how this affects your daily routine or reputation)*

"<Your 1-2 sentence spoken opening to the group, raising a practical question or specific concern.>"`;

    try {
      const content = await chatCompletion({
        model: GROQ_MODELS.FAST,
        messages: [
          { role: "system", content: speaker.system_prompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.75,
        maxTokens: 250,
        seed: options?.seed,
        tracker: options?.tracker,
      });

      const turn = await recordTurn(speaker.id, content, currentRound++);
      if (turn) {
        openingTurns.push({
          turnId: turn.id,
          persona: speaker,
          clusterLabel: cluster.label,
          content,
        });
      }
    } catch (err) {
      logger.warn("opening turn failed", { error: String(err) });
    }
  }

  // ── PHASE 2: Causal Cross-Talk & Belief Updating ───────────────────────────
  logger.info("starting crosstalk phase 2: active causal deliberation", { jobId, targetTurns: debateTurnsTarget });

  for (let i = 0; i < debateTurnsTarget && turns.length < targetRounds; i++) {
    const lastTurn = turns[turns.length - 1];
    // Pick a speaker different from the last 2 turns to ensure natural group rotation
    const recentSpeakerIds = new Set(turns.slice(-2).map((t) => t.personaId));
    const availablePersonas = personas.filter((p) => !recentSpeakerIds.has(p.id));
    const responder = availablePersonas[i % (availablePersonas.length || 1)] || personas[0];
    if (!responder) continue;

    const dialogueHistory = getRecentDialogueContext(3);
    const competitorRef = marketContext?.topCompetitors?.length
      ? `(Existing market tools in play: ${marketContext.topCompetitors.slice(0, 3).join(", ")})`
      : "";

    const isConsensusMode = mode === "consensus";
    const prompt = isConsensusMode
      ? `You are participating in a structured Delphi consensus research panel evaluating:
"""
${ideaText}
"""
${competitorRef}

${dialogueHistory}
${ANTI_CLICHE_RULES}

The panel is seeking common ground and policy/feature compromises:
- Address the reservations or conditions raised by previous participants.
- What specific compromise, concession, or safeguard (e.g. self-hosting, trial period, SLA, integration, or freemium tier) would be necessary for you to align with the rest of the group?
- Be pragmatic about what you can concede vs what is a hard non-negotiable for your role.`
      : `You are actively participating in the focus group discussing:
"""
${ideaText}
"""
${competitorRef}

${dialogueHistory}
${ANTI_CLICHE_RULES}

Respond directly to what was just discussed in the room:
- Address a specific point or question raised by one of the recent speakers.
- You can agree with parts of their point, push back on an assumption, suggest a practical workaround, or explain how your own workflow differs.
- Advance the conversation naturally with new insight. Do NOT repeat yourself or use AI cliché openers.`;

    try {
      const content = await chatCompletion({
        model: GROQ_MODELS.FAST,
        messages: [
          { role: "system", content: responder.system_prompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.75,
        maxTokens: 250,
        seed: options?.seed,
        tracker: options?.tracker,
      });

      await recordTurn(responder.id, content, currentRound++, lastTurn?.id);
    } catch (err) {
      logger.warn("debate turn failed", { error: String(err) });
    }
  }

  // ── PHASE 3: Pricing, Packaging & Substitution Realities ────────────────────
  logger.info("starting crosstalk phase 3: packaging & economic reality check", { jobId, targetTurns: pricingTurnsTarget });

  for (let i = 0; i < pricingTurnsTarget && turns.length < targetRounds; i++) {
    const recentSpeakerIds = new Set(turns.slice(-2).map((t) => t.personaId));
    const availablePersonas = personas.filter((p) => !recentSpeakerIds.has(p.id));
    const speaker = availablePersonas[(i + 1) % (availablePersonas.length || 1)] || personas[0];
    if (!speaker) continue;

    const dialogueHistory = getRecentDialogueContext(3);
    const pricingClues = marketContext?.typicalPricingModels?.length
      ? `(Common market pricing: ${marketContext.typicalPricingModels.slice(0, 2).join("; ")})`
      : "";

    const isConsensusMode = mode === "consensus";
    const prompt = isConsensusMode
      ? `The consensus panel is evaluating pricing and business model compromises:
"""
${ideaText}
"""
${pricingClues}

${dialogueHistory}
${ANTI_CLICHE_RULES}

Evaluate whether a mutually acceptable economic model exists across the diverse participants in this room:
- Could a tiered model, usage-based model, or freemium entry point reconcile budget gatekeepers with power users?
- What pricing compromise would you accept to make this viable for the entire organization or team?`
      : `The focus group conversation turns to pricing models, monetization, and feature tiers:
"""
${ideaText}
"""
${pricingClues}

${dialogueHistory}
${ANTI_CLICHE_RULES}

Weigh in on the business model and economics:
- What packaging or pricing structure (e.g., ad-supported/free tier, low monthly subscription, sponsor-backed, usage-based, or pay-per-report) would actually fit your budget or make sense for this?
- Compare that to what you currently tolerate or spend on existing alternatives. Keep it realistic and conversational.`;

    try {
      const content = await chatCompletion({
        model: GROQ_MODELS.FAST,
        messages: [
          { role: "system", content: speaker.system_prompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.75,
        maxTokens: 250,
        seed: options?.seed,
        tracker: options?.tracker,
      });

      await recordTurn(speaker.id, content, currentRound++);
    } catch (err) {
      logger.warn("pricing turn failed", { error: String(err) });
    }
  }

  // ── PHASE 4: Grounded Conclusions & Nuanced Takeaways ───────────────────────
  logger.info("starting crosstalk phase 4: grounded takeaways", { jobId, targetTurns: verdictTurnsTarget });

  for (let i = 0; i < verdictTurnsTarget && turns.length < targetRounds; i++) {
    const recentSpeakerIds = new Set(turns.slice(-1).map((t) => t.personaId));
    const candidatePersonas = personas.filter((p) => !recentSpeakerIds.has(p.id));
    const speaker = candidatePersonas[i % (candidatePersonas.length || 1)] || personas[i % personas.length];
    if (!speaker) continue;

    const dialogueHistory = getRecentDialogueContext(3);
    const isConsensusMode = mode === "consensus";
    const prompt = isConsensusMode
      ? `The Delphi consensus deliberation is wrapping up. Deliver your final alignment stance to the panel:
"""
${ideaText}
"""

${dialogueHistory}
${ANTI_CLICHE_RULES}

Summarize your final verdict:
- Do you see a viable consensus compromise for this idea across the group, or is the division irreconcilable?
- State your clear final position: (Full Consensus / Conditional Support on Compromise / Incompatible).
- Be concise (2-3 sentences) and speak naturally without generic analyst jargon.`
      : `The focus group is wrapping up after a thorough deliberation:
"""
${ideaText}
"""

${dialogueHistory}
${ANTI_CLICHE_RULES}

Share your natural closing perspective with the group:
- Taking in the whole discussion, what is your realistic takeaway? (e.g. Would you actually test/use it, pass because your current setup is sufficient, or only try a specific free/trial version?)
- What single deciding factor or feature makes the biggest difference for your decision?
- Speak naturally and casually without saying "In conclusion" or "My final stance is...".`;

    try {
      const content = await chatCompletion({
        model: GROQ_MODELS.FAST,
        messages: [
          { role: "system", content: speaker.system_prompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.75,
        maxTokens: 250,
        seed: options?.seed,
        tracker: options?.tracker,
      });

      await recordTurn(speaker.id, content, currentRound++);
    } catch (err) {
      logger.warn("verdict turn failed", { error: String(err) });
    }
  }

  logger.info("cross-talk focus group completed", {
    jobId,
    totalTurnsGenerated: turns.length,
    targetRounds,
  });

  return turns;
}
