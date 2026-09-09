"use client";

import { useEffect, useState, useMemo } from "react";
import {
  PIPELINE_PHASES,
  isTerminal,
  AUDIENCE_PRESETS,
  type JobStatus,
  type ReportSummary,
  type AudiencePreset,
} from "@repo/shared";
import { createClient } from "@/lib/supabase/client";
import { cancelJobAction } from "@/app/actions";
import { PanelChat } from "@/components/PanelChat";
import { ShareButton } from "@/components/ShareButton";
import { BranchModal } from "@/components/BranchModal";

export interface JobRow {
  id: string;
  status: JobStatus;
  mode: string;
  panel_size: number;
  rounds?: number;
  debate_level?: string;
  audience_preset?: string;
  seed?: number | null;
  input_tokens?: number;
  output_tokens?: number;
  error: string | null;
  created_at: string;
  share_token?: string | null;
  parent_job_id?: string | null;
  branch_label?: string | null;
}

export interface TurnRow {
  id: string;
  persona_id: string;
  phase: "independent" | "crosstalk";
  round_number: number;
  content: string;
  created_at: string;
}

export interface PersonaRow {
  id: string;
  profile: {
    name: string;
    archetype?: string;
    targetRelevance?: string;
    cognitiveBias?: string;
    currentAlternative?: string;
    demographics?: {
      occupation?: string;
      age?: number;
      location?: string;
    };
    unvoicedReservation?: string;
  };
}

const STEPS = ["queued", ...PIPELINE_PHASES] as const;

const LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  generating_personas: "Personas",
  independent_phase: "Independent",
  clustering: "Clustering",
  crosstalk_phase: "Cross-Talk",
  synthesizing: "Synthesis",
  completed: "Completed",
  failed: "Failed",
};

interface QueueStatusData {
  jobId: string;
  status: string;
  queuePosition: number;
  jobsAhead: number;
  activeRunningCount: number;
  estimatedSecondsTotal: number;
  estimatedSecondsRemaining: number;
  elapsedSeconds: number;
  panelSize: number;
  rounds: number;
  workerStatus: "active" | "standby";
  hasWorkerUrlConfigured: boolean;
}

function formatDuration(sec: number): string {
  if (sec <= 0) return "0s";
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins === 0) return `${remSec}s`;
  if (remSec === 0) return `${mins}m`;
  return `${mins}m ${remSec}s`;
}

