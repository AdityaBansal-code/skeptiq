"use client";

import { useActionState, useState } from "react";
import { branchJobAction, type CreateJobState } from "@/app/actions";
import { DEBATE_LEVELS, type DebateLevel } from "@repo/shared";

interface BranchModalProps {
  parentJobId: string;
  originalIdeaText: string;
}

const initialState: CreateJobState = { ok: true };

export function BranchModal({ parentJobId, originalIdeaText }: BranchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ideaText, setIdeaText] = useState(originalIdeaText);
  const [branchLabel, setBranchLabel] = useState("");
  const [debateLevel, setDebateLevel] = useState<DebateLevel>("standard");

  const [state, formAction, pending] = useActionState(branchJobAction, initialState);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 shadow-2xs hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer"
      >
        <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Test a Pivot (Branch)
      </button>
    );
  }

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="branch-dialog-title" className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 id="branch-dialog-title" className="text-base font-bold text-zinc-900">Branch and test a pivot</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Re-test a modified pitch against the <strong>exact same persona cohort</strong> to measure sentiment delta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close branch dialog"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
          >
            &times;
          </button>
        </div>

        {state?.error && (
          <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200 font-medium">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4 text-xs">
          <input type="hidden" name="parentJobId" value={parentJobId} />

          <div>
            <label htmlFor="branch-label" className="block font-bold uppercase tracking-wider text-zinc-700 text-[11px] mb-1.5">
              Pivot Hypothesis / Branch Label
            </label>
            <input
              id="branch-label"
              type="text"
              name="branchLabel"
              required
              value={branchLabel}
              onChange={(e) => setBranchLabel(e.target.value)}
              placeholder="e.g. Freemium pricing + Slack alerts instead of email"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white shadow-2xs transition-all"
            />
          </div>

          <div>
            <label htmlFor="branch-idea" className="block font-bold uppercase tracking-wider text-zinc-700 text-[11px] mb-1.5">
              Modified Idea Pitch / Proposition
            </label>
            <textarea
              id="branch-idea"
              name="ideaText"
              required
              rows={4}
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white leading-relaxed font-sans shadow-2xs transition-all"
            />
          </div>

          <div>
            <span className="block font-bold uppercase tracking-wider text-zinc-700 text-[11px] mb-1.5">
              Debate Rigor Level
            </span>
            <input type="hidden" name="debateLevel" value={debateLevel} />
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DEBATE_LEVELS) as DebateLevel[]).map((level) => {
                const config = DEBATE_LEVELS[level];
                const active = debateLevel === level;
                return (
                  <button
                    type="button"
                    key={level}
                    onClick={() => setDebateLevel(level)}
                    aria-pressed={active}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-xs"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    <span className="block font-bold capitalize">{config.label}</span>
                    <span className={`block text-[10px] mt-0.5 ${active ? "text-zinc-300" : "text-zinc-500"}`}>
                      {config.rounds} turns
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !ideaText.trim() || !branchLabel.trim()}
              className="rounded-xl bg-zinc-900 px-5 py-2 font-bold text-white hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
            >
              {pending ? "Creating Branch…" : "Launch Pivot Simulation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
