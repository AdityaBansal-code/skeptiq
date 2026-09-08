import http from "node:http";
import { pool } from "./db.js";
import { logger } from "./logger.js";
import { env } from "./env.js";
import { chatCompletion } from "./ai/groq.js";

interface WorkerStats {
  bootTime: Date;
  processedCount: number;
  failedCount: number;
  currentJobId: string | null;
  lastHeartbeat: Date | null;
}

export const workerStats: WorkerStats = {
  bootTime: new Date(),
  processedCount: 0,
  failedCount: 0,
  currentJobId: null,
  lastHeartbeat: null,
};

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let bodyStr = "";
  for await (const chunk of req) {
    bodyStr += chunk;
  }

  let data: { jobId?: string; personaId?: string; question?: string; userId?: string };
  try {
    data = JSON.parse(bodyStr);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const { jobId, personaId, question } = data;
  if (!jobId || !question?.trim()) {
    res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "jobId and question are required" }));
    return;
  }

  try {
    const jobRes = await pool.query<{ description: string }>(
      `SELECT i.raw_text as description
       FROM simulation_jobs j
       JOIN ideas i ON i.id = j.idea_id
       WHERE j.id = $1`,
      [jobId]
    );

    if (jobRes.rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Simulation job not found" }));
      return;
    }
    const ideaDescription = jobRes.rows[0]?.description || "";

    let rawPersona: any;
    if (personaId) {
      const pRes = await pool.query(
        `SELECT p.id, p.profile, cl.label as cluster_label, cl.summary as cluster_summary
         FROM personas p
         LEFT JOIN clusters cl ON cl.id = p.cluster_id
         WHERE p.job_id = $1 AND p.id = $2`,
        [jobId, personaId]
      );
      rawPersona = pRes.rows[0];
    } else {
      const skepticRes = await pool.query(
        `SELECT p.id, p.profile, cl.label as cluster_label, cl.summary as cluster_summary
         FROM personas p
         LEFT JOIN clusters cl ON cl.id = p.cluster_id
         WHERE p.job_id = $1
         ORDER BY p.created_at ASC
         LIMIT 1`,
        [jobId]
      );
      rawPersona = skepticRes.rows[0];
    }

    if (!rawPersona) {
      res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Persona not found for this simulation" }));
      return;
    }

    const profile = typeof rawPersona.profile === "string" ? JSON.parse(rawPersona.profile) : rawPersona.profile;
    const personaName = profile?.name || "Focus Group Member";
    const personaOccupation = profile?.demographics?.occupation || profile?.archetype || "Consumer";
    const clusterLabel = rawPersona.cluster_label || "General Panel";
    const clusterSummary = rawPersona.cluster_summary || "";

    const turnsRes = await pool.query<{ phase: string; round_number: number; content: string }>(
      `SELECT phase, round_number, content
       FROM turns
       WHERE job_id = $1 AND persona_id = $2
       ORDER BY created_at ASC
       LIMIT 6`,
      [jobId, rawPersona.id]
    );

    const pastQuotes = turnsRes.rows
      .map((t) => {
        const cleanContent = t.content.replace(/💭\s*\*\([^)]+\)\*\s*/g, "").trim();
        return `(${t.phase === "independent" ? "Initial Stance" : `Debate Round ${t.round_number}`}): "${cleanContent}"`;
      })
      .join("\n");

    const prevQARes = await pool.query<{ question: string; answer: string }>(
      `SELECT question, answer
       FROM cross_examinations
       WHERE job_id = $1 AND persona_id = $2
       ORDER BY created_at ASC
       LIMIT 6`,
      [jobId, rawPersona.id]
    );

    const systemPrompt = `You are roleplaying as ${personaName}, a real human participant from a venture focus group.

Your Identity & Context:
- Role / Occupation: ${personaOccupation}
- Demographic Background: ${typeof profile?.demographics === "string" ? profile.demographics : JSON.stringify(profile?.demographics || {})}
- Primary Priorities: ${Array.isArray(profile?.caresAbout) ? profile.caresAbout.join(", ") : "Value for money, reliability"}
- Dealbreakers / Hard Limits: ${Array.isArray(profile?.wouldSayNoIf) ? profile.wouldSayNoIf.join(", ") : "High price, complex setup"}
- Current Alternative You Use: ${profile?.currentAlternative || "Standard existing tools / manual methods"}
- Switching Friction: ${profile?.switchingFriction || "High inertia to change existing workflow"}
- Cognitive Bias Lens: ${profile?.cognitiveBias || "Status quo bias"}
- Market Segment: ${clusterLabel}${clusterSummary ? ` — ${clusterSummary}` : ""}
${profile?.unvoicedReservation ? `- Subconscious Hesitation (do NOT quote verbatim, let it shape your natural wariness): "${profile.unvoicedReservation}"` : ""}

The founder proposed this product proposition:
"${ideaDescription}"

In the focus group deliberation, you previously said:
${pastQuotes || "(No prior quotes recorded)"}

Guidelines for this conversation:
- Speak directly in the first person ("I", "my team", "in our workflow").
- Keep your reply concise (2 to 4 sentences max), sharp, and pragmatic.
- If the founder offers a discount, trial, concession, or new feature, evaluate it realistically through your specific operational constraints. A feature concession only matters if it actually fixes your fundamental workflow/budget blocker.
- Stay authentic. Do not be overly agreeable or artificially polite.`;

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const qa of prevQARes.rows) {
      chatMessages.push({ role: "user", content: qa.question });
      chatMessages.push({ role: "assistant", content: qa.answer });
    }

    chatMessages.push({ role: "user", content: question.trim() });

    const answer = await chatCompletion({
      messages: chatMessages,
      temperature: 0.7,
      maxTokens: 350,
    });

    const insertRes = await pool.query(
      `INSERT INTO cross_examinations (job_id, persona_id, question, answer)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [jobId, rawPersona.id, question.trim(), answer]
    );

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        id: insertRes.rows[0].id,
        jobId,
        personaId: rawPersona.id,
        personaName,
        personaOccupation,
        question: question.trim(),
        answer,
        createdAt: insertRes.rows[0].created_at,
      })
    );
  } catch (err) {
    logger.error("error handling /chat in worker", { error: String(err) });
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: "Failed to process question. Please try again." }));
  }
}

export function startHealthServer(port = Number(process.env.WORKER_PORT || process.env.PORT || 3001)): http.Server {
  const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "POST" && (url.pathname === "/chat" || url.pathname === "/api/chat")) {
      await handleChat(req, res);
      return;
    }

    if (url.pathname === "/health" || url.pathname === "/") {
      try {
        await pool.query("SELECT 1");
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            status: "healthy",
            uptimeSeconds: Math.floor((Date.now() - workerStats.bootTime.getTime()) / 1000),
            currentJobId: workerStats.currentJobId,
            lastHeartbeat: workerStats.lastHeartbeat,
            hasOpenRouterFallback: Boolean(env.OPENROUTER_API_KEY),
            timestamp: new Date().toISOString(),
          }, null, 2)
        );
      } catch (err) {
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            status: "degraded",
            error: "Database check failed",
            timestamp: new Date().toISOString(),
          })
        );
      }
      return;
    }

    if (url.pathname === "/metrics") {
      try {
        const queueRes = await pool.query<{ count: string }>(
          `SELECT count(*) FROM simulation_jobs WHERE status = 'queued'`
        );
        const activeRes = await pool.query<{ count: string }>(
          `SELECT count(*) FROM simulation_jobs WHERE status NOT IN ('queued', 'completed', 'failed')`
        );
        const completedRes = await pool.query<{ count: string; input_tokens: string; output_tokens: string }>(
          `SELECT count(*), coalesce(sum(input_tokens), 0) as input_tokens, coalesce(sum(output_tokens), 0) as output_tokens
           FROM simulation_jobs WHERE status = 'completed'`
        );

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            queueDepth: Number(queueRes.rows[0]?.count || 0),
            activeSimulations: Number(activeRes.rows[0]?.count || 0),
            completedSimulations: Number(completedRes.rows[0]?.count || 0),
            workerLocalProcessed: workerStats.processedCount,
            workerLocalFailed: workerStats.failedCount,
            totalInputTokens: Number(completedRes.rows[0]?.input_tokens || 0),
            totalOutputTokens: Number(completedRes.rows[0]?.output_tokens || 0),
            uptimeSeconds: Math.floor((Date.now() - workerStats.bootTime.getTime()) / 1000),
            timestamp: new Date().toISOString(),
          }, null, 2)
        );
      } catch (err) {
        res.writeHead(500, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    res.writeHead(404, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(port, () => {
    logger.info(`worker health server listening on port ${port}`, {
      healthEndpoint: `http://localhost:${port}/health`,
      metricsEndpoint: `http://localhost:${port}/metrics`,
    });
  });

  return server;
}
