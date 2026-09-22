import { notFound } from "next/navigation";
import Link from "next/link";
import { pool } from "@/lib/db";
import { brandConfig } from "@/lib/brand";
import type { ReportSummary } from "@repo/shared";

interface PublicJobData {
  id: string;
  status: string;
  mode: string;
  panel_size: number;
  rounds: number | null;
  debate_level: string | null;
  share_token: string;
  created_at: string;
  error: string | null;
  idea_description: string;
  report_summary: ReportSummary | null;
}

export const dynamic = "force-dynamic";

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) notFound();

  const jobRes = await pool.query<PublicJobData>(
    `SELECT j.id, j.status, j.mode, j.panel_size, j.rounds, j.debate_level, j.share_token, j.created_at, j.error,
            i.raw_text as idea_description,
            r.summary_json as report_summary
     FROM simulation_jobs j
     JOIN ideas i ON i.id = j.idea_id
     LEFT JOIN reports r ON r.job_id = j.id
     WHERE j.share_token = $1`,
    [token]
  );

  const job = jobRes.rows[0];
  if (!job) notFound();

  const personasRes = await pool.query<{ id: string; profile: any }>(
    `SELECT id, profile FROM personas WHERE job_id = $1`,
    [job.id]
  );
  const personasMap = new Map<string, { name: string; occupation: string; relevance?: string; bias?: string }>();
  for (const p of personasRes.rows) {
    const prof = typeof p.profile === "string" ? JSON.parse(p.profile) : p.profile;
    personasMap.set(p.id, {
      name: prof?.name || "Persona",
      occupation: prof?.demographics?.occupation || prof?.archetype || "Consumer",
      relevance: prof?.targetRelevance,
      bias: prof?.cognitiveBias,
    });
  }

  const turnsRes = await pool.query(
    `SELECT id, persona_id, phase, round_number, content, created_at
     FROM turns
     WHERE job_id = $1
     ORDER BY created_at ASC`,
    [job.id]
  );

  const crossExamsRes = await pool.query(
    `SELECT c.question, c.answer, p.profile->>'name' as persona_name, p.profile->'demographics'->>'occupation' as occupation
     FROM cross_examinations c
     LEFT JOIN personas p ON p.id = c.persona_id
     WHERE c.job_id = $1
     ORDER BY c.created_at ASC`,
    [job.id]
  );

  const report = job.report_summary;
  const completed = job.status === "completed";
  const cancelled = job.status === "failed" && job.error?.toLowerCase().includes("cancelled") === true;

  return (
    <div className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6">
      <main className="mx-auto max-w-4xl space-y-6">
        {/* Navigation & Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/80 pb-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wide text-muted-ink">
              {brandConfig.mark} {brandConfig.name} · Public report
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {completed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                  ✓ Completed simulation report
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${cancelled ? "border-amber-200/60 bg-amber-50 text-amber-800" : job.status === "failed" ? "border-red-200/60 bg-red-50 text-red-700" : "border-blue-200/60 bg-blue-50 text-blue-700"}`}>
                  {cancelled ? "Simulation cancelled" : job.status === "failed" ? "Simulation failed" : "Simulation in progress"}
                </span>
              )}
              <span className="text-xs text-zinc-400">
                {new Date(job.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">
              Market Validation Report
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {completed && (
              <>
                <a
                  href={`/api/export/${job.share_token}?format=markdown`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:border-zinc-300 transition-all"
                  title="Download Markdown Dossier"
                >
                  <span>📥 Dossier (.md)</span>
                </a>
                <a
                  href={`/api/export/${job.share_token}?format=json`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:border-zinc-300 transition-all"
                  title="Export Raw Data JSON"
                >
                  <span>JSON</span>
                </a>
              </>
            )}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 transition-all"
            >
              <span>Run your own simulation</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="border border-butter bg-butter/40 px-4 py-3 text-xs leading-5 text-ink">
          <strong>Synthetic research caveat:</strong> This report is generated from simulated personas, not a recruited or representative human sample. Treat it as directional input for further validation, not as proof of market demand.
        </div>

        {/* Pitch Summary Box */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Proposed Venture Proposition</p>
          <p className="text-base sm:text-lg text-zinc-800 font-medium leading-relaxed">
            &ldquo;{job.idea_description}&rdquo;
          </p>
          <div className="flex flex-wrap gap-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            <span>Panel Size: <strong className="text-zinc-800">{job.panel_size} personas</strong></span>
            <span>Debate Rigor: <strong className="text-zinc-800 capitalize">{job.debate_level || "Standard"}</strong></span>
            <span>Mode: <strong className="text-zinc-800 capitalize">{job.mode}</strong></span>
          </div>
        </div>

        {/* Executive Verdict & Summary */}
        {completed && report ? (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-6">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                  ✓ Executive Verdict
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-zinc-900 leading-snug">{report.headline}</h2>
              </div>
              <div className="rounded-2xl bg-zinc-900 px-6 py-3.5 text-white text-center sm:text-right min-w-[190px] shadow-sm shrink-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Simulated Interest Range</span>
                <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-0.5">
                  {report.overallAdoptionLow}% – {report.overallAdoptionHigh}%
                </p>
                <div className="mt-1.5 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(10, report.overallAdoptionHigh))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Van Westendorp Price Sensitivity Meter (PSM) */}
            {report.priceSensitivity && (
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-emerald-200/50 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Simulated PSM
                    </span>
                    <h3 className="text-sm font-bold text-emerald-950">
                      Van Westendorp Price Sensitivity Meter
                    </h3>
                  </div>
                  <span className="text-xs text-emerald-800 font-medium">
                    Directional estimate · {report.priceSensitivity.sampleSize} personas sampled
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Optimal (OPP)</span>
                    <p className="mt-1 text-lg font-black text-emerald-700">
                      {report.priceSensitivity.currency} {report.priceSensitivity.optimalPricePoint.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-zinc-400">Lowest resistance</span>
                  </div>
                  <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Indifference (IPP)</span>
                    <p className="mt-1 text-lg font-black text-zinc-800">
                      {report.priceSensitivity.currency} {report.priceSensitivity.indifferencePricePoint.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-zinc-400">Median perception</span>
                  </div>
                  <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Marginal Cheap</span>
                    <p className="mt-1 text-lg font-black text-zinc-700">
                      {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalCheapness.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-zinc-400">Suspicion floor</span>
                  </div>
                  <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Marginal Expensive</span>
                    <p className="mt-1 text-lg font-black text-amber-700">
                      {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalExpensiveness.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-zinc-400">Drop-off ceiling</span>
                  </div>
                </div>

                {/* Visual Pricing Band Meter */}
                <div className="rounded-xl bg-white p-4 border border-emerald-100/80 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600">
                    <span>Floor: {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalCheapness}</span>
                    <span className="text-emerald-800 font-bold">Acceptable Pricing Corridor</span>
                    <span>Ceiling: {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalExpensiveness}</span>
                  </div>
                  <div className="relative h-4 rounded-full bg-linear-to-r from-zinc-200 via-emerald-400 to-amber-300 border border-emerald-200">
                    <div className="absolute inset-0 flex items-center justify-around px-4 text-[9px] font-bold text-zinc-800">
                      <span>OPP: {report.priceSensitivity.currency}{report.priceSensitivity.optimalPricePoint}</span>
                      <span>IPP: {report.priceSensitivity.currency}{report.priceSensitivity.indifferencePricePoint}</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-emerald-950 font-medium leading-relaxed bg-white p-3.5 rounded-xl border border-emerald-100">
                  💡 {report.priceSensitivity.priceRecommendation}
                </p>
              </div>
            )}

            {/* Cognitive Biases & Resistance Profile Card */}
            {report.cognitiveBiasesEncountered && report.cognitiveBiasesEncountered.length > 0 && (
              <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-5 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Psychological Resistance & Cognitive Biases Encountered
                </h3>
                <div className="flex flex-wrap gap-2">
                  {report.cognitiveBiasesEncountered.map((bias, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-2xs"
                    >
                      🔒 {bias.replace(/_/g, " ").toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Segments */}
            {report.segments && report.segments.length > 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">Market Segment Breakdown</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {report.segments.map((seg, idx) => (
                    <div key={idx} className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 text-xs space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-900 text-sm">{seg.label}</span>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold tracking-wider ${
                          seg.stance === "adopt"
                            ? "bg-emerald-100 text-emerald-800"
                            : seg.stance === "conditional"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {seg.stance}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-zinc-500 font-medium">
                        <div className="flex items-center justify-between">
                          <span>Share: <strong>{seg.sizePct}%</strong></span>
                          <span>Simulated interest: <strong className="text-zinc-800">{seg.adoptionLikelihoodLow}% – {seg.adoptionLikelihoodHigh}%</strong></span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              seg.stance === "adopt"
                                ? "bg-emerald-500"
                                : seg.stance === "conditional"
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${seg.sizePct}%` }}
                          />
                        </div>
                      </div>
                      {seg.keyObjections && seg.keyObjections.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold uppercase text-zinc-500">Key Objections:</p>
                          <ul className="mt-1 list-disc pl-4 text-xs text-zinc-600 space-y-0.5">
                            {seg.keyObjections.map((obj, i) => (
                              <li key={i}>{obj}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pivot A/B Sentiment Delta */}
            {report.pivotDelta && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-purple-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Pivot A/B Delta
                    </span>
                    <h3 className="text-xs font-bold text-purple-950">Cohort Sentiment Comparison</h3>
                  </div>
                  <span className="text-xs font-extrabold text-purple-900">
                    {report.pivotDelta.deltaLow >= 0 ? `+${report.pivotDelta.deltaLow}%` : `${report.pivotDelta.deltaLow}%`} to{" "}
                    {report.pivotDelta.deltaHigh >= 0 ? `+${report.pivotDelta.deltaHigh}%` : `${report.pivotDelta.deltaHigh}%`} Range Shift
                  </span>
                </div>
                <p className="text-xs text-purple-900 font-medium leading-relaxed">
                  {report.pivotDelta.verdictComparison}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  {report.pivotDelta.resolvedObjections?.length > 0 && (
                    <div className="rounded-xl bg-white p-3 border border-purple-100">
                      <p className="font-bold text-emerald-800 text-[11px] uppercase">✓ Resolved Dealbreakers</p>
                      <ul className="list-disc pl-4 text-zinc-700 mt-1 space-y-0.5">
                        {report.pivotDelta.resolvedObjections.map((res, i) => (
                          <li key={i}>{res}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.pivotDelta.newObjections?.length > 0 && (
                    <div className="rounded-xl bg-white p-3 border border-purple-100">
                      <p className="font-bold text-amber-800 text-[11px] uppercase">⚠ New Pivot Friction Points</p>
                      <ul className="list-disc pl-4 text-zinc-700 mt-1 space-y-0.5">
                        {report.pivotDelta.newObjections.map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Objections & Caveats */}
            {report.crossCuttingObjections && report.crossCuttingObjections.length > 0 && (
              <div className="border-t border-zinc-100 pt-5 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-700">Cross-Cutting Dealbreakers</p>
                <ul className="list-disc pl-5 text-xs text-zinc-600 space-y-1">
                  {report.crossCuttingObjections.map((obj, idx) => (
                    <li key={idx}>{obj}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : !completed ? (
          <div className={`rounded-2xl border p-6 text-sm ${cancelled ? "border-amber-200 bg-amber-50 text-amber-800" : job.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-dashed border-zinc-200 bg-white text-zinc-600"}`}>
            {cancelled
              ? `This simulation was cancelled${job.error ? `: ${job.error}` : "."}`
              : job.status === "failed"
              ? `This simulation failed${job.error ? `: ${job.error}` : "."}`
              : "This public report is not available yet because the simulation has not completed."}
          </div>
        ) : null}

        {/* Cross-Examinations */}
        {completed && crossExamsRes.rows.length > 0 && (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">Founder Cross-Examinations</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Q&A</span>
            </div>
            <div className="space-y-3.5">
              {crossExamsRes.rows.map((q, idx) => (
                <div key={idx} className="rounded-xl bg-zinc-50/60 p-4 border border-zinc-200/80 text-xs space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                    <span>Founder Query</span>
                  </div>
                  <p className="font-medium text-zinc-900 bg-white p-3 rounded-lg border border-zinc-200/70 shadow-2xs">
                    &ldquo;{q.question}&rdquo;
                  </p>
                  <div className="border-t border-zinc-200/60 pt-2 text-[11px] font-bold text-blue-950">
                    💬 {q.persona_name} ({q.occupation || "Consumer"}) responded:
                  </div>
                  <p className="text-zinc-800 pl-1 leading-relaxed whitespace-pre-line">{q.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Focus Group Transcript */}
        {completed && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm space-y-4">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
              Complete Focus Group Dialogue ({turnsRes.rows.length} turns)
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Verbatim dialogue recorded during independent evaluations and structured multi-agent cross-talk rounds.
            </p>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {turnsRes.rows.map((turn) => {
              const persona = personasMap.get(turn.persona_id);
              const isInitial = turn.phase === "independent";

              const internalMatch = turn.content.match(/💭\s*\*\([^)]+\)\*/);
              const monologueText = internalMatch ? internalMatch[0].replace(/💭\s*\*\(/, "").replace(/\)\*$/, "") : null;
              const spokenContent = turn.content.replace(/💭\s*\*\([^)]+\)\*\s*/g, "").trim();

              const initials = (persona?.name || "P")
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();

              return (
                <div
                  key={turn.id}
                  className={`rounded-2xl border p-4 sm:p-5 text-xs sm:text-sm transition-colors ${
                    isInitial ? "border-zinc-200/80 bg-zinc-50/40" : "border-blue-100 bg-blue-50/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-white">
                        {initials}
                      </span>
                      <span className="font-bold text-zinc-900">
                        {persona?.name || "Persona"}
                      </span>
                      {persona?.occupation && (
                        <span className="text-zinc-500 text-[11px]">({persona.occupation})</span>
                      )}
                      {persona?.relevance && (
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 font-medium">
                          {persona.relevance.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {isInitial ? "Initial Reaction" : `Round ${turn.round_number}`}
                    </span>
                  </div>

                  {monologueText && (
                    <div className="mb-2.5 text-xs italic text-zinc-600 bg-white p-3 rounded-xl border border-zinc-200/70 shadow-2xs">
                      💭 <span className="font-bold text-zinc-800 not-italic">Private Internal Monologue:</span> &ldquo;{monologueText}&rdquo;
                    </div>
                  )}

                  <p className="text-zinc-800 leading-relaxed font-normal whitespace-pre-line pl-1">
                    {spokenContent}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Footer CTA */}
        <div className="rounded-2xl bg-zinc-900 p-8 text-center text-white space-y-3 shadow-sm">
          <h3 className="text-lg font-black tracking-tight">Validate Your Own Startup Idea</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Simulate an autonomous consumer focus group in under 60 seconds. Stress-test unit economics, Van Westendorp pricing, and objections before building.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex rounded-xl bg-white px-6 py-2.5 text-xs font-bold text-zinc-900 hover:bg-zinc-100 transition-colors shadow-sm"
            >
              Start Free Simulation &rarr;
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