export function JobLiveView({ initialJob, ideaText }: { initialJob: JobRow; ideaText?: string }) {
  const [job, setJob] = useState<JobRow>(initialJob);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [personas, setPersonas] = useState<Map<string, PersonaRow>>(new Map());
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<"dossier" | "dialogue" | "chat" | "personas">("dossier");

  // Queue & Duration estimation state
  const [queueStatus, setQueueStatus] = useState<QueueStatusData | null>(null);
  const [wakingWorker, setWakingWorker] = useState(false);
  const [wakeMessage, setWakeMessage] = useState<string | null>(null);

  // Filters for Dialogue Tab
  const [dialoguePhaseFilter, setDialoguePhaseFilter] = useState<"all" | "independent" | "crosstalk">("all");
  const [selectedPersonaFilter, setSelectedPersonaFilter] = useState<string>("all");
  const [dialogueSearch, setDialogueSearch] = useState("");

  const totalTokens = (job.input_tokens || 0) + (job.output_tokens || 0);
  const presetKey = (job.audience_preset as AudiencePreset) || "general_consumer";
  const presetConfig = AUDIENCE_PRESETS[presetKey];
  const presetLabel = presetConfig?.label || job.audience_preset || "General Market";

  // 1. Initial fetch & Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();

    // Fetch existing personas & turns
    void supabase
      .from("personas")
      .select("id, profile")
      .eq("job_id", job.id)
      .then(({ data }) => {
        if (data) {
          const map = new Map<string, PersonaRow>();
          for (const p of data as PersonaRow[]) map.set(p.id, p);
          setPersonas(map);
        }
      });

    void supabase
      .from("turns")
      .select("id, persona_id, phase, round_number, content, created_at")
      .eq("job_id", job.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setTurns(data as TurnRow[]);
      });

    // Fetch report if already completed
    if (job.status === "completed") {
      void supabase
        .from("reports")
        .select("summary_json")
        .eq("job_id", job.id)
        .single()
        .then(({ data }) => {
          if (data?.summary_json) setReport(data.summary_json as ReportSummary);
        });
    }

    // Realtime subscription to job updates
    const jobChannel = supabase
      .channel(`job:${job.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "simulation_jobs",
          filter: `id=eq.${job.id}`,
        },
        (payload) => {
          const updated = payload.new as JobRow;
          setJob(updated);
          if (updated.status === "completed") {
            void supabase
              .from("reports")
              .select("summary_json")
              .eq("job_id", job.id)
              .single()
              .then(({ data }) => {
                if (data?.summary_json) setReport(data.summary_json as ReportSummary);
              });
          }
        }
      )
      .subscribe();

    // Realtime subscription to live turns
    const turnsChannel = supabase
      .channel(`job:${job.id}:turns`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "turns",
          filter: `job_id=eq.${job.id}`,
        },
        (payload) => {
          const newTurn = payload.new as TurnRow;
          setTurns((prev) => (prev.some((t) => t.id === newTurn.id) ? prev : [...prev, newTurn]));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(jobChannel);
      void supabase.removeChannel(turnsChannel);
    };
  }, [job.id]);

  // 2. Active Polling Fallback
  useEffect(() => {
    if (isTerminal(job.status)) return;
    const supabase = createClient();

    const interval = setInterval(async () => {
      // Poll job status
      const { data: jobData } = await supabase
        .from("simulation_jobs")
        .select("id, status, mode, panel_size, rounds, debate_level, audience_preset, seed, input_tokens, output_tokens, error, created_at, share_token, parent_job_id, branch_label")
        .eq("id", job.id)
        .single();
      if (jobData) {
        const updated = jobData as JobRow;
        setJob((prev) => (prev.status !== updated.status || prev.error !== updated.error ? updated : prev));
        if (updated.status === "completed" && !report) {
          const { data: reportData } = await supabase
            .from("reports")
            .select("summary_json")
            .eq("job_id", job.id)
            .single();
          if (reportData?.summary_json) setReport(reportData.summary_json as ReportSummary);
        }
      }

      // Poll personas if not yet loaded
      if (personas.size === 0) {
        const { data: personaData } = await supabase
          .from("personas")
          .select("id, profile")
          .eq("job_id", job.id);
        if (personaData && personaData.length > 0) {
          const map = new Map<string, PersonaRow>();
          for (const p of personaData as PersonaRow[]) map.set(p.id, p);
          setPersonas(map);
        }
      }

      // Poll turns
      const { data: turnsData } = await supabase
        .from("turns")
        .select("id, persona_id, phase, round_number, content, created_at")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true });
      if (turnsData && turnsData.length > 0) {
        setTurns((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const hasNew = (turnsData as TurnRow[]).some((t) => !existingIds.has(t.id));
          return hasNew ? (turnsData as TurnRow[]) : prev;
        });
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [job.id, job.status, report, personas.size]);

  // 3. Queue status & Estimated duration polling
  useEffect(() => {
    if (isTerminal(job.status)) return;
    async function fetchQueueStatus() {
      try {
        const res = await fetch(`/api/queue-status?jobId=${job.id}`);
        if (res.ok) {
          const data = (await res.json()) as QueueStatusData;
          setQueueStatus(data);
        }
      } catch {
        // Ignore network hiccups
      }
    }
    void fetchQueueStatus();
    const qInterval = setInterval(fetchQueueStatus, 3000);
    return () => clearInterval(qInterval);
  }, [job.id, job.status]);

  async function handleWakeWorker() {
    setWakingWorker(true);
    setWakeMessage(null);
    try {
      const res = await fetch("/api/wake", { method: "POST" });
      const data = await res.json();
      setWakeMessage(data.message || (data.ok ? "Worker active!" : "Wake-up ping dispatched."));
    } catch {
      setWakeMessage("Ping dispatched to worker engine.");
    } finally {
      setWakingWorker(false);
      setTimeout(() => setWakeMessage(null), 6000);
    }
  }

  async function handleCancel() {
    if (!confirm("Are you sure you want to stop this simulation?")) return;
    setCancelling(true);
    try {
      const res = await cancelJobAction(job.id);
      if (!res.ok) alert(res.error || "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  }

  const currentStep = STEPS.indexOf(job.status as (typeof STEPS)[number]);
  const terminal = isTerminal(job.status);
  const completed = job.status === "completed";
  const cancelled = job.status === "failed" && job.error?.toLowerCase().includes("cancelled") === true;

  // Filtered turns for dialogue tab
  const filteredTurns = useMemo(() => {
    return turns.filter((turn) => {
      if (dialoguePhaseFilter !== "all" && turn.phase !== dialoguePhaseFilter) {
        return false;
      }
      if (selectedPersonaFilter !== "all" && turn.persona_id !== selectedPersonaFilter) {
        return false;
      }
      if (dialogueSearch.trim()) {
        const p = personas.get(turn.persona_id);
        const nameMatch = p?.profile.name.toLowerCase().includes(dialogueSearch.toLowerCase());
        const contentMatch = turn.content.toLowerCase().includes(dialogueSearch.toLowerCase());
        if (!nameMatch && !contentMatch) return false;
      }
      return true;
    });
  }, [turns, dialoguePhaseFilter, selectedPersonaFilter, dialogueSearch, personas]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 text-ink">
      {/* Back to Overview Nav */}
      <div className="flex items-center justify-between">
        <a
          href="/app"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-ink transition-colors hover:text-ink"
        >
          <span>←</span>
          <span>Back to workspace</span>
        </a>
      </div>

      {/* 1. Header & Control Toolbar */}
      <div className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-stone-600 bg-stone-100 px-2.5 py-0.5 rounded-lg border border-stone-200">
                RUN #{job.id.slice(0, 8)}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200/60">
                {presetLabel}
              </span>
              {job.branch_label && (
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200/60">
                  Pivot: {job.branch_label}
                </span>
              )}
              {job.seed != null && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-mono text-zinc-600">
                  seed:{job.seed}
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-zinc-600">
              <span className="font-semibold text-zinc-800 capitalize">{job.mode}</span> mode ·{" "}
              <span className="font-semibold text-zinc-800">{job.panel_size} Personas</span> ·{" "}
              <span className="font-semibold text-zinc-800">{job.rounds || 12} Deliberation Turns</span>
              {totalTokens > 0 && (
                <span> · <span className="font-mono text-xs text-zinc-500">{totalTokens.toLocaleString()} tokens</span></span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {job.status === "completed" && report ? (
              <>
                <a
                  href={`/api/export/${job.id}?format=markdown`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer"
                  title="Download Markdown Dossier"
                >
                  <span>📥 Dossier (.md)</span>
                </a>
                <a
                  href={`/api/export/${job.id}?format=json`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer"
                  title="Export Raw Data JSON"
                >
                  <span>JSON</span>
                </a>
                {job.share_token && <ShareButton shareToken={job.share_token} />}
                <BranchModal parentJobId={job.id} originalIdeaText={ideaText || ""} />
              </>
            ) : !terminal ? (
                <button
                  type="button"
                  onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors shadow-2xs cursor-pointer"
              >
                {cancelling ? "Stopping…" : "⏹ Stop Simulation"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Pitch Display Banner */}
        {ideaText && (
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3.5 text-xs sm:text-sm text-zinc-700 leading-relaxed">
            <span className="font-bold text-zinc-900 mr-1.5">Evaluated Proposition:</span>
            &ldquo;{ideaText}&rdquo;
          </div>
        )}
      </div>

      {/* 1.5 Live Queue & Estimated Time Card */}
      {!terminal && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              {job.status === "queued" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  Queue Position: #{queueStatus?.queuePosition ?? 1}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                  <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                  Live Engine: {LABELS[job.status] || job.status}
                </span>
              )}
              <span className="text-xs text-zinc-500 hidden sm:inline">
                {job.status === "queued"
                  ? queueStatus?.jobsAhead === 0
                    ? "Next in line — simulation worker is picking up this job"
                    : `${queueStatus?.jobsAhead} job(s) ahead in line`
                  : "Synthesizing collective cognitive deliberation"}
              </span>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {wakeMessage && (
                <span className="text-[11px] font-medium text-emerald-600 animate-fade-in bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  {wakeMessage}
                </span>
              )}
              <button
                type="button"
                onClick={handleWakeWorker}
                disabled={wakingWorker}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Ping the background simulation worker to ensure it is awake on Render"
              >
                <span className={wakingWorker ? "animate-spin" : ""}>⚡</span>
                <span>{wakingWorker ? "Pinging Engine…" : "Wake Engine"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Queue State</span>
              <span className="mt-1 block font-mono text-sm font-bold text-zinc-800">
                {job.status === "queued" ? `#${queueStatus?.queuePosition ?? 1} in queue` : "Active in pipeline"}
              </span>
              <span className="text-[11px] text-zinc-500">
                {queueStatus?.jobsAhead ? `${queueStatus.jobsAhead} simulation(s) ahead` : queueStatus?.activeRunningCount ? `${queueStatus.activeRunningCount} running active` : "Processing"}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Elapsed Time</span>
              <span className="mt-1 block font-mono text-sm font-bold text-zinc-800">
                {formatDuration(queueStatus?.elapsedSeconds ?? 0)}
              </span>
              <span className="text-[11px] text-zinc-500">
                Started {new Date(job.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Simulation Engine</span>
              <span className="mt-1 block font-mono text-xs font-bold">
                {queueStatus?.workerStatus === "active" ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Online & Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> Booting / Standby
                  </span>
                )}
              </span>
              <span className="text-[11px] text-zinc-500">
                Background worker
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Pipeline Execution Stepper */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Pipeline Timeline</h2>
          {!terminal ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
              Live Simulation In Progress
            </span>
          ) : cancelled ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <span aria-hidden="true">⏹</span>
              Simulation Cancelled
            </span>
          ) : completed ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              ✓ Simulation Completed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
              <span aria-hidden="true">!</span>
              Simulation Failed
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {STEPS.map((step, i) => {
            const done = completed || (currentStep >= 0 && i < currentStep);
            const active = !terminal && job.status === step;
            return (
              <div
                key={step}
                className={`flex flex-col p-2.5 rounded-xl border text-xs transition-all ${
                  active
                    ? "border-blue-500 bg-blue-50/80 font-bold text-blue-900 shadow-xs"
                    : done
                    ? "border-emerald-200 bg-emerald-50/40 text-emerald-950 font-medium"
                    : "border-zinc-200/60 bg-zinc-50 text-zinc-400"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-zinc-400">0{i + 1}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      active
                        ? "bg-blue-600 animate-pulse"
                        : done
                        ? "bg-emerald-500"
                        : "bg-zinc-300"
                    }`}
                  />
                </div>
                <span className="text-[11px] leading-tight font-medium">
                  {LABELS[step]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {job.status === "failed" && (
        <div className={`rounded-2xl border p-5 text-sm shadow-sm ${cancelled ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <p className="font-bold">{cancelled ? "Simulation Cancelled" : "Simulation Failed"}</p>
          <p className="mt-1 font-mono text-xs">{job.error ?? "Unknown error occurred"}</p>
        </div>
      )}

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-200 pb-1 overflow-x-auto">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "dossier"}
                  onClick={() => setActiveTab("dossier")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "dossier"
              ? "bg-zinc-900 text-white shadow-xs"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          <span>📊 Executive Dossier</span>
          {report && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "dialogue"}
          onClick={() => setActiveTab("dialogue")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "dialogue"
              ? "bg-zinc-900 text-white shadow-xs"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          <span>💬 Focus Group Stream</span>
          <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === "dialogue" ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-600"}`}>
            {turns.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "personas"}
          onClick={() => setActiveTab("personas")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "personas"
              ? "bg-zinc-900 text-white shadow-xs"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          <span>👥 Personas Roster</span>
          <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === "personas" ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-600"}`}>
            {personas.size}
          </span>
        </button>

        {completed && personas.size > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "chat"
                ? "bg-zinc-900 text-white shadow-xs"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <span>🔍 Cross-Examine Q&A</span>
          </button>
        )}
      </div>

      {/* 4. Tab Content */}

      {/* TAB 1: EXECUTIVE DOSSIER */}
      {activeTab === "dossier" && (
        <div className="space-y-6">
          {!report && !terminal ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center text-zinc-400 space-y-3">
              <div className="h-6 w-6 mx-auto rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin" />
              <p className="text-xs font-medium text-zinc-600">Synthesizing executive market report…</p>
              <p className="text-[11px] text-zinc-400">The personas are actively deliberating. Report will unlock upon completion.</p>
            </div>
          ) : report ? (
            <section className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm space-y-6">
              {/* Executive Verdict Hero */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-6">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                    ✓ Executive Verdict
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-zinc-900 leading-snug">
                    {report.headline}
                  </h2>
                </div>
                <div className="rounded-2xl bg-zinc-900 px-6 py-3.5 text-white text-center sm:text-right min-w-[190px] shadow-sm shrink-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                    Adoption Likelihood
                  </span>
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

              {/* Van Westendorp Price Sensitivity (PSM) Card with Visual Band */}
              {report.priceSensitivity && (
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-emerald-200/50 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Simulated PSM
                      </span>
                      <h3 className="text-sm font-bold text-emerald-950">
                        Van Westendorp Price Sensitivity Meter
                      </h3>
                    </div>
                    <span className="text-xs text-emerald-800 font-medium">
                      Directional market fit · {report.priceSensitivity.sampleSize} personas sampled
                    </span>
                  </div>

                  {/* 4 Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500">Optimal (OPP)</span>
                      <p className="mt-1 text-lg sm:text-xl font-black text-emerald-700">
                        {report.priceSensitivity.currency} {report.priceSensitivity.optimalPricePoint.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-zinc-400">Lowest resistance</span>
                    </div>

                    <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500">Indifference (IPP)</span>
                      <p className="mt-1 text-lg sm:text-xl font-black text-zinc-800">
                        {report.priceSensitivity.currency} {report.priceSensitivity.indifferencePricePoint.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-zinc-400">Median perception</span>
                    </div>

                    <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500">Marginal Cheap</span>
                      <p className="mt-1 text-lg sm:text-xl font-black text-zinc-700">
                        {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalCheapness.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-zinc-400">Suspicion floor</span>
                    </div>

                    <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500">Marginal Expensive</span>
                      <p className="mt-1 text-lg sm:text-xl font-black text-amber-700">
                        {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalExpensiveness.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-zinc-400">Drop-off ceiling</span>
                    </div>
                  </div>

                  {/* Visual Price Sensitivity Band Meter */}
                  <div className="rounded-xl bg-white p-4 border border-emerald-100/80 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600">
                      <span>Suspicion Floor: {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalCheapness}</span>
                      <span className="text-emerald-800 font-bold">Acceptable Pricing Corridor</span>
                      <span>Ceiling: {report.priceSensitivity.currency} {report.priceSensitivity.pointOfMarginalExpensiveness}</span>
                    </div>

                    {/* Gradient Bar with Markers */}
                    <div className="relative h-4 rounded-full bg-linear-to-r from-zinc-200 via-emerald-400 to-amber-300 border border-emerald-200">
                      <div className="absolute inset-0 flex items-center justify-around px-4 text-[9px] font-bold text-zinc-800">
                        <span>OPP: {report.priceSensitivity.currency}{report.priceSensitivity.optimalPricePoint}</span>
                        <span>IPP: {report.priceSensitivity.currency}{report.priceSensitivity.indifferencePricePoint}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recommendation Takeaway */}
                  <p className="text-xs text-emerald-950 font-medium leading-relaxed bg-white p-3.5 rounded-xl border border-emerald-100">
                    💡 {report.priceSensitivity.priceRecommendation}
                  </p>
                </div>
              )}

              {/* Consensus Mode Convergence Card (if mode === 'consensus') */}
              {report.consensusMetrics && (
                <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-5 sm:p-6 space-y-4 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-blue-200/50 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Consensus Engine
                      </span>
                      <h3 className="text-sm font-bold text-blue-950">
                        Delphi Panel Alignment & Compromise Index
                      </h3>
                    </div>
                    <span className="text-xs font-black text-blue-900 bg-white px-2.5 py-1 rounded-lg border border-blue-200">
                      {report.consensusMetrics.convergenceScore}% Alignment Score
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-blue-900">
                      <span>Group Convergence</span>
                      <span className="uppercase text-[10px] tracking-wider">{report.consensusMetrics.finalGroupStance.replace(/_/g, " ")}</span>
                    </div>
                    <div className="h-2 w-full bg-blue-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all"
                        style={{ width: `${report.consensusMetrics.convergenceScore}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                    {report.consensusMetrics.universalAgreements?.length > 0 && (
                      <div className="rounded-xl bg-white p-3.5 border border-blue-100 space-y-1">
                        <p className="font-bold text-emerald-800 text-[11px] uppercase">✓ Universal Agreements</p>
                        <ul className="list-disc pl-4 text-zinc-700 space-y-0.5">
                          {report.consensusMetrics.universalAgreements.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.consensusMetrics.keyCompromisesRequired?.length > 0 && (
                      <div className="rounded-xl bg-white p-3.5 border border-blue-100 space-y-1">
                        <p className="font-bold text-blue-800 text-[11px] uppercase">⚡ Key Compromises Needed</p>
                        <ul className="list-disc pl-4 text-zinc-700 space-y-0.5">
                          {report.consensusMetrics.keyCompromisesRequired.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.consensusMetrics.unresolvedContestations?.length > 0 && (
                      <div className="rounded-xl bg-white p-3.5 border border-blue-100 space-y-1">
                        <p className="font-bold text-amber-800 text-[11px] uppercase">⚠ Unresolved Disagreements</p>
                        <ul className="list-disc pl-4 text-zinc-700 space-y-0.5">
                          {report.consensusMetrics.unresolvedContestations.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Concrete Action Plan & Validation Experiment Roadmap */}
              {report.actionPlan && (
                <div className="rounded-2xl border border-indigo-200/80 bg-linear-to-br from-indigo-50/50 via-white to-purple-50/40 p-5 sm:p-6 space-y-4 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-indigo-100 pb-3">
                    <span className="rounded-md bg-indigo-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Decision Support
                    </span>
                    <h3 className="text-sm font-bold text-indigo-950">
                      Concrete Next-Step Validation Roadmap
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="rounded-xl bg-white p-4 border border-indigo-100 space-y-2 shadow-2xs">
                      <p className="text-[10px] uppercase font-bold text-zinc-500">🎯 #1 Riskiest Assumption</p>
                      <p className="font-semibold text-zinc-900 leading-relaxed">{report.actionPlan.riskiestAssumption}</p>
                    </div>

                    <div className="rounded-xl bg-white p-4 border border-indigo-100 space-y-2 shadow-2xs">
                      <p className="text-[10px] uppercase font-bold text-zinc-500">🧪 Cheapest Validation Experiment</p>
                      <p className="font-semibold text-zinc-900 leading-relaxed">{report.actionPlan.cheapestValidationExperiment}</p>
                    </div>

                    <div className="rounded-xl bg-white p-4 border border-indigo-100 space-y-2 shadow-2xs">
                      <p className="text-[10px] uppercase font-bold text-zinc-500">👥 Target Interview Profile</p>
                      <p className="font-semibold text-zinc-900 leading-relaxed">{report.actionPlan.targetInterviewProfile}</p>
                      {report.actionPlan.suggestedQuestions?.length > 0 && (
                        <div className="pt-1">
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Suggested Questions:</p>
                          <ul className="list-disc pl-4 text-zinc-600 mt-0.5 space-y-0.5">
                            {report.actionPlan.suggestedQuestions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl bg-white p-4 border border-indigo-100 space-y-2 shadow-2xs">
                      <p className="text-[10px] uppercase font-bold text-zinc-500">📊 Thresholds for Decision</p>
                      <div className="space-y-1">
                        <p className="text-emerald-800 font-semibold">
                          ✓ Success: <span className="font-normal text-zinc-800">{report.actionPlan.successThreshold}</span>
                        </p>
                        <p className="text-red-800 font-semibold">
                          ✗ Invalidation: <span className="font-normal text-zinc-800">{report.actionPlan.invalidationCriteria}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Evidence & Quote Provenance Map */}
              {report.evidenceClaims && report.evidenceClaims.length > 0 && (
                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 space-y-3 shadow-2xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Evidence-Backed Dialogue Citations ({report.evidenceClaims.length})
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {report.evidenceClaims.map((claim, idx) => (
                      <div key={idx} className="rounded-xl bg-white p-3.5 border border-zinc-200/80 text-xs space-y-1.5 shadow-2xs">
                        <p className="font-bold text-zinc-900">"{claim.claim}"</p>
                        <p className="italic text-zinc-600 border-l-2 border-zinc-300 pl-2 text-[11px]">
                          “{claim.verbatimExcerpt}”
                        </p>
                        <div className="flex flex-wrap gap-1 text-[10px] text-zinc-500 pt-1">
                          {claim.supportingPersonaNames?.map((n, i) => (
                            <span key={i} className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium border border-emerald-200/50">
                              + {n}
                            </span>
                          ))}
                          {claim.opposingPersonaNames?.map((n, i) => (
                            <span key={i} className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-medium border border-red-200/50">
                              - {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cognitive Biases & Resistance Profile Card */}
              {report.cognitiveBiasesEncountered && report.cognitiveBiasesEncountered.length > 0 && (
                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-5 space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Psychological Resistances & Cognitive Biases Encountered
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

              {/* Segments Breakdown */}
              {report.segments?.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                    Audience Segments ({report.segments.length})
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {report.segments.map((seg, idx) => (
                      <div key={idx} className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-zinc-900 text-sm">{seg.label}</h4>
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold tracking-wider ${
                            seg.stance === "adopt"
                              ? "bg-emerald-100 text-emerald-800"
                              : seg.stance === "conditional"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {seg.stance}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-zinc-500 font-medium">
                        <div className="flex items-center justify-between">
                          <span>Segment Share: <strong>{seg.sizePct}%</strong></span>
                          <span>Likelihood: <strong className="text-zinc-800">{seg.adoptionLikelihoodLow}% – {seg.adoptionLikelihoodHigh}%</strong></span>
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

                      {seg.keyObjections.length > 0 && (
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

            {/* Pivot A/B Sentiment Delta (if branched) */}
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
                        <p className="font-bold text-amber-800 text-[11px] uppercase">⚠ New Pivot Friction</p>
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

              {/* Cross-Cutting Dealbreakers */}
              {report.crossCuttingObjections.length > 0 && (
                <div className="border-t border-zinc-100 pt-5 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Cross-Cutting Dealbreakers & Fatal Obstacles
                  </h3>
                  <ul className="list-disc pl-5 text-xs sm:text-sm text-zinc-600 space-y-1">
                    {report.crossCuttingObjections.map((obj, idx) => (
                      <li key={idx}>{obj}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw JSON Debug Collapsible */}
              <details className="border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                <summary className="cursor-pointer font-medium hover:text-zinc-800">
                  Inspect Raw Summary JSON
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-zinc-900 p-4 font-mono text-emerald-400 text-[11px]">
                  {JSON.stringify(report, null, 2)}
                </pre>
              </details>
            </section>
          ) : null}
        </div>
      )}

      {/* TAB 2: DIALOGUE STREAM */}
      {activeTab === "dialogue" && (
        <section className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm space-y-5">
          {/* Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
                Deliberation Dialogue ({filteredTurns.length} / {turns.length} turns)
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Real-time speech transcripts and private internal monologues.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Phase Switcher */}
              <div className="flex rounded-lg bg-zinc-100 p-1 font-semibold text-zinc-600">
                <button
                  onClick={() => setDialoguePhaseFilter("all")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    dialoguePhaseFilter === "all" ? "bg-white text-zinc-900 shadow-2xs" : "hover:text-zinc-900"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setDialoguePhaseFilter("independent")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    dialoguePhaseFilter === "independent" ? "bg-white text-zinc-900 shadow-2xs" : "hover:text-zinc-900"
                  }`}
                >
                  Initial
                </button>
                <button
                  onClick={() => setDialoguePhaseFilter("crosstalk")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    dialoguePhaseFilter === "crosstalk" ? "bg-white text-zinc-900 shadow-2xs" : "hover:text-zinc-900"
                  }`}
                >
                  Cross-Talk
                </button>
              </div>

              {/* Persona Filter */}
                <label htmlFor="dialogue-persona-filter" className="sr-only">Filter dialogue by persona</label>
                <select
                id="dialogue-persona-filter"
                value={selectedPersonaFilter}
                onChange={(e) => setSelectedPersonaFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800 outline-none"
              >
                <option value="all">All Personas</option>
                {Array.from(personas.values()).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.profile.name}
                  </option>
                ))}
              </select>

              {/* Search input */}
              <label htmlFor="dialogue-search" className="sr-only">Search dialogue</label>
              <input
                id="dialogue-search"
                type="text"
                placeholder="Search dialogue…"
                value={dialogueSearch}
                onChange={(e) => setDialogueSearch(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800 outline-none w-32 focus:w-44 transition-all"
              />
            </div>
          </div>

          {filteredTurns.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400 italic">
              {turns.length === 0
                ? "Waiting for personas to begin speaking…"
                : "No turns match the selected filter."}
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[700px] overflow-y-auto pr-1">
              {filteredTurns.map((turn) => {
                const persona = personas.get(turn.persona_id);
                const isIndependent = turn.phase === "independent";

                // Check for internal thought monologue
                const internalMatch = turn.content.match(/💭\s*\*\([^)]+\)\*/);
                const monologueText = internalMatch
                  ? internalMatch[0].replace(/💭\s*\*\(/, "").replace(/\)\*$/, "")
                  : null;
                const spokenContent = turn.content.replace(/💭\s*\*\([^)]+\)\*\s*/g, "").trim();

                const initials = (persona?.profile.name || "P")
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <div
                    key={turn.id}
                    className={`rounded-2xl border p-4 sm:p-5 text-xs sm:text-sm transition-all ${
                      isIndependent
                        ? "border-zinc-200/80 bg-zinc-50/40"
                        : "border-blue-100 bg-blue-50/20"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 mb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-white">
                          {initials}
                        </span>
                        <span className="font-bold text-zinc-900">
                          {persona?.profile.name ?? "Persona"}
                        </span>
                        {persona?.profile.demographics?.occupation && (
                          <span className="text-zinc-500 text-[11px]">
                            · {persona.profile.demographics.occupation}
                          </span>
                        )}
                        {persona?.profile.targetRelevance && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              persona.profile.targetRelevance === "core_target"
                                ? "bg-emerald-100 text-emerald-800"
                                : persona.profile.targetRelevance === "adjacent_buyer"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {persona.profile.targetRelevance.replace(/_/g, " ")}
                          </span>
                        )}
                        {persona?.profile.cognitiveBias && (
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 font-medium">
                            {persona.profile.cognitiveBias.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {turn.phase === "independent" ? "Initial Reaction" : `Round ${turn.round_number}`}
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
          )}
        </section>
      )}

      {/* TAB 3: INTERACTIVE CROSS-EXAMINE */}
      {activeTab === "chat" && completed && personas.size > 0 && (
        <PanelChat
          jobId={job.id}
          personas={Array.from(personas.values()).map((p) => ({
            id: p.id,
            name: p.profile.name,
            occupation: p.profile.demographics?.occupation || p.profile.archetype || "Consumer",
            job_id: job.id,
            profile_json: p.profile,
            created_at: "",
          }))}
        />
      )}

      {/* TAB 4: PERSONAS ROSTER */}
      {activeTab === "personas" && (
        <section className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm space-y-4">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
              Synthetic Persona Panel ({personas.size} personas)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Psychographically profiled personas generated for this cohort.
            </p>
          </div>

          {personas.size === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              Generating persona profiles…
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from(personas.values()).map((p) => (
                <div key={p.id} className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 space-y-2.5 text-xs shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 text-sm">{p.profile.name}</span>
                    {p.profile.targetRelevance && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        p.profile.targetRelevance === "core_target"
                          ? "bg-emerald-100 text-emerald-800"
                          : p.profile.targetRelevance === "adjacent_buyer"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-zinc-100 text-zinc-600"
                      }`}>
                        {p.profile.targetRelevance.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-zinc-600">
                    {p.profile.demographics?.occupation && (
                      <p><strong>Role:</strong> {p.profile.demographics.occupation}</p>
                    )}
                    {p.profile.archetype && (
                      <p><strong>Archetype:</strong> {p.profile.archetype}</p>
                    )}
                    {p.profile.currentAlternative && (
                      <p><strong>Current Alternative:</strong> {p.profile.currentAlternative}</p>
                    )}
                    {p.profile.cognitiveBias && (
                      <p><strong>Dominant Bias:</strong> {p.profile.cognitiveBias.replace(/_/g, " ")}</p>
                    )}
                    {p.profile.unvoicedReservation && (
                      <p className="text-zinc-500 italic"><strong>Secret Hesitation:</strong> &ldquo;{p.profile.unvoicedReservation}&rdquo;</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
