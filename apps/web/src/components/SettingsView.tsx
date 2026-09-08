import { AUDIENCE_PRESETS, DEBATE_LEVELS, SIMULATION_MODES, PANEL_SIZE_DEFAULT } from "@repo/shared";
import { SignOutButton } from "@/components/SignOutButton";

interface SettingsViewProps {
  userEmail: string;
}

function ReadOnlyValue({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <dt className="text-xs font-medium text-muted-ink">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-ink">{value}</dd>
      {description ? <p className="mt-1 text-xs leading-5 text-muted-ink">{description}</p> : null}
    </div>
  );
}

export function SettingsView({ userEmail }: SettingsViewProps) {
  const defaultAudience = AUDIENCE_PRESETS.general_consumer.label;
  const defaultDebate = DEBATE_LEVELS.standard;
  const defaultMode = SIMULATION_MODES.includes("segmentation") ? "Segmentation" : SIMULATION_MODES[0];

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <header className="border-b border-line pb-7">
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-ink">Review your account and the defaults used when a simulation starts.</p>
      </header>

      <section aria-labelledby="account-heading" className="space-y-4">
        <div>
          <h2 id="account-heading" className="text-lg font-semibold tracking-[-0.02em] text-ink">Account identity</h2>
          <p className="mt-1 text-sm text-muted-ink">Your identity comes from the authenticated Supabase session.</p>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-ink">{userEmail}</p>
            <p className="mt-1 text-xs text-muted-ink">Signed-in account</p>
          </div>
          <SignOutButton />
        </div>
      </section>

      <section aria-labelledby="simulation-heading" className="space-y-4">
        <div>
          <h2 id="simulation-heading" className="text-lg font-semibold tracking-[-0.02em] text-ink">Simulation defaults</h2>
          <p className="mt-1 text-sm text-muted-ink">These are the supported defaults used by the New simulation form. Change them for an individual run there.</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <ReadOnlyValue label="Mode" value={defaultMode} />
          <ReadOnlyValue label="Panel size" value={`${PANEL_SIZE_DEFAULT} personas`} />
          <ReadOnlyValue label="Debate level" value={defaultDebate.label} description={`${defaultDebate.rounds} deliberation rounds`} />
          <ReadOnlyValue label="Audience" value={defaultAudience} />
          <ReadOnlyValue label="Seed" value="Not set" description="Runs use a generated result unless you provide a seed." />
        </dl>
      </section>

      <section aria-labelledby="notifications-heading" className="space-y-4">
        <div>
          <h2 id="notifications-heading" className="text-lg font-semibold tracking-[-0.02em] text-ink">Notifications</h2>
          <p className="mt-1 text-sm text-muted-ink">Webhook delivery is configured per simulation and is not saved as an account setting.</p>
        </div>
        <div className="rounded-2xl border border-dashed border-line bg-surface p-5 text-sm text-muted-ink">
          Add an HTTPS webhook URL in the New simulation form when a run should notify an external endpoint. No saved notification destination is configured for this account.
        </div>
      </section>
    </div>
  );
}
