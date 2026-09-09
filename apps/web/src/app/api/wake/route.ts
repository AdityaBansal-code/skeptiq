import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerUrl =
    process.env.WORKER_URL ||
    process.env.WORKER_HEALTH_URL ||
    process.env.NEXT_PUBLIC_WORKER_URL;

  if (!workerUrl) {
    return NextResponse.json(
      {
        ok: true,
        message: "Worker engine is actively polling the simulation queue.",
      },
      { status: 200 }
    );
  }

  const cleanUrl = workerUrl.endsWith("/health")
    ? workerUrl
    : `${workerUrl.replace(/\/+$/, "")}/health`;

  try {
    const started = Date.now();
    const res = await fetch(cleanUrl, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - started;
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        ok: true,
        message: "Worker engine is awake and healthy!",
        latencyMs,
        workerData: data,
      });
    }

    return NextResponse.json({
      ok: false,
      message: `Worker responded with status ${res.status}`,
      latencyMs,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      message: `Worker wake-up ping sent (container is booting up, please wait ~20-30s).`,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
