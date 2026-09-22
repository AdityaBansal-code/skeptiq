"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SimulationJobSummary } from "@/lib/db";

interface SimulationsViewProps {
  simulations: SimulationJobSummary[];
  onOpenNewSimulation: () => void;
}

export function SimulationsView({
  simulations,
  onOpenNewSimulation,
}: SimulationsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "active" | "failed" | "branched">("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const modes = useMemo(() => Array.from(new Set(simulations.map((simulation) => simulation.mode))).sort(), [simulations]);
  const audiences = useMemo(
    () => Array.from(new Set(simulations.map((simulation) => simulation.audiencePreset))).sort(),
    [simulations]
  );

  const filtered = simulations.filter((sim) => {
    const matchesSearch =
      sim.ideaText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sim.headline && sim.headline.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "completed" && sim.status !== "completed") return false;
    if (statusFilter === "active" && (sim.status === "completed" || sim.status === "failed")) return false;
    if (statusFilter === "failed" && sim.status !== "failed") return false;
    if (statusFilter === "branched" && !sim.parentJobId) return false;
    if (modeFilter !== "all" && sim.mode !== modeFilter) return false;
    if (audienceFilter !== "all" && sim.audiencePreset !== audienceFilter) return false;

    if (dateFilter !== "all") {
      const ageInDays = (Date.now() - new Date(sim.createdAt).getTime()) / 86_400_000;
      if (dateFilter === "30" && ageInDays > 30) return false;
      if (dateFilter === "90" && ageInDays > 90) return false;
      if (dateFilter === "older" && ageInDays <= 90) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink sm:text-3xl">
            Archive
          </h1>
          <p className="mt-1 text-sm text-muted-ink">
            Review every run, its current state, and the branches it produced.
          </p>
        </div>
        <button
          onClick={onOpenNewSimulation}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-ink/85"
        >
          <span className="text-sm font-bold">+</span>
          <span>New simulation</span>
        </button>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink text-xs">⌕</span>
          <label htmlFor="simulation-search" className="sr-only">Search simulations</label>
          <input
            id="simulation-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by idea pitch or headline..."
            className="min-h-10 w-full rounded-xl border border-line bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-muted-ink focus:border-ink/40 focus:outline-none"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: "all", label: `All (${simulations.length})` },
            { id: "completed", label: "Completed" },
            { id: "active", label: "In progress" },
            { id: "failed", label: "Failed" },
            { id: "branched", label: "Branches" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`min-h-10 rounded-xl px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? "bg-ink text-paper"
                  : "bg-paper text-muted-ink hover:bg-line"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select aria-label="Filter simulations by mode" value={modeFilter} onChange={(event) => setModeFilter(event.target.value)} className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm text-ink">
          <option value="all">All modes</option>
          {modes.map((mode) => <option key={mode} value={mode}>{mode.replaceAll("_", " ")}</option>)}
        </select>
        <select aria-label="Filter simulations by audience" value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)} className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm text-ink">
          <option value="all">All audiences</option>
          {audiences.map((audience) => <option key={audience} value={audience}>{audience.replaceAll("_", " ")}</option>)}
        </select>
        <select aria-label="Filter simulations by date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="min-h-10 rounded-xl border border-line bg-paper px-3 text-sm text-ink">
          <option value="all">Any date</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="older">Older than 90 days</option>
        </select>
      </div>

      {/* Simulations List Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <h3 className="text-base font-semibold text-ink">{simulations.length === 0 ? "No simulations yet" : "No simulations matched"}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-ink">
            {simulations.length === 0 ? "Start with a proposition and choose the audience you want to hear from." : "Try removing a filter or using a broader search term."}
          </p>
          {simulations.length === 0 ? <Link href="/app/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/85">New simulation</Link> : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sim) => {
            const isDone = sim.status === "completed";
            const formattedDate = new Date(sim.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={sim.id}
                className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink/30"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Details */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                          isDone
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : sim.status === "failed"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {sim.status.replace("_", " ")}
                      </span>

                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">
                        {sim.mode === "consensus" ? "Delphi Consensus" : "Market Segmentation"}
                      </span>

                      {sim.parentJobId && (
                        <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200/60">
                          🌿 Pivot Branch
                        </span>
                      )}

                      <span className="text-[11px] text-stone-400 font-medium">{formattedDate}</span>
                    </div>

                    <h3 className="text-base font-semibold text-ink group-hover:underline">
                      {sim.headline || sim.ideaText.slice(0, 80)}
                    </h3>

                    <p className="text-sm text-muted-ink line-clamp-2 leading-relaxed">
                      {sim.ideaText}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 pt-1">
                      <span>👥 {sim.panelSize} personas</span>
                      <span>🔄 {sim.rounds} rounds</span>
                      {sim.marketScore != null && (
                        <span className="font-bold text-stone-800">
                          🎯 Simulated Interest: {sim.marketScore}/100
                        </span>
                      )}
                      {(sim.inputTokens > 0 || sim.outputTokens > 0) && (
                        <span className="text-[11px] text-stone-400">
                          ⚡ {(sim.inputTokens + sim.outputTokens).toLocaleString()} tokens ($0 cost)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-stone-100">
                    {sim.shareToken && (
                      <Link
                        href={`/share/${sim.shareToken}`}
                        target="_blank"
                        className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                      >
                        🔗 Public Link
                      </Link>
                    )}

                    <Link
                      href={`/api/export/${sim.id}?format=markdown`}
                      target="_blank"
                      className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                      title="Download Markdown Dossier"
                    >
                      📥 Dossier (.md)
                    </Link>

                    <Link
                      href={sim.status === "completed" ? `/app/reports/${sim.id}` : `/jobs/${sim.id}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-xs font-semibold text-paper hover:bg-ink/85"
                    >
                      <span>{sim.status === "completed" ? "Open report" : "Open live view"}</span>
                      <span>→</span>
                    </Link>
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
