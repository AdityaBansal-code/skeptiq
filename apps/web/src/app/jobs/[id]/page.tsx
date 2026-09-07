import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobLiveView, type JobRow } from "@/components/JobLiveView";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("simulation_jobs")
    .select("id, status, mode, panel_size, error, created_at")
    .eq("id", id)
    .single<JobRow>();

  if (!job) notFound();

  return <JobLiveView initialJob={job} />;
}
