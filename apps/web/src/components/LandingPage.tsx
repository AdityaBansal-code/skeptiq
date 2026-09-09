import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { brandConfig } from "@/lib/brand";

const workflow = [
  {
    title: "Describe the idea",
    detail: "Start with the product, the audience, and the question you need answered.",
    color: "bg-butter",
  },
  {
    title: "Let the panel deliberate",
    detail: "Simulated personas react independently, surface objections, and challenge each other.",
    color: "bg-lilac",
  },
  {
    title: "Choose the next test",
    detail: "Review segments, conditions, and directional signals before deciding what to learn next.",
    color: "bg-mint",
  },
];

export function LandingPage({ user }: { user?: User | null }) {
  return (
    <main className="min-h-screen overflow-hidden bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md text-left"
          aria-label={`${brandConfig.name} home`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-xl">
            {brandConfig.mark}
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold tracking-tight">{brandConfig.name}</span>
            <span className="hidden max-w-56 truncate text-xs text-muted-ink sm:block">
              {brandConfig.descriptor}
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Public navigation">
          {user ? (
            <>
              <span className="hidden px-2 py-2 text-xs font-semibold text-muted-ink sm:inline max-w-48 truncate" title={user.email}>
                {user.email}
              </span>
              <Link
                className="rounded-lg bg-coral px-3.5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-coral/85 shadow-2xs"
                href="/app"
              >
                Go to Dashboard →
              </Link>
            </>
          ) : (
            <>
              <Link className="px-2 py-2 text-sm font-medium text-muted-ink hover:text-ink" href="/login">
                Sign in
              </Link>
              <Link
                className="rounded-lg bg-coral px-3.5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-coral/85"
                href="/login"
              >
                Start with an idea
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-10 lg:pb-28">
        <div className="max-w-2xl">
          <p className="mb-5 text-sm font-medium text-muted-ink">A calmer first pass for consequential ideas.</p>
          <h1 className="max-w-xl text-5xl font-semibold tracking-[-0.055em] text-ink sm:text-6xl lg:text-7xl">
            Pressure-test the idea before you build the story around it.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-ink">
            {brandConfig.name} brings a simulated audience panel to an idea, then turns their reactions,
            objections, and decision conditions into a clearer next question.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex justify-center rounded-lg bg-coral px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-coral/85"
              href={user ? "/app/new" : "/login"}
            >
              {user ? "Start a simulation →" : "Start a simulation"}
            </Link>
            <a className="px-2 py-2 text-sm font-medium text-muted-ink hover:text-ink" href="#how-it-works">
              See how it works
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -right-10 -top-12 size-40 rounded-full bg-butter/70 blur-3xl" aria-hidden="true" />
          <div className="relative border border-line-strong bg-surface p-4 shadow-[8px_8px_0_var(--line)] sm:p-5">
            <div className="flex items-center justify-between border-b border-line pb-4 text-sm">
              <span className="font-semibold">Idea review</span>
              <span className="rounded-full bg-lilac px-2.5 py-1 text-xs font-medium">In deliberation</span>
            </div>
            <div className="py-5">
              <p className="text-xs font-medium text-muted-ink">The idea</p>
              <p className="mt-2 text-lg font-medium leading-7">A repair service that picks up household items from busy renters.</p>
            </div>
            <div className="grid gap-3 border-t border-line py-4 sm:grid-cols-2">
              <div className="border-l-2 border-coral bg-paper p-3">
                <p className="text-xs font-medium text-muted-ink">Audience signal</p>
                <p className="mt-1 text-sm leading-5">Convenience is compelling when collection feels dependable.</p>
              </div>
              <div className="border-l-2 border-mint bg-paper p-3">
                <p className="text-xs font-medium text-muted-ink">Decision condition</p>
                <p className="mt-1 text-sm leading-5">Test pickup windows before expanding the service area.</p>
              </div>
            </div>
            <p className="border-t border-line pt-4 text-xs leading-5 text-muted-ink">
              Example output shown for illustration; results are directional, not customer evidence.
            </p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">From a first thought to a more useful next move.</h2>
            <p className="mt-4 text-base leading-7 text-muted-ink">
              Use the panel to make assumptions visible—not to replace the conversations that follow.
            </p>
          </div>
          <ol className="mt-10 grid gap-px border border-line bg-line md:grid-cols-3">
            {workflow.map((step, index) => (
              <li key={step.title} className="bg-surface p-6 sm:p-7">
                <span className={`inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold ${step.color}`}>
                  {index + 1}
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-6 text-muted-ink">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="grid gap-8 border border-line-strong bg-paper p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold">A useful caveat</p>
            <p className="mt-3 text-lg leading-8 text-muted-ink">
              This is synthetic research: it can help frame a hypothesis and find questions worth asking, but it cannot substitute for interviews, observation, or real buying behavior.
            </p>
          </div>
          <Link
            className="inline-flex justify-center rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-paper transition-colors hover:bg-ink/85"
            href={user ? "/app/new" : "/login"}
          >
            {user ? "Launch simulation →" : "Bring an idea"}
          </Link>
        </div>
      </section>
    </main>
  );
}
