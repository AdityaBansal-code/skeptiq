"use client";

import { useEffect, useState } from "react";
import { PIPELINE_PHASES, isTerminal, type JobStatus } from "@repo/shared";
import { createClient } from "@/lib/supabase/client";

export interface JobRow {
  id: string;
  status: JobStatus;
  mode: string;
  panel_size: number;
  error: string | null;
  created_at: string;
}

const STEPS = ["queued", ...PIPELINE_PHASES] as const;

const LABELS: Record<(typeof STEPS)[number], string> = {
  queued: "Queued",
  generating_personas: "Generating personas",
  independent_phase: "Independent reactions",
  clustering: "Clustering",
  crosstalk_phase: "Structured cross-talk",
  synthesizing: "Synthesizing report",
};

export function JobLiveView({ initialJob }: { initialJob: JobRow }) {
  const [job, setJob] = useState<JobRow>(initialJob);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`job:${job.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "simulation_jobs",
          filter: `id=eq.${job.id}`,
        },
        (payload) => setJob(payload.new as JobRow),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [job.id]);

  const currentStep = STEPS.indexOf(job.status as (typeof STEPS)[number]);
  const terminal = isTerminal(job.status);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-lg font-semibold">Run {job.id.slice(0, 8)}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {job.mode} · {job.panel_size} personas
      </p>

      <ol className="mt-8 space-y-2">
        {STEPS.map((step, i) => {
          const done = terminal || (currentStep >= 0 && i < currentStep);
          const active = !terminal && job.status === step;
          return (
            <li
              key={step}
              className={`flex items-center gap-3 text-sm ${
                active
                  ? "font-medium text-neutral-900"
                  : done
                    ? "text-neutral-500"
                    : "text-neutral-400"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  active ? "bg-blue-500" : done ? "bg-neutral-400" : "bg-neutral-200"
                }`}
              />
              {LABELS[step]}
            </li>
          );
        })}
      </ol>

      {job.status === "completed" ? (
        <p className="mt-8 rounded-md bg-green-50 p-3 text-sm text-green-800">
          Simulation finished. Report rendering lands in Phase 3.
        </p>
      ) : null}
      {job.status === "failed" ? (
        <p className="mt-8 rounded-md bg-red-50 p-3 text-sm text-red-700">
          Failed: {job.error ?? "unknown error"}
        </p>
      ) : null}
    </main>
  );
}
