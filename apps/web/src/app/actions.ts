"use server";

import { redirect } from "next/navigation";
import { createJobInputSchema } from "@repo/shared";
import { createClient } from "@/lib/supabase/server";

export interface CreateJobState {
  ok: boolean;
  error?: string;
}

/**
 * Server action behind the homepage form: validate → insert `ideas` row →
 * insert `simulation_jobs` row (status defaults to 'queued') → redirect to the
 * live job page. Both inserts run as the signed-in user; RLS enforces ownership.
 */
export async function createJobAction(
  _prev: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  const parsed = createJobInputSchema.safeParse({
    ideaText: formData.get("ideaText"),
    config: {
      mode: formData.get("mode"),
      panelSize: Number(formData.get("panelSize")),
      segmentCount: null,
    },
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: idea, error: ideaErr } = await supabase
    .from("ideas")
    .insert({ user_id: user.id, raw_text: parsed.data.ideaText })
    .select("id")
    .single();
  if (ideaErr || !idea) {
    return { ok: false, error: ideaErr?.message ?? "Could not save the idea." };
  }

  const { data: job, error: jobErr } = await supabase
    .from("simulation_jobs")
    .insert({
      idea_id: idea.id,
      user_id: user.id,
      mode: parsed.data.config.mode,
      panel_size: parsed.data.config.panelSize,
      segment_count: parsed.data.config.segmentCount,
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    return { ok: false, error: jobErr?.message ?? "Could not queue the run." };
  }

  redirect(`/jobs/${job.id}`);
}
