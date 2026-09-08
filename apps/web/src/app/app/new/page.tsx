import { IdeaForm } from "@/components/IdeaForm";

export default function NewSimulationPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
          New simulation
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Define the idea and audience you want to examine.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7">
        <IdeaForm />
      </div>
    </div>
  );
}
