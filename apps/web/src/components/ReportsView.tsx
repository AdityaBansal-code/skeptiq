"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReportItem } from "@/lib/db";

interface ReportsViewProps {
  reports: ReportItem[];
  onOpenNewSimulation: () => void;
}

export function ReportsView({ reports, onOpenNewSimulation }: ReportsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = reports.filter((r) => {
    return (
      r.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.ideaText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.verdict.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink sm:text-3xl">
            Reports
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Completed simulations, ready to inspect with evidence and transcripts.
          </p>
        </div>
        <button
          onClick={onOpenNewSimulation}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-stone-800 transition-all"
        >
          <span className="text-sm font-bold">+</span>
          <span>New simulation</span>
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="rounded-2xl border border-[#eee9e2] bg-white p-3 shadow-2xs">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">🔍</span>
          <label htmlFor="report-search" className="sr-only">Search reports</label>
          <input
            id="report-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports by venture, findings, or headline..."
            className="w-full rounded-xl border border-stone-200 bg-stone-50/50 py-1.5 pl-8 pr-3 text-xs text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-hidden focus:border-stone-400"
          />
        </div>
      </div>

      {/* Reports Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-white/70 p-12 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
            📑
          </div>
          <h3 className="text-sm font-bold text-stone-800">No reports generated yet</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Completed simulations will appear here. Start a simulation to create the first report.
          </p>
          <Link href="/app/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/85">New simulation</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((report) => {
            const formattedDate = new Date(report.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            const psm = report.priceSensitivity;
            const opp = psm?.optimalPricePoint;
            const ipp = psm?.indifferencePricePoint;
            const currency = psm?.currency || "USD";

            return (
              <div
                key={report.id}
                className="group rounded-3xl border border-[#eee9e2] bg-white p-6 shadow-xs space-y-4 hover:border-stone-300 transition-all"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200/60">
                        {report.overallAdoptionLow}% – {report.overallAdoptionHigh}% Simulated Interest
                      </span>
                      <span className="text-xs text-stone-400 font-medium">{formattedDate}</span>
                    </div>
                    <h3 className="text-lg font-bold text-stone-900 mt-1">{report.headline}</h3>
                    <p className="text-xs text-stone-500 mt-0.5 max-w-2xl">{report.ideaText}</p>
                  </div>

                  {/* Export Shortcuts */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/api/export/${report.jobId}?format=markdown`}
                      target="_blank"
                      className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                      title="Download Markdown Dossier"
                    >
                      📥 .md Dossier
                    </Link>
                    <Link
                      href={`/api/export/${report.jobId}?format=json`}
                      target="_blank"
                      className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                      title="Download JSON Data"
                    >
                      JSON
                    </Link>
                    <Link
                      href={`/app/reports/${report.jobId}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-all"
                    >
                      <span>Open report</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>

                {/* Body Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Empirical Pricing PSM summary */}
                  <div className="rounded-2xl bg-stone-50 p-4 space-y-1.5 border border-stone-100">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Empirical Pricing Band (PSM)
                    </span>
                    {opp != null ? (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between">
                          <span className="text-stone-600">Optimal Point (OPP):</span>
                          <span className="font-bold text-stone-900">
                            {currency} {opp}
                          </span>
                        </div>
                        {ipp != null && (
                          <div className="flex justify-between">
                            <span className="text-stone-600">Indifference Point (IPP):</span>
                            <span className="font-bold text-stone-900">
                              {currency} {ipp}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-stone-400 italic pt-1">Free or non-commercial product tier</p>
                    )}
                  </div>

                  {/* Action Plan Riskiest Assumption */}
                  <div className="rounded-2xl bg-stone-50 p-4 space-y-1.5 border border-stone-100">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Riskiest Assumption
                    </span>
                    <p className="text-stone-700 font-medium line-clamp-3 pt-1">
                      {report.actionPlan?.riskiestAssumption || "Buyer credibility and willingness to switch from incumbent tools."}
                    </p>
                  </div>

                  {/* Verdict & Next Step */}
                  <div className="rounded-2xl bg-stone-50 p-4 space-y-1.5 border border-stone-100">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Recommended Validation Step
                    </span>
                    <p className="text-stone-700 font-medium line-clamp-3 pt-1">
                      {report.actionPlan?.cheapestValidationExperiment || "Conduct structured customer discovery interviews with key target personas."}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
