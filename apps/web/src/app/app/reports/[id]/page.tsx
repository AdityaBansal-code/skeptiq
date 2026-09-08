import { notFound, redirect } from "next/navigation";
import type { JobStatus } from "@repo/shared";
import { JobLiveView, type JobRow } from "@/components/JobLiveView";
import { getUserDashboardData } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { reports, simulations } = await getUserDashboardData(user.id);
  const report = reports.find((item) => item.jobId === id);
  const simulation = simulations.find((item) => item.id === id);
  if (!report || !simulation || simulation.status !== "completed") notFound();

  const initialJob: JobRow = {
    id: simulation.id,
    status: simulation.status as JobStatus,
    mode: simulation.mode,
    panel_size: simulation.panelSize,
    rounds: simulation.rounds,
    debate_level: simulation.debateLevel,
    audience_preset: simulation.audiencePreset,
    input_tokens: simulation.inputTokens,
    output_tokens: simulation.outputTokens,
    error: null,
    created_at: simulation.createdAt,
    share_token: simulation.shareToken,
    parent_job_id: simulation.parentJobId,
    branch_label: simulation.branchLabel,
  };

  return <JobLiveView initialJob={initialJob} ideaText={simulation.ideaText} />;
}
