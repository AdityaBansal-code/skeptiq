"use client";

import { useRouter } from "next/navigation";
import { PersonasDirectoryView } from "@/components/PersonasDirectoryView";
import { ReportsView } from "@/components/ReportsView";
import { SimulationsView } from "@/components/SimulationsView";
import type { PersonaItem, ReportItem, SimulationJobSummary } from "@/lib/db";

export function ArchiveWorkspaceView({ simulations }: { simulations: SimulationJobSummary[] }) {
  const router = useRouter();
  return <SimulationsView simulations={simulations} onOpenNewSimulation={() => router.push("/app/new")} />;
}

export function PersonasWorkspaceView({ personas }: { personas: PersonaItem[] }) {
  const router = useRouter();
  return <PersonasDirectoryView personas={personas} onOpenNewSimulation={() => router.push("/app/new")} />;
}

export function ReportsWorkspaceView({ reports }: { reports: ReportItem[] }) {
  const router = useRouter();
  return <ReportsView reports={reports} onOpenNewSimulation={() => router.push("/app/new")} />;
}
