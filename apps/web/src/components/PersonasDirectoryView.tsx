"use client";

import { useState } from "react";
import Link from "next/link";
import type { PersonaItem } from "@/lib/db";

interface PersonasDirectoryViewProps {
  personas: PersonaItem[];
  onOpenNewSimulation: () => void;
}

export function PersonasDirectoryView({
  personas,
  onOpenNewSimulation,
}: PersonasDirectoryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const simulations = Array.from(new Set(personas.map((persona) => persona.jobId)));

  const filtered = personas.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.archetype.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.ideaText.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    return true;
  });

  const personasBySimulation = simulations.map((jobId) => ({
    jobId,
    personas: filtered.filter((persona) => persona.jobId === jobId),
  })).filter((group) => group.personas.length > 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-stone-900">
            Personas
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Inspect the stored profiles behind each simulation, grouped by the run that generated them.
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

      {/* Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#eee9e2] bg-white p-3 shadow-2xs">
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">🔍</span>
          <label htmlFor="persona-search" className="sr-only">Search personas</label>
          <input
            id="persona-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by persona name, role, archetype, or venture..."
            className="w-full rounded-xl border border-stone-200 bg-stone-50/50 py-1.5 pl-8 pr-3 text-xs text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-hidden focus:border-stone-400"
          />
        </div>

        <span className="text-xs text-muted-ink">{personas.length} stored personas</span>
      </div>

      {/* Personas Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-white/70 p-12 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
            👥
          </div>
          <h3 className="text-sm font-bold text-stone-800">No personas found</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Run a simulation to populate synthetic customer panels with diverse backgrounds, biases, and willingness-to-pay.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {personasBySimulation.map(({ jobId, personas: simulationPersonas }) => {
            const simulation = simulationPersonas[0]!;
            return <section key={jobId} aria-labelledby={`simulation-${jobId}`} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 id={`simulation-${jobId}`} className="text-base font-semibold text-ink">{simulation.simulationLabel}</h2>
                  <p className="mt-1 text-xs text-muted-ink">{simulationPersonas.length} personas from this simulation</p>
                </div>
                <Link href={`/jobs/${jobId}`} className="text-sm font-medium text-muted-ink underline-offset-4 hover:text-ink hover:underline">Open simulation</Link>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {simulationPersonas.map((p) => {
            const initials = p.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={p.id}
                className="flex flex-col justify-between space-y-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink/30"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/70 text-xs font-black text-amber-900 border border-amber-200/60">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-stone-900 truncate">{p.name}</h3>
                      <p className="text-xs text-stone-500 truncate">{p.role}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                      {p.archetype}
                    </span>
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                      {p.relevanceTag}
                    </span>
                    {p.priceBandMax != null && (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200/60">
                        Max WTP: ${p.priceBandMax}
                      </span>
                    )}
                  </div>

                  <dl className="grid gap-2 border-t border-line pt-3 text-xs leading-5">
                    <div><dt className="font-medium text-muted-ink">Relevance</dt><dd className="text-ink">{p.relationshipToIdea || p.relevanceTag}</dd></div>
                    <div><dt className="font-medium text-muted-ink">Current alternative</dt><dd className="text-ink">{p.currentAlternative || "Not recorded"}</dd></div>
                    <div><dt className="font-medium text-muted-ink">Bias and friction</dt><dd className="text-ink">{[p.cognitiveBias, p.switchingFriction].filter(Boolean).join(" · ") || "Not recorded"}</dd></div>
                    <div><dt className="font-medium text-muted-ink">Cluster</dt><dd className="text-ink">{p.clusterLabel || "Not clustered"}</dd></div>
                  </dl>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
                  <span className="truncate max-w-[150px] font-medium" title={p.ideaText}>
                    💡 {p.ideaText}
                  </span>
                  <Link
                    href={`/jobs/${p.jobId}`}
                    className="font-bold text-stone-700 hover:text-stone-900 underline"
                  >
                    View Panel →
                  </Link>
                </div>
              </div>
            );
          })}
              </div>
            </section>;
          })}
        </div>
      )}
    </div>
  );
}
