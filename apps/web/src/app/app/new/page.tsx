import { IdeaForm } from "@/components/IdeaForm";

export default function NewSimulationPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-12">
      <div className="border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
          New simulation
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-ink">
          Define an idea, choose the audience, and start a live simulation.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7">
        <IdeaForm />
      </div>
    </div>
  );
}
