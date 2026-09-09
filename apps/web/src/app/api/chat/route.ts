import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";

interface ChatRequestBody {
  jobId: string;
  personaId?: string;
  question: string;
  stream?: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.job_id, c.persona_id, c.question, c.answer, c.created_at,
              p.profile->>'name' as persona_name,
              coalesce(p.profile->'demographics'->>'occupation', p.profile->>'archetype', 'Consumer') as persona_occupation
       FROM cross_examinations c
       LEFT JOIN personas p ON p.id = c.persona_id
       WHERE c.job_id = $1
         AND EXISTS (
           SELECT 1 FROM simulation_jobs j
           WHERE j.id = c.job_id AND (j.user_id = $2 OR j.share_token IS NOT NULL)
         )
       ORDER BY c.created_at ASC`,
      [jobId, user.id]
    );

    return NextResponse.json({ messages: rows });
  } catch (err) {
    console.error("GET /api/chat error:", err);
    return NextResponse.json({ error: "Failed to load chat history" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { jobId, personaId, question } = body;
  if (!jobId || !question?.trim()) {
    return NextResponse.json({ error: "jobId and question are required" }, { status: 400 });
  }

  try {
    // 1. Verify job ownership
    const jobRes = await pool.query(
      `SELECT j.id, i.raw_text as description
       FROM simulation_jobs j
       JOIN ideas i ON i.id = j.idea_id
       WHERE j.id = $1 AND (j.user_id = $2 OR j.share_token IS NOT NULL)`,
      [jobId, user.id]
    );

    if (jobRes.rows.length === 0) {
      return NextResponse.json({ error: "Job not found or access denied" }, { status: 404 });
    }
    const ideaDescription = jobRes.rows[0].description;

    // Rate limiting: max 30 questions per hour per user
    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT count(*) as count
       FROM cross_examinations c
       JOIN simulation_jobs j ON j.id = c.job_id
       WHERE j.user_id = $1 AND c.created_at > now() - interval '1 hour'`,
      [user.id]
    );

    if (parseInt(countRows[0]?.count || "0", 10) >= 30) {
      return NextResponse.json(
        { error: "Rate limit reached: Maximum 30 questions per hour. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    // 2. Fetch target persona + cluster label (or intelligently find the lead skeptic)
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
      // Find persona from the panel
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
      return NextResponse.json({ error: "Persona not found for this job" }, { status: 404 });
    }

    const profile = typeof rawPersona.profile === "string" ? JSON.parse(rawPersona.profile) : rawPersona.profile;
    const personaName = profile?.name || "Focus Group Member";
    const personaOccupation = profile?.demographics?.occupation || profile?.archetype || "Consumer";
    const clusterLabel = rawPersona.cluster_label || "General Panel";
    const clusterSummary = rawPersona.cluster_summary || "";

    // 3. Fetch past turns from this persona in the simulation (clean of monologue syntax)
    const turnsRes = await pool.query(
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

    // 4. Fetch previous Q&A turns from this specific cross-examination session
    const prevQARes = await pool.query(
      `SELECT question, answer
       FROM cross_examinations
       WHERE job_id = $1 AND persona_id = $2
       ORDER BY created_at ASC
       LIMIT 6`,
      [jobId, rawPersona.id]
    );

    // 5. If backend worker is configured, delegate chat directly to worker (zero AI keys on frontend)
    const workerBaseUrl =
      process.env.WORKER_URL ||
      process.env.WORKER_HEALTH_URL ||
      process.env.NEXT_PUBLIC_WORKER_URL;

    if (workerBaseUrl) {
      const cleanWorkerUrl = workerBaseUrl.replace(/\/health\/?$/, "").replace(/\/+$/, "");
      try {
        const workerRes = await fetch(`${cleanWorkerUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            personaId: rawPersona.id,
            question: question.trim(),
            userId: user.id,
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (workerRes.ok) {
          const workerData = await workerRes.json();
          return NextResponse.json(workerData);
        }
      } catch (workerErr) {
        console.warn("Worker chat delegate attempt failed, falling back to local...", workerErr);
      }
    }

    // 6. Local LLM fallback (if keys are present on web runtime)
    const groqApiKey = process.env.GROQ_API_KEY;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!groqApiKey && !openRouterApiKey && !workerBaseUrl) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

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

    // Append prior conversational turns
    for (const qa of prevQARes.rows) {
      chatMessages.push({ role: "user", content: qa.question });
      chatMessages.push({ role: "assistant", content: qa.answer });
    }

    // Append current question
    chatMessages.push({ role: "user", content: question.trim() });

    let answer: string | null = null;

    // 5.1 Try Groq first
    if (groqApiKey) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen/qwen3.8-27b",
            messages: chatMessages,
            temperature: 0.7,
            max_tokens: 350,
          }),
        });

        if (groqRes.ok) {
          const groqData = (await groqRes.json()) as any;
          answer = groqData.choices?.[0]?.message?.content?.trim() || null;
        }
      } catch (err) {
        console.warn("Groq chat attempt failed, trying fallback...", err);
      }
    }

    // 5.2 Fallback to OpenRouter free models
    if (!answer && openRouterApiKey) {
      const openRouterModels = [
        "liquid/lfm-2.5-2.6b:free",
        "cohere/north-mini-code:free",
        "nvidia/nemotron-3.5-lightning:free",
        "google/gemma-4-31b-it:free",
        "openrouter/free",
      ];
      for (const model of openRouterModels) {
        try {
          const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openRouterApiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "Skeptiq Focus Group",
            },
            body: JSON.stringify({
              model,
              messages: chatMessages,
              temperature: 0.7,
              max_tokens: 350,
            }),
          });
          if (orRes.ok) {
            const orData = (await orRes.json()) as any;
            answer = orData.choices?.[0]?.message?.content?.trim() || null;
            if (answer) break;
          }
        } catch {}
      }
    }

    if (!answer) {
      answer = "I have considered your point, but given my operational requirements and current alternatives, this doesn't fully resolve my core concern.";
    }

    // 6. Store exchange in database
    const insertRes = await pool.query(
      `INSERT INTO cross_examinations (job_id, persona_id, question, answer)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [jobId, rawPersona.id, question.trim(), answer]
    );

    return NextResponse.json({
      id: insertRes.rows[0].id,
      jobId,
      personaId: rawPersona.id,
      personaName,
      personaOccupation,
      question: question.trim(),
      answer,
      createdAt: insertRes.rows[0].created_at,
    });

  } catch (err) {
    console.error("POST /api/chat error:", err);
    return NextResponse.json({ error: "Failed to process question. Please try again." }, { status: 500 });
  }
}
