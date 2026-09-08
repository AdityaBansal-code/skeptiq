import {
  reportSummarySchema,
  type ReportSummary,
  type PriceSensitivity,
  type VanWestendorpPricing,
} from "@repo/shared";
import { GROQ_MODELS, jsonCompletion, TokenTracker } from "../ai/groq.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import type { PersonaRecord } from "./1-generatePersonas.js";
import type { IndependentReaction } from "./2-independentReactions.js";
import type { ClusterRecord } from "./3-clustering.js";
import type { CrossTalkTurn } from "./4-crossTalk.js";

export function calculateVanWestendorpPSM(
  reactions: IndependentReaction[]
): PriceSensitivity | undefined {
  const validPricings = reactions
    .map((r) => r.pricing)
    .filter((p): p is VanWestendorpPricing => Boolean(p && p.tooExpensive > 0));

  if (validPricings.length < 2) return undefined;

  const currency = validPricings[0]?.currency || "USD";
  const n = validPricings.length;

  const tooCheaps = validPricings.map((p) => p.tooCheap).sort((a, b) => a - b);
  const bargains = validPricings.map((p) => p.bargain).sort((a, b) => a - b);
  const expensives = validPricings.map((p) => p.expensive).sort((a, b) => a - b);
  const tooExpensives = validPricings.map((p) => p.tooExpensive).sort((a, b) => a - b);

  const minPrice = Math.min(...tooCheaps, ...bargains, ...expensives, ...tooExpensives);
  const maxPrice = Math.max(...tooCheaps, ...bargains, ...expensives, ...tooExpensives);

  if (maxPrice <= 0) return undefined;

  // Evaluate across a fine-grained grid (500 steps) for smooth continuous intersections
  const STEPS = 500;
  const stepSize = Math.max(0.01, (maxPrice - minPrice) / STEPS);
  const grid: number[] = [];
  for (let p = minPrice; p <= maxPrice + stepSize / 2; p += stepSize) {
    grid.push(Number(p.toFixed(2)));
  }

  function getCDF(price: number) {
    // Too Cheap (Reversed CDF: % of respondents who believe price <= p is suspiciously cheap)
    const pctTooCheap = tooCheaps.filter((p) => price <= p).length / n;
    // Bargain (Reversed CDF: % of respondents who believe price <= p is a bargain)
    const pctBargain = bargains.filter((p) => price <= p).length / n;
    // Expensive (Normal CDF: % of respondents who believe price >= p is expensive)
    const pctExpensive = expensives.filter((p) => price >= p).length / n;
    // Too Expensive (Normal CDF: % of respondents who believe price >= p is prohibitively expensive)
    const pctTooExpensive = tooExpensives.filter((p) => price >= p).length / n;
    return { pctTooCheap, pctBargain, pctExpensive, pctTooExpensive };
  }

  // 1. Point of Marginal Cheapness (PMC): Intersection of Too Cheap & Expensive
  let pmc = grid[0]!;
  let minPmcDiff = Infinity;

  // 2. Optimal Price Point (OPP): Intersection of Too Cheap & Too Expensive
  let opp = grid[0]!;
  let minOppDiff = Infinity;

  // 3. Indifference Price Point (IPP): Intersection of Bargain & Expensive
  let ipp = grid[0]!;
  let minIppDiff = Infinity;

  // 4. Point of Marginal Expensiveness (PME): Intersection of Bargain & Too Expensive
  let pme = grid[grid.length - 1]!;
  let minPmeDiff = Infinity;

  for (const price of grid) {
    const { pctTooCheap, pctBargain, pctExpensive, pctTooExpensive } = getCDF(price);

    // PMC: Too Cheap (descending) crosses Expensive (ascending)
    const pmcDiff = Math.abs(pctTooCheap - pctExpensive);
    if (pmcDiff < minPmcDiff) {
      minPmcDiff = pmcDiff;
      pmc = price;
    }

    // OPP: Too Cheap (descending) crosses Too Expensive (ascending)
    const oppDiff = Math.abs(pctTooCheap - pctTooExpensive);
    if (oppDiff < minOppDiff) {
      minOppDiff = oppDiff;
      opp = price;
    }

    // IPP: Bargain (descending) crosses Expensive (ascending)
    const ippDiff = Math.abs(pctBargain - pctExpensive);
    if (ippDiff < minIppDiff) {
      minIppDiff = ippDiff;
      ipp = price;
    }

    // PME: Bargain (descending) crosses Too Expensive (ascending)
    const pmeDiff = Math.abs(pctBargain - pctTooExpensive);
    if (pmeDiff < minPmeDiff) {
      minPmeDiff = pmeDiff;
      pme = price;
    }
  }

  // Guarantee monotonic sanity ordering: PMC <= OPP <= IPP <= PME
  const orderedPmc = Math.min(pmc, opp);
  const orderedOpp = Math.max(orderedPmc, Math.min(opp, ipp));
  const orderedIpp = Math.max(orderedOpp, Math.min(ipp, pme));
  const orderedPme = Math.max(orderedIpp, pme);

  const rangeLow = Math.min(orderedPmc, orderedOpp);
  const rangeHigh = Math.max(orderedPme, orderedIpp);

  const roundPrice = (val: number) => (val >= 10 ? Math.round(val) : Number(val.toFixed(1)));

  const finalOpp = roundPrice(orderedOpp);
  const finalIpp = roundPrice(orderedIpp);
  const finalPmc = roundPrice(orderedPmc);
  const finalPme = roundPrice(orderedPme);
  const finalLow = roundPrice(rangeLow);
  const finalHigh = roundPrice(rangeHigh);

  const priceRecommendation = `Optimal Price Point (OPP) is ${currency} ${finalOpp.toLocaleString()} (Indifference Point: ${currency} ${finalIpp.toLocaleString()}). The acceptable market pricing band is ${currency} ${finalLow.toLocaleString()} to ${currency} ${finalHigh.toLocaleString()}. Pricing above ${currency} ${finalHigh.toLocaleString()} triggers immediate buyer rejection.`;

  return {
    optimalPricePoint: finalOpp,
    indifferencePricePoint: finalIpp,
    pointOfMarginalCheapness: finalPmc,
    pointOfMarginalExpensiveness: finalPme,
    acceptableRangeLow: finalLow,
    acceptableRangeHigh: finalHigh,
    currency,
    priceRecommendation,
    sampleSize: n,
  };
}

