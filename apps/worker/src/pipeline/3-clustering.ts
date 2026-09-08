import { kmeans } from "ml-kmeans";
import { z } from "zod";
import { GROQ_MODELS, jsonCompletion } from "../ai/groq.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import type { PersonaRecord } from "./1-generatePersonas.js";
import type { IndependentReaction } from "./2-independentReactions.js";

export interface ClusterRecord {
  id: string;
  jobId: string;
  label: string;
  summary: string;
  size: number;
  personaIds: string[];
}

const clusterLabelSchema = z.object({
  label: z.string().min(1),
  summary: z.string().min(1),
});

function euclideanDistance(v1: number[], v2: number[]): number {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const d = (v1[i] ?? 0) - (v2[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Computes mean Silhouette Coefficient across sample clusters (-1 to +1).
 */
export function computeSilhouetteScore(data: number[][], clusterAssignments: number[]): number {
  const n = data.length;
  if (n <= 2) return 0;

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = clusterAssignments[i] ?? 0;
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c)!.push(i);
  }

  if (clusters.size <= 1 || clusters.size >= n) return 0;

  let totalSilhouette = 0;

  for (let i = 0; i < n; i++) {
    const currentCluster = clusterAssignments[i] ?? 0;
    const sameClusterIndices = clusters.get(currentCluster)!;

    // Compute a(i): average distance to points in same cluster
    let a = 0;
    if (sameClusterIndices.length > 1) {
      let sumDist = 0;
      for (const idx of sameClusterIndices) {
        if (idx !== i) sumDist += euclideanDistance(data[i]!, data[idx]!);
      }
      a = sumDist / (sameClusterIndices.length - 1);
    }

    // Compute b(i): minimum average distance to points in any other cluster
    let b = Infinity;
    for (const [otherCluster, otherIndices] of clusters.entries()) {
      if (otherCluster === currentCluster || otherIndices.length === 0) continue;
      let sumDist = 0;
      for (const idx of otherIndices) {
        sumDist += euclideanDistance(data[i]!, data[idx]!);
      }
      const avgDist = sumDist / otherIndices.length;
      if (avgDist < b) b = avgDist;
    }

    if (b === Infinity) b = 0;
    const maxVal = Math.max(a, b);
    const s = maxVal === 0 ? 0 : (b - a) / maxVal;
    totalSilhouette += s;
  }

  return totalSilhouette / n;
}

/**
 * Automatically determines optimal k (number of market segments) via Silhouette Score.
 */
function findOptimalK(data: number[][], maxK = 5): { k: number; clusters: number[]; score: number } {
  const n = data.length;
  if (n <= 3) {
    return { k: 1, clusters: new Array(n).fill(0), score: 0 };
  }

  const minK = 2;
  const upperK = Math.min(maxK, n - 1);
  let bestK = 2;
  let bestScore = -Infinity;
  let bestClusters = new Array(n).fill(0);

  for (let k = minK; k <= upperK; k++) {
    try {
      const res = kmeans(data, k, { maxIterations: 40 });
      const score = computeSilhouetteScore(data, res.clusters);
      if (score > bestScore) {
        bestScore = score;
        bestK = k;
        bestClusters = res.clusters;
      }
    } catch {
      // Continue to next k candidate
    }
  }

  return { k: bestK, clusters: bestClusters, score: bestScore };
}

export async function runClustering(
  jobId: string,
  ideaText: string,
  personas: PersonaRecord[],
  reactions: IndependentReaction[],
  targetClusters?: number | null
): Promise<ClusterRecord[]> {
  logger.info("running semantic clustering", {
    jobId,
    reactionCount: reactions.length,
    requestedClusters: targetClusters ?? "auto",
  });

  if (reactions.length === 0) {
    throw new Error("Cannot run clustering: No successful persona reactions were generated.");
  }

  const data = reactions.map((r) => r.embedding);
  let clusterIndices: number[];
  let selectedK: number;

  if (data.length <= 1) {
    clusterIndices = new Array(data.length).fill(0);
    selectedK = 1;
  } else if (targetClusters && targetClusters >= 2) {
    // User requested explicit fixed k
    selectedK = Math.min(targetClusters, reactions.length);
    try {
      const result = kmeans(data, selectedK, { maxIterations: 50 });
      clusterIndices = result.clusters;
    } catch {
      clusterIndices = new Array(reactions.length).fill(0);
      selectedK = 1;
    }
  } else {
    // Auto-pick optimal k via Silhouette Score
    const optimal = findOptimalK(data, 5);
    selectedK = optimal.k;
    clusterIndices = optimal.clusters;
    logger.info("auto-selected optimal segment count via silhouette score", {
      jobId,
      optimalK: selectedK,
      silhouetteScore: optimal.score.toFixed(3),
    });
  }

  // Group reactions by cluster index
  const groups = new Map<number, IndependentReaction[]>();
  for (let i = 0; i < reactions.length; i++) {
    const cIdx = clusterIndices[i] ?? 0;
    const currentReaction = reactions[i];
    if (!currentReaction) continue;
    if (!groups.has(cIdx)) groups.set(cIdx, []);
    groups.get(cIdx)!.push(currentReaction);
  }

  const personaMap = new Map<string, PersonaRecord>(personas.map((p) => [p.id, p]));
  const clusterRecords: ClusterRecord[] = [];

  // Generate label & summary for each cluster using Groq
  for (const [idx, clusterReactions] of groups.entries()) {
    const quotes = clusterReactions
      .map((r) => {
        const p = personaMap.get(r.personaId);
        return `- ${r.personaName} (${p?.profile.archetype || "User"}): "${r.content}"`;
      })
      .join("\n");

    const systemPrompt = `You are a market segmentation analyst.
Given an idea and a group of consumer reactions that were clustered by semantic similarity, give this market segment:
1. A punchy 3-5 word label (e.g. "Price-Sensitive Students", "Quality-First Commuters").
2. A 1-sentence summary characterizing what unites their stance, friction points, or requirements.

Return JSON matching:
{
  "label": "Segment Label",
  "summary": "1-sentence summary"
}`;

    const userPrompt = `Idea: "${ideaText}"

Reactions in this cluster:
${quotes}`;

    let label = `Segment ${idx + 1}`;
    let summary = "Group of consumer reactions with similar needs and objections.";

    try {
      const completion = await jsonCompletion({
        model: GROQ_MODELS.FAST,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        schema: clusterLabelSchema,
        temperature: 0.3,
      });
      label = completion.label;
      summary = completion.summary;
    } catch (err) {
      logger.warn("failed to generate cluster label with LLM, using fallback", {
        jobId,
        idx,
        error: String(err),
      });
    }

    const personaIds = clusterReactions.map((r) => r.personaId);

    // Insert into clusters table
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO clusters (job_id, label, summary, size)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [jobId, label, summary, personaIds.length]
    );

    const inserted = rows[0];
    if (!inserted) throw new Error("Insert cluster failed");
    const clusterId = inserted.id;

    // Update cluster_id on personas
    await pool.query(
      `UPDATE personas SET cluster_id = $1 WHERE id = ANY($2::uuid[])`,
      [clusterId, personaIds]
    );

    clusterRecords.push({
      id: clusterId,
      jobId,
      label,
      summary,
      size: personaIds.length,
      personaIds,
    });

    logger.info("cluster persisted", { jobId, label, size: personaIds.length });
  }

  return clusterRecords;
}
