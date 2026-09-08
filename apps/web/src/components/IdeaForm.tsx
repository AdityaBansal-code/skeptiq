"use client";

import { useState, useActionState } from "react";
import {
  DEBATE_LEVELS,
  PANEL_SIZE_DEFAULT,
  PANEL_SIZE_MAX,
  PANEL_SIZE_MIN,
  SIMULATION_MODES,
  AUDIENCE_PRESETS,
  type DebateLevel,
  type AudiencePreset,
} from "@repo/shared";
import { createJobAction, type CreateJobState } from "@/app/actions";

const initialState: CreateJobState = { ok: false };

const PRESET_ICONS: Record<AudiencePreset, string> = {
  general_consumer: "🛒",
  b2b_saas_enterprise: "💼",
  gen_z_creator: "📱",
  smb_owners: "🏪",
  developer_tools: "💻",
  healthcare_bio: "🩺",
};

const SAMPLE_PITCHES = [
  {
    label: "Hostel Meal Sub",
    text: "A ₹150/day home-style meal subscription for Delhi college students — 3 meals, pause anytime on WhatsApp, cooked by verified home chefs.",
    preset: "gen_z_creator" as AudiencePreset,
  },
  {
    label: "DevTools PR Reviewer",
    text: "An autonomous CLI agent that reviews pull requests for security vulnerabilities and race conditions before merging. $20/seat/month for engineering teams.",
    preset: "developer_tools" as AudiencePreset,
  },
  {
    label: "B2B Vendor Auditor",
    text: "SOC-2 compliance automation for Series A B2B SaaS companies. Auto-collects evidence from AWS/GitHub to reduce audit prep time from 3 months to 3 days for $800/mo.",
    preset: "b2b_saas_enterprise" as AudiencePreset,
  },
];

