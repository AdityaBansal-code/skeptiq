import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobLiveView, type JobRow } from "@/components/JobLiveView";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("simulation_jobs")
    .select("id, status, mode, panel_size, rounds, debate_level, audience_preset, seed, input_tokens, output_tokens, error, created_at, share_token, parent_job_id, branch_label, ideas(raw_text)")
    .eq("id", id)
    .single<JobRow & { ideas: { raw_text: string } | null }>();

  if (!job) notFound();

  const ideaText = job.ideas?.raw_text || "";

  return (
    <AppShell userEmail={user.email ?? "Account"}>
      <JobLiveView initialJob={job} ideaText={ideaText} />
    </AppShell>
  );
}
