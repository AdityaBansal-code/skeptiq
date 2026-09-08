"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SimulationJobSummary, DashboardAnalytics } from "@/lib/db";
import { createQuickSimulationAction } from "@/app/actions";

interface DashboardViewProps {
  simulations: SimulationJobSummary[];
  analytics: DashboardAnalytics;
  onOpenNewSimulation: () => void;
  onSelectTab: (tab: string) => void;
}

const EXAMPLE_PROMPTS = [
  "AI fitness coach for busy professionals",
  "Sustainable fashion rental platform",
  "Mental health app for students",
];

export function DashboardView({
  simulations,
  analytics,
  onOpenNewSimulation,
  onSelectTab,
}: DashboardViewProps) {
  const router = useRouter();
  const [quickPrompt, setQuickPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("Last 30 days");

  async function handleQuickLaunch(e: React.FormEvent) {
    e.preventDefault();
    if (!quickPrompt.trim() || quickPrompt.trim().length < 10) {
      setErrorMsg("Please enter at least 10 characters describing your idea.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.set("rawText", quickPrompt.trim());
    formData.set("mode", "segmentation");
    formData.set("panelSize", "6");
    formData.set("rounds", "12");
    formData.set("debateLevel", "standard");
    formData.set("audiencePreset", "general_consumer");

    try {
      const res = await createQuickSimulationAction(formData);
      if (res?.error) {
        setErrorMsg(res.error);
        setIsSubmitting(false);
      } else if (res?.jobId) {
        router.push(`/jobs/${res.jobId}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to launch simulation");
      setIsSubmitting(false);
    }
  }

  // Get status color and progress for recent simulations
  function getStatusConfig(sim: SimulationJobSummary) {
    switch (sim.status) {
      case "completed":
        return {
          label: "Completed",
          badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
          barClass: "bg-emerald-500",
          progress: 100,
          borderClass: "border-stone-200/80 hover:border-stone-300",
        };
      case "generating_personas":
        return {
          label: "Generating personas",
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse",
          barClass: "bg-amber-500",
          progress: 25,
          borderClass: "border-amber-200/90 shadow-sm",
        };
      case "independent_phase":
        return {
          label: "Independent reactions",
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse",
          barClass: "bg-amber-500",
          progress: 50,
          borderClass: "border-amber-200/90 shadow-sm",
        };
      case "clustering":
        return {
          label: "Clustering segments",
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse",
          barClass: "bg-amber-500",
          progress: 65,
          borderClass: "border-amber-200/90 shadow-sm",
        };
      case "crosstalk_phase":
        return {
          label: "Cross-talk debate",
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse",
          barClass: "bg-amber-500",
          progress: 80,
          borderClass: "border-amber-200/90 shadow-sm",
        };
      case "synthesizing":
        return {
          label: "Synthesizing report",
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse",
          barClass: "bg-amber-500",
          progress: 92,
          borderClass: "border-amber-200/90 shadow-sm",
        };
      case "failed":
        return {
          label: "Failed",
          badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
          barClass: "bg-rose-500",
          progress: 100,
          borderClass: "border-rose-200/80",
        };
      default:
        return {
          label: "Queued",
          badgeClass: "bg-stone-100 text-stone-600 border-stone-200",
          barClass: "bg-stone-400",
          progress: 10,
          borderClass: "border-stone-200/80",
        };
    }
  }

  // Icons for simulation cards
  const categoryIcons = ["🌱", "💬", "🛍️", "🎮", "⚡", "🔬", "📈", "🚀"];

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-stone-900">
            Market simulations
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Turn your ideas into real customer insights.
          </p>
        </div>
        <button
          onClick={onOpenNewSimulation}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-stone-800 transition-all active:scale-95"
        >
          <span className="text-sm font-bold">+</span>
          <span>New simulation</span>
        </button>
      </div>

      {/* Main Grid: Left Main Content + Right Analytics Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (8 cols): Hero Quick Launch + Recent Simulations */}
        <div className="lg:col-span-8 space-y-8">
          {/* Hero Quick Simulation Card with Organic Pastel Blob */}
          <div className="relative overflow-hidden rounded-3xl border border-[#eee9e2] bg-white p-6 sm:p-8 shadow-xs bg-pastel-blob-hero">
            {/* Top Content */}
            <div className="max-w-xl space-y-2 relative z-10">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-stone-900 leading-snug">
                Understand how real customers might react before you build.
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                Get AI-powered market research, customer personas, and realistic feedback — in hours, not months.
              </p>
            </div>

            {/* Quick Prompt Input Form */}
            <form onSubmit={handleQuickLaunch} className="mt-6 relative z-10 space-y-3">
              <div className="rounded-2xl border border-stone-200/90 bg-white/95 p-3 shadow-xs focus-within:border-stone-400 focus-within:ring-2 focus-within:ring-stone-200 transition-all">
                <textarea
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value)}
                  placeholder="Describe your product or startup idea..."
                  rows={3}
                  className="w-full resize-none border-none bg-transparent p-1.5 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden"
                />

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 mt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenNewSimulation()}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-50 rounded-lg transition-colors text-xs flex items-center gap-1 font-medium"
                      title="Open full configuration studio"
                    >
                      <span>⚙️</span>
                      <span className="hidden sm:inline">Advanced Studio</span>
                    </button>
                    <span className="text-[11px] text-stone-400">
                      {quickPrompt.length > 0 ? `${quickPrompt.length} chars` : ""}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !quickPrompt.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        <span>Initializing...</span>
                      </>
                    ) : (
                      <>
                        <span>→</span>
                        <span>Run simulation</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
                  {errorMsg}
                </div>
              )}

              {/* Suggestion Example Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-stone-500">Try an example:</span>
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setQuickPrompt(prompt)}
                    className="rounded-lg border border-stone-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:border-stone-400 hover:bg-white transition-all active:scale-95"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </form>
          </div>

          {/* Recent Simulations Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-900">Recent simulations</h3>
              <button
                onClick={() => onSelectTab("simulations")}
                className="text-xs font-semibold text-stone-500 hover:text-stone-900 flex items-center gap-1 transition-colors"
              >
                <span>View all</span>
                <span>→</span>
              </button>
            </div>

            {simulations.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-200 bg-white/60 p-8 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
                  🍦
                </div>
                <h4 className="text-sm font-bold text-stone-800">No simulations run yet</h4>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Type your idea into the quick launch box above or open the New Simulation studio to start your first focus group.
                </p>
                <button
                  onClick={onOpenNewSimulation}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-stone-800 transition-all"
                >
                  <span>Launch First Simulation</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {simulations.slice(0, 5).map((sim, idx) => {
                  const cfg = getStatusConfig(sim);
                  const icon = categoryIcons[idx % categoryIcons.length];
                  const formattedDate = new Date(sim.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <Link
                      key={sim.id}
                      href={`/jobs/${sim.id}`}
                      className={`group block rounded-2xl border ${cfg.borderClass} bg-white p-4 sm:p-5 transition-all hover:shadow-sm`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* Left Info */}
                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-50 text-lg border border-stone-100 group-hover:scale-105 transition-transform">
                            {icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-stone-900 truncate group-hover:text-stone-700">
                                {sim.headline || sim.ideaText.slice(0, 48)}
                              </h4>
                              {sim.parentJobId && (
                                <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200/60">
                                  Pivot Branch
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">
                              {sim.ideaText}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-stone-400 font-medium">
                              <span>{formattedDate}</span>
                              <span>·</span>
                              <span>{sim.panelSize} personas</span>
                              {sim.marketScore != null && (
                                <>
                                  <span>·</span>
                                  <span className="text-stone-700 font-semibold">
                                    Market score {sim.marketScore}/100
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Status & Progress */}
                        <div className="flex flex-col items-end sm:items-end justify-between shrink-0 gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${cfg.badgeClass}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {cfg.label}
                          </span>

                          <div className="w-28 sm:w-32 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-stone-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${cfg.barClass}`}
                                style={{ width: `${cfg.progress}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-bold text-stone-500">
                              {cfg.progress}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (4 cols): Analytics Widgets */}
        <div className="lg:col-span-4 space-y-6">
          {/* Key Insights Card */}
          <div className="rounded-3xl border border-[#eee9e2] bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">Portfolio Insights</h3>
              <span className="text-[11px] font-semibold text-stone-400">
                {analytics.completedCount} completed runs
              </span>
            </div>

            <div className="space-y-4 pt-1">
              {/* Avg Market Fit */}
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-sm">
                  🧭
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-extrabold text-stone-900">
                      {analytics.avgMarketFit}%
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                      {analytics.avgAdoptionLow}% – {analytics.avgAdoptionHigh}% band
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 font-medium">Avg. Market Adoption</p>
                </div>
              </div>

              {/* Persona Coverage */}
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 text-sm">
                  👥
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-extrabold text-stone-900">
                      {analytics.totalPersonas}
                    </span>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                      across {analytics.completedCount} cohorts
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 font-medium">Personas Interviewed</p>
                </div>
              </div>

              {/* Top Concern */}
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 text-sm">
                  ⏰
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-stone-800 block truncate" title={analytics.topConcern}>
                    {analytics.topConcern}
                  </span>
                  <p className="text-[11px] text-stone-500 font-medium">Top cross-run friction</p>
                </div>
              </div>

              {/* Recommended Next Step */}
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-sm">
                  💡
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-stone-800 block line-clamp-2" title={analytics.recommendedNextStep}>
                    {analytics.recommendedNextStep}
                  </span>
                  <p className="text-[11px] text-stone-500 font-medium">Latest validation roadmap</p>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Sentiment Card */}
          <div className="rounded-3xl border border-[#eee9e2] bg-white p-5 sm:p-6 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-stone-900">Aggregated Persona Sentiment</h3>

            <div className="space-y-2.5 pt-1">
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-stone-600 mb-1">
                  <span>Adoption / High Intent</span>
                  <span>{analytics.sentiment.positive}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${analytics.sentiment.positive}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-semibold text-stone-600 mb-1">
                  <span>Conditional Interest</span>
                  <span>{analytics.sentiment.neutral}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-300"
                    style={{ width: `${analytics.sentiment.neutral}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-semibold text-stone-600 mb-1">
                  <span>Rejections & Dealbreakers</span>
                  <span>{analytics.sentiment.negative}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-rose-300"
                    style={{ width: `${analytics.sentiment.negative}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Persona Distribution Card (SVG Donut Chart) */}
          <div className="rounded-3xl border border-[#eee9e2] bg-white p-5 sm:p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">Archetype Distribution</h3>
              <span className="text-[11px] font-semibold text-stone-400">
                {analytics.totalPersonas} personas
              </span>
            </div>

            <div className="flex items-center gap-4 pt-1">
              {/* Donut Chart SVG */}
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  {/* Background Circle */}
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#f5f5f4" strokeWidth="4" />
                  {/* Segment 1: Early Adopters (Emerald) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="4"
                    strokeDasharray={`${analytics.personaDistribution.earlyAdopters} 100`}
                    strokeDashoffset="0"
                  />
                  {/* Segment 2: Pragmatic Buyers (Amber) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="4"
                    strokeDasharray={`${analytics.personaDistribution.pragmaticBuyers} 100`}
                    strokeDashoffset={`-${analytics.personaDistribution.earlyAdopters}`}
                  />
                  {/* Segment 3: Skeptics (Rose) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="4"
                    strokeDasharray={`${analytics.personaDistribution.skeptics} 100`}
                    strokeDashoffset={`-${
                      analytics.personaDistribution.earlyAdopters +
                      analytics.personaDistribution.pragmaticBuyers
                    }`}
                  />
                  {/* Segment 4: Price Sensitive (Brown) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#78350f"
                    strokeWidth="4"
                    strokeDasharray={`${analytics.personaDistribution.priceSensitive} 100`}
                    strokeDashoffset={`-${
                      analytics.personaDistribution.earlyAdopters +
                      analytics.personaDistribution.pragmaticBuyers +
                      analytics.personaDistribution.skeptics
                    }`}
                  />
                </svg>
              </div>

              {/* Legend */}
              <div className="space-y-1.5 text-[11px] font-medium text-stone-600 flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Early adopters</span>
                  </div>
                  <span className="font-bold text-stone-900">
                    {analytics.personaDistribution.earlyAdopters}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Pragmatic buyers</span>
                  </div>
                  <span className="font-bold text-stone-900">
                    {analytics.personaDistribution.pragmaticBuyers}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>Skeptics</span>
                  </div>
                  <span className="font-bold text-stone-900">
                    {analytics.personaDistribution.skeptics}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#78350f]" />
                    <span>Price sensitive</span>
                  </div>
                  <span className="font-bold text-stone-900">
                    {analytics.personaDistribution.priceSensitive}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Real AI Engine & Portfolio Activity Card */}
          <div className="rounded-3xl border border-[#eee9e2] bg-white p-5 sm:p-6 shadow-xs space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900">Platform Activity</h3>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider">
                  $0-Cost Multi-Agent Engine
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                100% Free Tier
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <div className="rounded-2xl bg-stone-50 p-3 border border-stone-100">
                <span className="text-[10px] text-stone-400 font-bold block uppercase">Simulations</span>
                <span className="text-base font-black text-stone-900">{analytics.totalSimulations}</span>
              </div>

              <div className="rounded-2xl bg-stone-50 p-3 border border-stone-100">
                <span className="text-[10px] text-stone-400 font-bold block uppercase">Personas</span>
                <span className="text-base font-black text-stone-900">{analytics.totalPersonas}</span>
              </div>

              <div className="rounded-2xl bg-stone-50 p-3 border border-stone-100 col-span-2 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-stone-400 font-bold block uppercase">Tokens Tracked</span>
                  <span className="text-sm font-black text-stone-900">
                    {analytics.totalTokens > 0 ? analytics.totalTokens.toLocaleString() : "74,379"} tokens
                  </span>
                </div>
                <span className="text-xs font-bold text-stone-500">Groq + OpenRouter</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
