"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { brandConfig } from "@/lib/brand";

function LoginForm() {
  const urlError = useSearchParams().get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic_link">("password");
  const [authAction, setAuthAction] = useState<"signIn" | "signUp">("signIn");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccessMsg(null);
    const supabase = createClient();

    if (mode === "password") {
      if (authAction === "signUp") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        });
        setPending(false);
        if (error) {
          setError(error.message);
        } else if (data.session) {
          window.location.href = "/app";
        } else {
          setSuccessMsg("Account created! If email confirmation is enabled, please check your inbox.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        setPending(false);
        if (error) {
          setError(error.message);
        } else {
          window.location.href = "/app";
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      setPending(false);
      if (error) {
        setError(error.message);
      } else {
        setSent(true);
      }
    }
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-ink">
            {mode === "password" && authAction === "signUp" ? "Create Account" : "Sign In"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-ink">Use your account to continue.</p>
        </div>
        <div className="flex rounded-lg bg-paper p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md px-3 py-1 transition-colors ${
              mode === "password"
                ? "bg-surface text-ink shadow-sm"
                : "text-muted-ink hover:text-ink"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("magic_link");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md px-3 py-1 transition-colors ${
              mode === "magic_link"
                ? "bg-surface text-ink shadow-sm"
                : "text-muted-ink hover:text-ink"
            }`}
          >
            Magic Link
          </button>
        </div>
      </div>

      {urlError && (
        <p className="mt-4 border border-coral bg-paper p-3 text-xs text-ink">
          {urlError}
        </p>
      )}

      {successMsg ? (
        <div className="mt-6 border-l-2 border-mint bg-paper p-4 text-xs text-ink">
          <p className="font-bold">Account created</p>
          <p className="mt-1">{successMsg}</p>
        </div>
      ) : sent ? (
        <div className="mt-6 border-l-2 border-butter bg-paper p-4 text-xs text-ink">
          <p className="font-bold">Check your email</p>
          <p className="mt-1">We sent a magic sign-in link to {email}.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@example.com"
              className="w-full border border-line-strong bg-surface p-3 text-xs text-ink transition-colors placeholder:text-muted-ink focus:border-ink sm:text-sm"
            />
          </div>

          {mode === "password" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-line-strong bg-surface p-3 text-xs text-ink transition-colors placeholder:text-muted-ink focus:border-ink sm:text-sm"
              />
            </div>
          )}

          {error && (
            <div className="border border-coral bg-paper p-3 text-xs font-medium text-ink">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-coral px-4 py-3 text-xs font-semibold text-ink transition-colors hover:bg-coral/85 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {pending
              ? "Submitting…"
              : mode === "password"
              ? authAction === "signUp"
                ? "Create Account & Get Started"
                : "Sign In to Ice-cream"
              : "Send Magic Link"}
          </button>

          {mode === "password" && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthAction(authAction === "signIn" ? "signUp" : "signIn");
                  setError(null);
                }}
                className="text-xs text-muted-ink underline hover:text-ink"
              >
                {authAction === "signIn"
                  ? "Don't have an account? Create one"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          )}
        </form>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-12 text-ink">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex size-12 items-center justify-center rounded-xl border border-line bg-surface text-2xl">
            {brandConfig.mark}
          </div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-ink">{brandConfig.name}</h2>
          <p className="text-xs text-muted-ink">{brandConfig.descriptor}</p>
        </div>

        <div className="border border-line-strong bg-surface p-6 shadow-[6px_6px_0_var(--line)] sm:p-8">
          <Suspense fallback={<h1 className="text-lg font-semibold">Sign in</h1>}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-[11px] text-muted-ink">
          Synthetic research can frame a question; it does not replace customer evidence.
        </p>
      </div>
    </main>
  );
}
