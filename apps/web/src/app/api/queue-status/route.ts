import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch current job
    const jobRes = await pool.query<{
      id: string;
      status: string;
      panel_size: number;
      rounds: number;
      debate_level: string;
      created_at: string;
      started_at: string | null;
      heartbeat_at: string | null;
    }>(
      `SELECT id, status, panel_size, coalesce(rounds, 12) as rounds, debate_level, created_at, started_at, heartbeat_at
       FROM simulation_jobs
       WHERE id = $1 AND (user_id = $2 OR share_token IS NOT NULL)`,
      [jobId, user.id]
    );

    const job = jobRes.rows[0];
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // 2. Count jobs ahead in the queue
    let queuePosition = 1;
    let jobsAhead = 0;
    if (job.status === "queued") {
      const aheadRes = await pool.query<{ count: string }>(
        `SELECT count(*) FROM simulation_jobs
         WHERE status = 'queued' AND created_at < $1`,
        [job.created_at]
      );
      jobsAhead = parseInt(aheadRes.rows[0]?.count || "0", 10);
      queuePosition = jobsAhead + 1;
    }

    // 3. Count currently active running jobs across the system
    const activeRes = await pool.query<{ count: string }>(
      `SELECT count(*) FROM simulation_jobs
       WHERE status NOT IN ('queued', 'completed', 'failed')`
    );
    const activeRunningCount = parseInt(activeRes.rows[0]?.count || "0", 10);

    // 4. Calculate estimated duration
    // Baseline: Recon (~8s) + Persona Gen (~10s per 10 personas) + Reactions (~2s per persona) + Clustering (~5s) + Crosstalk (~2.5s per round) + Synthesis (~15s)
    const panelSize = job.panel_size || 6;
    const rounds = job.rounds || 12;
    const estimatedSecondsTotal = Math.max(
      35,
      Math.round(8 + (panelSize * 1.0) + (panelSize * 2.2) + 5 + (rounds * 2.2) + 15)
    );

    const createdAtMs = new Date(job.created_at).getTime();
    const nowMs = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));

    let estimatedSecondsRemaining = Math.max(0, estimatedSecondsTotal - elapsedSeconds);
    if (job.status === "completed") {
      estimatedSecondsRemaining = 0;
    } else if (job.status === "queued") {
      // If queued with jobs ahead, add estimated wait time
      estimatedSecondsRemaining = estimatedSecondsTotal + (jobsAhead * estimatedSecondsTotal);
    }

    // 5. Worker liveness indicator
    const workerUrl =
      process.env.WORKER_URL ||
      process.env.WORKER_HEALTH_URL ||
      process.env.NEXT_PUBLIC_WORKER_URL;

    // Check if worker heartbeat in DB is fresh (within 90s)
    const latestHeartbeatRes = await pool.query<{ heartbeat_at: string | null }>(
      `SELECT max(heartbeat_at) as heartbeat_at FROM simulation_jobs`
    );
    const latestHb = latestHeartbeatRes.rows[0]?.heartbeat_at;
    const isDbWorkerActive = latestHb
      ? nowMs - new Date(latestHb).getTime() < 90_000
      : false;

    // Trigger non-blocking wake-up if worker is asleep and job is queued or in-flight with stale worker
    const isJobInFlight = job.status !== "completed" && job.status !== "failed";
    if ((job.status === "queued" || (!isDbWorkerActive && isJobInFlight)) && workerUrl) {
      const cleanUrl = workerUrl.endsWith("/health")
        ? workerUrl
        : `${workerUrl.replace(/\/+$/, "")}/health`;
      void fetch(cleanUrl, { signal: AbortSignal.timeout(2500) }).catch(() => {});
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      queuePosition,
      jobsAhead,
      activeRunningCount,
      estimatedSecondsTotal,
      estimatedSecondsRemaining,
      elapsedSeconds,
      panelSize,
      rounds,
      workerStatus: isDbWorkerActive ? "active" : "standby",
      hasWorkerUrlConfigured: Boolean(workerUrl),
    });
  } catch (err) {
    console.error("GET /api/queue-status error:", err);
    return NextResponse.json({ error: "Failed to fetch queue status" }, { status: 500 });
  }
}
