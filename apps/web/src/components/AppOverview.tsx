"use client";

import { useRouter } from "next/navigation";
import { DashboardView } from "@/components/DashboardView";
import type { DashboardAnalytics, SimulationJobSummary } from "@/lib/db";

interface AppOverviewProps {
  simulations: SimulationJobSummary[];
  analytics: DashboardAnalytics;
}

export function AppOverview({ simulations, analytics }: AppOverviewProps) {
  const router = useRouter();

  return (
    <DashboardView
      simulations={simulations}
      analytics={analytics}
      onOpenNewSimulation={() => router.push("/app/new")}
      onSelectTab={(tab) => {
        if (tab === "simulations") router.push("/app/archive");
      }}
    />
  );
}
