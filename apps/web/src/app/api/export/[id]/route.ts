import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";
import type { ReportSummary } from "@repo/shared";

interface ExportJobRow {
  id: string;
  user_id: string;
  idea_id: string;
  mode: string;
  panel_size: number;
  segment_count: number | null;
  status: string;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  completed_at: string | null;
  rounds: number | null;
  debate_level: string | null;
  share_token: string | null;
  market_context: any;
  parent_job_id: string | null;
  branch_label: string | null;
  idea_text: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "markdown").toLowerCase();
  const queryToken = searchParams.get("token");

  try {
    // 1. Query job by ID or share_token
    const jobRes = await pool.query<ExportJobRow>(
      `SELECT j.*, i.raw_text as idea_text
       FROM simulation_jobs j
       JOIN ideas i ON i.id = j.idea_id
       WHERE j.id::text = $1 OR j.share_token = $1
       LIMIT 1`,
      [rawId]
    );

    const job = jobRes.rows[0];
    if (!job) {
      return NextResponse.json({ error: "Simulation job not found" }, { status: 404 });
    }

    // 2. Authorization check
    let authorized = false;

    // Public share token matched in URL path or query
    if (job.share_token && (rawId === job.share_token || queryToken === job.share_token)) {
      authorized = true;
    }

    if (!authorized) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.id === job.user_id) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized access to export" }, { status: 401 });
    }

    // 3. Fetch related entities in parallel
    const [clustersRes, personasRes, turnsRes, crossExamsRes, reportRes] = await Promise.all([
      pool.query(
        `SELECT id, label, summary, size FROM clusters WHERE job_id = $1 ORDER BY size DESC`,
        [job.id]
      ),
      pool.query(
        `SELECT p.id, p.profile, p.status, p.cluster_id, c.label as cluster_label
         FROM personas p
         LEFT JOIN clusters c ON c.id = p.cluster_id
         WHERE p.job_id = $1
         ORDER BY p.created_at ASC`,
        [job.id]
      ),
      pool.query(
        `SELECT t.id, t.persona_id, t.phase, t.round_number, t.content, t.created_at,
                p.profile->>'name' as persona_name,
                coalesce(p.profile->'demographics'->>'occupation', p.profile->>'archetype') as persona_role
         FROM turns t
         LEFT JOIN personas p ON p.id = t.persona_id
         WHERE t.job_id = $1
         ORDER BY t.created_at ASC`,
        [job.id]
      ),
      pool.query(
        `SELECT ce.id, ce.persona_id, ce.question, ce.answer, ce.created_at,
                coalesce(p.profile->>'name', 'All Personas') as persona_name
         FROM cross_examinations ce
         LEFT JOIN personas p ON p.id = ce.persona_id
         WHERE ce.job_id = $1
         ORDER BY ce.created_at ASC`,
        [job.id]
      ),
      pool.query(
        `SELECT summary_json, generated_at FROM reports WHERE job_id = $1 LIMIT 1`,
        [job.id]
      ),
    ]);

    const clusters = clustersRes.rows;
    const personas = personasRes.rows;
    const turns = turnsRes.rows;
    const crossExams = crossExamsRes.rows;
    const report: ReportSummary | null = reportRes.rows[0]?.summary_json ?? null;

    // 4. Return JSON format if requested
    if (format === "json") {
      const payload = {
        job: {
          id: job.id,
          mode: job.mode,
          status: job.status,
          panelSize: job.panel_size,
          rounds: job.rounds,
          debateLevel: job.debate_level,
          inputTokens: job.input_tokens,
          outputTokens: job.output_tokens,
          parentJobId: job.parent_job_id,
          branchLabel: job.branch_label,
          createdAt: job.created_at,
          completedAt: job.completed_at,
        },
        idea: job.idea_text,
        marketContext: job.market_context,
        report,
        clusters,
        personas: personas.map((p) => ({
          id: p.id,
          status: p.status,
          cluster: p.cluster_label,
          profile: p.profile,
        })),
        turns: turns.map((t) => ({
          id: t.id,
          personaId: t.persona_id,
          personaName: t.persona_name,
          personaRole: t.persona_role,
          phase: t.phase,
          roundNumber: t.round_number,
          content: t.content,
          createdAt: t.created_at,
        })),
        crossExaminations: crossExams.map((ce) => ({
          id: ce.id,
          personaId: ce.persona_id,
          personaName: ce.persona_name,
          question: ce.question,
          answer: ce.answer,
          createdAt: ce.created_at,
        })),
        exportedAt: new Date().toISOString(),
      };

      return new NextResponse(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="validation-dossier-${job.id.slice(0, 8)}.json"`,
        },
      });
    }

    // 5. Generate Markdown Dossier
    const totalTokens = Number(job.input_tokens || 0) + Number(job.output_tokens || 0);
    const shortId = job.id.slice(0, 8);

    let md = `# 🍦 Market Validation Dossier: ${report?.headline || "Product Concept Simulation"}\n\n`;
    md += `**Executive Intelligence & Focus Group Findings**\n\n`;
    md += `- **Run ID:** \`${job.id}\`\n`;
    md += `- **Date:** ${new Date(job.created_at).toUTCString()}\n`;
    md += `- **Simulation Mode:** \`${job.mode}\`\n`;
    md += `- **Panel Size:** ${job.panel_size} autonomous personas\n`;
    md += `- **Debate Rigor:** \`${job.debate_level || "standard"}\` (${job.rounds || 12} dialogue turns)\n`;
    if (job.branch_label) {
      md += `- **Cohort Branch:** \`${job.branch_label}\` (Parent: \`${job.parent_job_id}\`)\n`;
    }
    md += `- **Total LLM Tokens:** ${totalTokens.toLocaleString()} tokens\n`;
    md += `- **Status:** \`${job.status}\`\n\n`;
    md += `---\n\n`;

    md += `## 💡 Product Hypothesis\n\n`;
    md += `> ${job.idea_text.split("\n").join("\n> ")}\n\n`;
    md += `---\n\n`;

    if (report) {
      md += `## 🎯 Executive Verdict\n\n`;
      md += `### ${report.headline}\n\n`;
      md += `**Simulated Interest Range (uncalibrated):** \`${report.overallAdoptionLow}% – ${report.overallAdoptionHigh}%\`\n\n`;

      if (report.pivotDelta) {
        md += `### 🔄 A/B Pivot Sentiment Comparison\n\n`;
        md += `**Simulated Interest Shift:** \`${report.pivotDelta.deltaLow >= 0 ? `+${report.pivotDelta.deltaLow}%` : `${report.pivotDelta.deltaLow}%`} to ${report.pivotDelta.deltaHigh >= 0 ? `+${report.pivotDelta.deltaHigh}%` : `${report.pivotDelta.deltaHigh}%`}\`\n\n`;
        md += `> ${report.pivotDelta.verdictComparison}\n\n`;

        if (report.pivotDelta.resolvedObjections?.length) {
          md += `**Resolved Objections:**\n`;
          for (const res of report.pivotDelta.resolvedObjections) {
            md += `- ✅ ${res}\n`;
          }
          md += `\n`;
        }

        if (report.pivotDelta.newObjections?.length) {
          md += `**New Friction Points:**\n`;
          for (const obj of report.pivotDelta.newObjections) {
            md += `- ⚠️ ${obj}\n`;
          }
          md += `\n`;
        }
      }

      md += `### 👥 Market Segmentation (${report.segments.length} Cohorts)\n\n`;
      for (const seg of report.segments) {
        md += `#### ${seg.label} (\`${seg.stance.toUpperCase()}\` · ${seg.sizePct}% of simulated panel)\n`;
        md += `- **Simulated Interest Range:** ${seg.adoptionLikelihoodLow}% – ${seg.adoptionLikelihoodHigh}%\n`;
        md += `- **Key Objections & Dealbreakers:**\n`;
        for (const obj of seg.keyObjections) {
          md += `  - ${obj}\n`;
        }
        md += `\n`;
      }

      if (report.priceSensitivity) {
        const psm = report.priceSensitivity;
        md += `### 💰 Van Westendorp Price Sensitivity Modeling (PSM)\n\n`;
        md += `- **Optimal Price Point (OPP):** \`${psm.currency} ${psm.optimalPricePoint.toLocaleString()}\`\n`;
        md += `- **Indifference Price Point (IPP):** \`${psm.currency} ${psm.indifferencePricePoint.toLocaleString()}\`\n`;
        md += `- **Acceptable Pricing Band:** \`${psm.currency} ${psm.acceptableRangeLow.toLocaleString()} – ${psm.currency} ${psm.acceptableRangeHigh.toLocaleString()}\`\n`;
        md += `- **Pricing Guidance:** ${psm.priceRecommendation}\n\n`;
      }

      if (report.consensusMetrics) {
        const cm = report.consensusMetrics;
        md += `### 🤝 Delphi Consensus & Alignment Metrics\n\n`;
        md += `- **Convergence Score:** \`${cm.convergenceScore}%\` (Final Group Stance: \`${cm.finalGroupStance.replace(/_/g, " ").toUpperCase()}\`)\n`;
        if (cm.universalAgreements?.length) {
          md += `- **Universal Agreements:**\n`;
          for (const a of cm.universalAgreements) md += `  - ✓ ${a}\n`;
        }
        if (cm.keyCompromisesRequired?.length) {
          md += `- **Key Compromises Needed:**\n`;
          for (const c of cm.keyCompromisesRequired) md += `  - ⚡ ${c}\n`;
        }
        if (cm.unresolvedContestations?.length) {
          md += `- **Unresolved Disagreements:**\n`;
          for (const d of cm.unresolvedContestations) md += `  - ⚠ ${d}\n`;
        }
        md += `\n`;
      }

      if (report.actionPlan) {
        const ap = report.actionPlan;
        md += `### 📋 Decision-Support Action Plan\n\n`;
        md += `- **Riskiest Assumption:** ${ap.riskiestAssumption}\n`;
        md += `- **Cheapest Validation Experiment:** ${ap.cheapestValidationExperiment}\n`;
        md += `- **Target Interview Profile:** ${ap.targetInterviewProfile}\n`;
        if (ap.suggestedQuestions?.length) {
          md += `- **Suggested Customer Questions:**\n`;
          for (const q of ap.suggestedQuestions) md += `  - ❓ ${q}\n`;
        }
        md += `- **Validation Threshold:** ${ap.successThreshold}\n`;
        md += `- **Invalidation / Pivot Trigger:** ${ap.invalidationCriteria}\n\n`;
      }

      if (report.evidenceClaims?.length) {
        md += `### 🔍 Evidence-Backed Claim Provenance\n\n`;
        for (const ec of report.evidenceClaims) {
          md += `#### "${ec.claim}"\n`;
          md += `> "${ec.verbatimExcerpt}"\n\n`;
          if (ec.supportingPersonaNames?.length) {
            md += `- **Supporting Personas:** ${ec.supportingPersonaNames.join(", ")}\n`;
          }
          if (ec.opposingPersonaNames?.length) {
            md += `- **Opposing Personas:** ${ec.opposingPersonaNames.join(", ")}\n`;
          }
          md += `\n`;
        }
      }

      if (report.cognitiveBiasesEncountered?.length) {
        md += `### 🧠 Cognitive Biases & Resistance Profiles\n\n`;
        for (const bias of report.cognitiveBiasesEncountered) {
          md += `- 🔒 **${bias.replace(/_/g, " ").toUpperCase()}**: Active switching friction detected in simulated panel\n`;
        }
        md += `\n`;
      }

      if (report.crossCuttingObjections?.length) {
        md += `### 🛑 Universal Dealbreakers Across All Cohorts\n\n`;
        for (const obj of report.crossCuttingObjections) {
          md += `1. **${obj}**\n`;
        }
        md += `\n`;
      }
      md += `---\n\n`;
    }

    // Market context reconnaissance if present
    if (job.market_context?.reconnaissance) {
      const recon = job.market_context.reconnaissance;
      md += `## 🌐 Market Reconnaissance & Competitive Intelligence\n\n`;
      if (recon.competitors?.length) {
        md += `**Known Competitors & Alternatives:** ${recon.competitors.join(", ")}\n\n`;
      }
      if (recon.frictionPoints?.length) {
        md += `**Industry Friction Points:**\n`;
        for (const fp of recon.frictionPoints) {
          md += `- ${fp}\n`;
        }
        md += `\n`;
      }
      if (recon.marketSentiment) {
        md += `**Market Backdrop:** ${recon.marketSentiment}\n\n`;
      }
      md += `---\n\n`;
    }

    // Personas Roster
    md += `## 🎭 Focus Group Persona Roster\n\n`;
    md += `| Name | Archetype | Occupation | Price Sensitivity | Tech Savviness | Segment |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const p of personas) {
      const prof = p.profile || {};
      const demo = prof.demographics || {};
      md += `| **${prof.name || "Persona"}** | ${prof.archetype || "N/A"} | ${demo.occupation || "N/A"} | ${prof.priceSensitivity || demo.incomeLevel || "N/A"} | ${prof.techSavviness || "N/A"} | ${p.cluster_label || "General"} |\n`;
    }
    md += `\n---\n\n`;

    // Cross-Examinations if present
    if (crossExams.length > 0) {
      md += `## 💬 Interactive Cross-Examinations\n\n`;
      for (const ce of crossExams) {
        md += `### Q: "${ce.question}"\n`;
        md += `*Target: ${ce.persona_name}*\n\n`;
        md += `> ${ce.answer.split("\n").join("\n> ")}\n\n`;
      }
      md += `---\n\n`;
    }

    // Deliberation Dialogue Transcript
    md += `## 🗣️ Deliberation Dialogue Transcript (${turns.length} turns)\n\n`;
    for (const turn of turns) {
      const header =
        turn.phase === "independent"
          ? `### 🎙️ ${turn.persona_name || "Persona"} [Initial Reaction]`
          : `### 💬 ${turn.persona_name || "Persona"} [Debate Round ${turn.round_number}]`;
      md += `${header}\n\n`;
      md += `${turn.content}\n\n`;
    }

    md += `---\n\n`;
    md += `*Generated automatically by Skeptiq Autonomous Market Validation Platform*\n`;

    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="validation-dossier-${shortId}.md"`,
      },
    });
  } catch (err) {
    console.error("Export generation error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
