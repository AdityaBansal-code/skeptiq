"use client";

import { useActionState } from "react";
import { PANEL_SIZE_DEFAULT, PANEL_SIZE_MAX, PANEL_SIZE_MIN, SIMULATION_MODES } from "@repo/shared";
import { createJobAction, type CreateJobState } from "@/app/actions";

const initialState: CreateJobState = { ok: false };

export function IdeaForm() {
  const [state, formAction, pending] = useActionState(createJobAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <textarea
        name="ideaText"
        required
        minLength={20}
        rows={5}
        placeholder="e.g. A ₹150/day home-style meal subscription for Delhi hostel students — 3 meals, pause anytime."
        className="w-full resize-y rounded-md border border-neutral-300 bg-white p-3 text-sm outline-none focus:border-neutral-500"
      />

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Panel size
          <input
            type="number"
            name="panelSize"
            min={PANEL_SIZE_MIN}
            max={PANEL_SIZE_MAX}
            defaultValue={PANEL_SIZE_DEFAULT}
            className="w-24 rounded-md border border-neutral-300 bg-white p-2 text-sm text-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Mode
          <select
            name="mode"
            defaultValue="segmentation"
            className="rounded-md border border-neutral-300 bg-white p-2 text-sm text-neutral-900 capitalize"
          >
            {SIMULATION_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Run the panel"}
      </button>
    </form>
  );
}