export async function synthesizeReport(
  jobId: string,
  ideaText: string,
  personas: PersonaRecord[],
  clusters: ClusterRecord[],
  reactions: IndependentReaction[],
  crossTalkTurns: CrossTalkTurn[],
  options?: {
    mode?: "segmentation" | "consensus";
    parentJobId?: string | null;
    seed?: number | null;
    tracker?: TokenTracker;
  }
): Promise<ReportSummary> {
  const mode = options?.mode ?? "segmentation";
  const parentJobId = options?.parentJobId;
  const isConsensusMode = mode === "consensus";

  logger.info("synthesizing final validation report with PSM, action plan & citations", {
    jobId,
    mode,
    isBranch: !!parentJobId,
  });

  const personaMap = new Map<string, PersonaRecord>(personas.map((p) => [p.id, p]));

  // 1. Fetch parent report if this is a branched pivot run
  let parentReport: ReportSummary | null = null;
  if (parentJobId) {
    try {
      const { rows } = await pool.query<{ summary_json: ReportSummary }>(
        `SELECT summary_json FROM reports WHERE job_id = $1`,
        [parentJobId]
      );
      if (rows[0]?.summary_json) {
        parentReport = rows[0].summary_json;
        logger.info("loaded parent report for pivot delta comparison", { parentJobId });
      }
    } catch (err) {
      logger.warn("failed to fetch parent report for delta comparison", { error: String(err) });
    }
  }

  // 2. Compute Van Westendorp PSM Modeling
  const priceSensitivity = calculateVanWestendorpPSM(reactions);

  // 3. Summarize cognitive biases encountered
  const cognitiveBiasesEncountered = Array.from(
    new Set(
      personas
        .map((p) => p.profile.cognitiveBias)
        .filter((b): b is string => Boolean(b))
    )
  );

  // 4. Build transcript digest (safely capped for max panel and round sizes)
  const clusterSummaries = clusters
    .map((c) => {
      const clusterReactions = reactions
        .filter((r) => c.personaIds.includes(r.personaId))
        .slice(0, 3)
        .map((r) => `  - "${r.content}" (by ${r.personaName})`)
        .join("\n");
      return `### Segment: ${c.label} (${c.size} personas, ${Math.round((c.size / (personas.length || 1)) * 100)}% of panel)
Summary: ${c.summary}
Key Initial Reactions:
${clusterReactions}`;
    })
    .join("\n\n");

  const crossTalkDigest = crossTalkTurns
    .slice(-20)
    .map((t) => {
      const p = personaMap.get(t.personaId);
      return `Round ${t.roundNumber} - ${p?.profile.name || "Participant"} (${p?.profile.archetype || "User"}): "${t.content}"`;
    })
    .join("\n");

  const pivotBlock = parentReport
    ? `\nPREVIOUS RUN BENCHMARK (PARENT SIMULATION):
- Previous Verdict: "${parentReport.headline}"
- Previous Adoption Range: ${parentReport.overallAdoptionLow}% – ${parentReport.overallAdoptionHigh}%
- Previous Major Dealbreakers: ${parentReport.crossCuttingObjections.join("; ")}
Compare this new pivot pitch directly against the previous benchmark. Fill the "pivotDelta" field in the output JSON.\n`
    : "";

  const systemPrompt = `You are an elite startup advisor, venture researcher, and methodology director.
You synthesize multi-agent focus group experiments into rigorous market validation reports with concrete decision-support action plans.
${pivotBlock}
SIMULATION MODE: "${mode.toUpperCase()}"

CRITICAL METHODOLOGICAL RULES:
1. Never collapse to a single vanity score. Provide realistic adoption likelihood ranges (low to high).
2. Highlight honest friction: Identify dealbreakers, unit economic doubts, and structural barriers.
3. Every segment must have adoptionLikelihoodLow <= adoptionLikelihoodHigh.
4. overallAdoptionLow MUST be <= overallAdoptionHigh.
5. The panelSizeEffective must be ${personas.length}.
6. ACTION PLAN: You MUST formulate a concrete, decisive next-step validation roadmap ("actionPlan") that identifies the riskiest assumption, the cheapest test experiment to run with real human users, target interview profile, and exact invalidation threshold.
7. EVIDENCE CLAIMS: Provide 2 to 4 auditable claims ("evidenceClaims") citing specific persona names and verbatim excerpts from the dialogue.
${
  isConsensusMode
    ? `8. CONSENSUS MODE: Fill "consensusMetrics":
   - "convergenceScore": integer between 0 and 100 representing group alignment index
   - "universalAgreements": list of shared ground agreed upon across participants
   - "unresolvedContestations": list of fundamental irreconcilable divisions
   - "keyCompromisesRequired": specific feature/pricing concessions needed to align the room
   - "finalGroupStance": "strong_consensus" | "conditional_compromise" | "divided_stalemate" | "universal_rejection"`
    : ""
}
${
  parentReport
    ? `9. In "pivotDelta":
   - "previousAdoptionLow": ${parentReport.overallAdoptionLow}
   - "previousAdoptionHigh": ${parentReport.overallAdoptionHigh}
   - "deltaLow": (new overallAdoptionLow - previousAdoptionLow)
   - "deltaHigh": (new overallAdoptionHigh - previousAdoptionHigh)
   - "resolvedObjections": list of previous objections that this pivot successfully addressed
   - "newObjections": list of new friction points introduced by this pivot
   - "verdictComparison": 1-2 sentences comparing overall market appeal vs original pitch`
    : ""
}

Format strictly according to this JSON structure:
{
  "headline": "A sharp, 1-line verdict on the market viability and primary constraint",
  "segments": [
    {
      "label": "Segment Name",
      "sizePct": 40,
      "stance": "adopt" | "conditional" | "reject",
      "adoptionLikelihoodLow": 20,
      "adoptionLikelihoodHigh": 45,
      "keyObjections": ["objection 1", "objection 2"],
      "conditions": ["must have condition 1"],
      "notableQuotes": ["direct or paraphrased quote"]
    }
  ],
  "crossCuttingObjections": ["universal objection 1", "universal objection 2"],
  "overallAdoptionLow": 15,
  "overallAdoptionHigh": 40,
  "panelSizeEffective": ${personas.length},
  "caveats": ["sampling caveat 1", "operational caveat 2"],
  "actionPlan": {
    "riskiestAssumption": "The #1 unproven leap of faith",
    "cheapestValidationExperiment": "Low-cost real-world experiment (e.g. landing page test, mock concierge pilot, manual workflow)",
    "targetInterviewProfile": "Exact profile of 5 real humans to interview this week",
    "suggestedQuestions": ["Specific open-ended interview question 1", "Question 2"],
    "successThreshold": "Metric that confirms validation (e.g. >= 3/5 sign LOI)",
    "invalidationCriteria": "Finding that proves idea should be abandoned or pivoted"
  },
  "evidenceClaims": [
    {
      "claim": "Main factual takeaway or behavioral objection",
      "supportingPersonaNames": ["Name 1", "Name 2"],
      "opposingPersonaNames": ["Name 3"],
      "verbatimExcerpt": "Direct dialogue quote grounding this finding"
    }
  ]${
    isConsensusMode
      ? `,
  "consensusMetrics": {
    "convergenceScore": 65,
    "universalAgreements": ["Agreement 1", "Agreement 2"],
    "unresolvedContestations": ["Division 1"],
    "keyCompromisesRequired": ["Compromise 1"],
    "finalGroupStance": "conditional_compromise"
  }`
      : ""
  }${
    parentReport
      ? `,
  "pivotDelta": {
    "previousAdoptionLow": ${parentReport.overallAdoptionLow},
    "previousAdoptionHigh": ${parentReport.overallAdoptionHigh},
    "deltaLow": 0,
    "deltaHigh": 0,
    "resolvedObjections": ["string"],
    "newObjections": ["string"],
    "verdictComparison": "string"
  }`
      : ""
  }
}`;

  const userPrompt = `Product/Business Idea Under Evaluation:
"""
${ideaText}
"""

MARKET SEGMENTS & INITIAL REACTIONS:
${clusterSummaries}

CROSS-TALK DISCUSSION ROUNDS:
${crossTalkDigest}

Produce the comprehensive validation report JSON based on the simulated panel.`;

  const report = await jsonCompletion({
    model: GROQ_MODELS.REASONING,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    schema: reportSummarySchema,
    temperature: 0.3,
    seed: options?.seed,
    tracker: options?.tracker,
  });

  if (parentReport && report.pivotDelta) {
    report.pivotDelta.parentJobId = parentJobId || undefined;
  }

  // Attach computed PSM and cognitive biases
  if (priceSensitivity) {
    report.priceSensitivity = priceSensitivity;
  }
  if (cognitiveBiasesEncountered.length > 0) {
    report.cognitiveBiasesEncountered = cognitiveBiasesEncountered;
  }

  // Persist report into reports table
  await pool.query(
    `INSERT INTO reports (job_id, summary_json)
     VALUES ($1, $2)
     ON CONFLICT (job_id) DO UPDATE SET summary_json = $2, generated_at = NOW()`,
    [jobId, JSON.stringify(report)]
  );

  logger.info("report synthesized and persisted", {
    jobId,
    headline: report.headline,
    overallRange: `${report.overallAdoptionLow}% - ${report.overallAdoptionHigh}%`,
    hasPriceSensitivity: !!report.priceSensitivity,
    hasPivotDelta: !!report.pivotDelta,
    hasActionPlan: !!report.actionPlan,
    hasConsensusMetrics: !!report.consensusMetrics,
  });

  return report;
}
