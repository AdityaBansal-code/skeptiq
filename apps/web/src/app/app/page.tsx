import { getUserDashboardData } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

const ACTIVE_STATUSES = new Set([
  "queued",
  "generating_personas",
  "independent_phase",
  "clustering",
  "crosstalk_phase",
  "synthesizing",
]);

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value)
  );
}

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { simulations, reports } = await getUserDashboardData(user.id);
  const activeSimulations = simulations.filter((simulation) => ACTIVE_STATUSES.has(simulation.status)).slice(0, 3);
  const recentSimulations = simulations.filter((simulation) => !ACTIVE_STATUSES.has(simulation.status)).slice(0, 4);
  const recentReports = reports.slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl space-y-9 pb-12">
      <header className="flex flex-col gap-4 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Workspace</h1>
          <p className="mt-2 text-sm leading-6 text-muted-ink">
            Follow live simulations and revisit the evidence behind completed reports.
          </p>
        </div>
        <Link
          href="/app/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-paper shadow-sm transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          New simulation
        </Link>
      </header>

      <section aria-labelledby="active-simulations-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="active-simulations-heading" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Active simulations
          </h2>
          {simulations.length > 0 ? (
            <Link href="/app/archive" className="text-sm font-medium text-muted-ink underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              View archive
            </Link>
          ) : null}
        </div>

        {activeSimulations.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {activeSimulations.map((simulation) => (
              <Link
                key={simulation.id}
                href={`/jobs/${simulation.id}`}
                className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <p className="text-xs font-medium capitalize text-coral">{statusLabel(simulation.status)}</p>
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-ink group-hover:underline">
                  {simulation.headline || simulation.ideaText}
                </h3>
                <p className="mt-4 text-xs text-muted-ink">
                  {simulation.panelSize} personas · {simulation.rounds} rounds
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-muted-ink">
            No simulations are currently running.
          </div>
        )}
      </section>

      <div className="grid gap-9 lg:grid-cols-2">
        <section aria-labelledby="recent-simulations-heading" className="space-y-4">
          <h2 id="recent-simulations-heading" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Recent runs
          </h2>
          {recentSimulations.length > 0 ? (
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {recentSimulations.map((simulation) => (
                <Link
                  key={simulation.id}
                  href={`/jobs/${simulation.id}`}
                  className="group block px-5 py-4 first:rounded-t-2xl last:rounded-b-2xl hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="line-clamp-1 text-sm font-semibold text-ink group-hover:underline">
                      {simulation.headline || simulation.ideaText}
                    </h3>
                    <span className="shrink-0 text-xs capitalize text-muted-ink">{statusLabel(simulation.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-ink">{formatDate(simulation.createdAt)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-muted-ink">
              Completed and failed runs will appear here.
            </p>
          )}
        </section>

        <section aria-labelledby="recent-reports-heading" className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-reports-heading" className="text-lg font-semibold tracking-[-0.02em] text-ink">
              Recent reports
            </h2>
            {reports.length > 0 ? (
              <Link href="/app/reports" className="text-sm font-medium text-muted-ink underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                View reports
              </Link>
            ) : null}
          </div>
          {recentReports.length > 0 ? (
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {recentReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/jobs/${report.jobId}`}
                  className="group block px-5 py-4 first:rounded-t-2xl last:rounded-b-2xl hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                >
                  <h3 className="line-clamp-1 text-sm font-semibold text-ink group-hover:underline">{report.headline}</h3>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-ink">{report.ideaText}</p>
                  <p className="mt-2 text-xs text-muted-ink">Generated {formatDate(report.createdAt)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-muted-ink">
              Reports are available when a simulation finishes.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