export function IdeaForm() {
  const [state, formAction, pending] = useActionState(createJobAction, initialState);
  const [ideaText, setIdeaText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<AudiencePreset>("general_consumer");
  const [debateLevel, setDebateLevel] = useState<DebateLevel>("standard");
  const [panelSize, setPanelSize] = useState<number>(PANEL_SIZE_DEFAULT);
  const [mode, setMode] = useState("segmentation");
  const [seed, setSeed] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  function fillSample(sample: (typeof SAMPLE_PITCHES)[0]) {
    setIdeaText(sample.text);
    setSelectedPreset(sample.preset);
  }

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="audiencePreset" value={selectedPreset} />
      <input type="hidden" name="debateLevel" value={debateLevel} />
      <input type="hidden" name="panelSize" value={panelSize} />
      <input type="hidden" name="seed" value={seed} />
      <input type="hidden" name="webhookUrl" value={webhookUrl} />

      {/* Step 1: Idea Pitch */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <label htmlFor="idea-text" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">
              1
            </span>
            <span>Venture / Product Proposition</span>
          </label>
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] text-stone-500">
            <span>Examples:</span>
            {SAMPLE_PITCHES.map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => fillSample(sample)}
                className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-medium text-stone-700 hover:border-stone-400 hover:bg-white transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

          <textarea
          id="idea-text"
          name="ideaText"
          required
          minLength={20}
          rows={4}
          value={ideaText}
          onChange={(e) => setIdeaText(e.target.value)}
          placeholder="Describe the product, target audience, pricing model, and unique value proposition (e.g. A ₹150/day home-style meal subscription for students...)"
          className="w-full resize-y rounded-2xl border border-stone-200 bg-stone-50/50 p-4 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-900 focus:bg-white focus:ring-1 focus:ring-stone-900 transition-all shadow-2xs leading-relaxed"
        />
        <div className="flex items-center justify-between text-[11px] text-stone-400">
          <span>Include target price point & key features for the most accurate Van Westendorp pricing curves.</span>
          <span>{ideaText.length} chars</span>
        </div>
      </div>

      {/* Step 2: Target Audience Cohort */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <p id="audience-label" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">
              2
            </span>
            <span>Target Audience Cohort</span>
          </p>
          <span className="text-xs text-stone-500 font-medium">
            {AUDIENCE_PRESETS[selectedPreset]?.description}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {(Object.keys(AUDIENCE_PRESETS) as AudiencePreset[]).map((key) => {
            const preset = AUDIENCE_PRESETS[key];
            const isSelected = selectedPreset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedPreset(key)}
                aria-pressed={isSelected}
                aria-describedby="audience-label"
                className={`relative flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "border-stone-900 bg-stone-900 text-white shadow-xs ring-1 ring-stone-900"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{PRESET_ICONS[key] || "👥"}</span>
                    <span className={`text-xs font-bold truncate ${isSelected ? "text-white" : "text-stone-900"}`}>
                      {preset.label}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                </div>
                <p className={`mt-1.5 text-[11px] line-clamp-1 ${isSelected ? "text-stone-300" : "text-stone-500"}`}>
                  {preset.sampleRoles.slice(0, 2).join(", ")}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 3: Simulation Rigor & Panel Size */}
      <div className="space-y-2.5 pt-1">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">
            3
          </span>
          <span>Simulation Rigor & Panel Size</span>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Panel Size */}
          <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">Panel Size</span>
              <span className="text-xs font-bold text-stone-900 bg-white px-2 py-0.5 rounded-lg border border-stone-200">
                {panelSize} Personas
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {[3, 6, 12, 20].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPanelSize(size)}
                  aria-pressed={panelSize === size}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                    panelSize === size
                      ? "border-stone-900 bg-stone-900 text-white shadow-2xs"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {size}
                </button>
              ))}
              <label htmlFor="panel-size" className="sr-only">
                Custom panel size
              </label>
              <input
                id="panel-size"
                type="number"
                min={PANEL_SIZE_MIN}
                max={PANEL_SIZE_MAX}
                value={panelSize}
                onChange={(e) => setPanelSize(Math.max(PANEL_SIZE_MIN, Math.min(PANEL_SIZE_MAX, Number(e.target.value) || 6)))}
                className="w-14 rounded-xl border border-stone-200 bg-white py-1.5 text-xs font-semibold text-center text-stone-900 outline-none"
              />
            </div>
          </div>

          {/* Deliberation Rigor */}
          <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">Deliberation Depth</span>
              <span className="text-xs font-bold text-stone-900 capitalize bg-white px-2 py-0.5 rounded-lg border border-stone-200">
                {debateLevel} (~{DEBATE_LEVELS[debateLevel].rounds} turns)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(DEBATE_LEVELS) as DebateLevel[]).map((level) => {
                const config = DEBATE_LEVELS[level];
                const isSelected = debateLevel === level;
                return (
                  <button
                    key={level}
                  type="button"
                  onClick={() => setDebateLevel(level)}
                  aria-pressed={isSelected}
                    className={`py-1.5 px-1 text-center rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-stone-900 bg-stone-900 text-white shadow-2xs"
                        : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    <p className="text-xs font-bold capitalize">{level}</p>
                    <p className={`text-[10px] ${isSelected ? "text-stone-300" : "text-stone-500"}`}>
                      {config.rounds} turns
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Step 4: Advanced Drawer */}
      <div className="border-t border-stone-200/80 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-options"
          className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="text-[10px]">{showAdvanced ? "▼" : "▶"}</span>
          <span>Advanced Engine Tuning (Deterministic Seed, Webhooks & Analysis Mode)</span>
        </button>

        {showAdvanced && (
          <div id="advanced-options" className="mt-3 rounded-2xl border border-stone-200 bg-stone-50/70 p-4 space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="analysis-mode" className="block font-semibold text-stone-700 mb-1">
                  Analysis Mode
                </label>
                <select
                  id="analysis-mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white p-2.5 text-xs text-stone-900 capitalize shadow-2xs outline-none focus:border-stone-900"
                >
                  {SIMULATION_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m} Mode
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="deterministic-seed" className="block font-semibold text-stone-700 mb-1">
                  Deterministic Seed (Optional)
                </label>
                <input
                  id="deterministic-seed"
                  type="number"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  placeholder="e.g. 42 (reproducible runs)"
                  className="w-full rounded-xl border border-stone-200 bg-white p-2.5 text-xs text-stone-900 placeholder:text-stone-400 shadow-2xs outline-none focus:border-stone-900"
                />
              </div>
            </div>

            <div>
              <label htmlFor="webhook-url" className="block font-semibold text-stone-700 mb-1">
                Webhook Notification URL (Optional)
              </label>
              <input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                placeholder="https://discord.com/api/webhooks/... or https://hooks.zapier.com/..."
                className="w-full rounded-xl border border-stone-200 bg-white p-2.5 text-xs text-stone-900 placeholder:text-stone-400 shadow-2xs outline-none focus:border-stone-900"
              />
              <p className="mt-1 text-[11px] text-stone-500">
                Dispatches an HMAC SHA-256 signed JSON payload upon simulation completion.
              </p>
            </div>
          </div>
        )}
      </div>

      {state.error ? (
        <div role="alert" className="rounded-2xl bg-rose-50 p-3.5 text-xs text-rose-700 border border-rose-200 font-medium">
          {state.error}
        </div>
      ) : null}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending || !ideaText.trim()}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-stone-900 px-8 py-3.5 text-xs sm:text-sm font-bold text-white shadow-xs transition-all hover:bg-stone-800 disabled:opacity-50 cursor-pointer active:scale-95"
        >
          {pending ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              <span>Initializing Multi-Agent Panel…</span>
            </>
          ) : (
            <>
              <span>Launch Synthetic Focus Group</span>
              <span className="text-base">&rarr;</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
