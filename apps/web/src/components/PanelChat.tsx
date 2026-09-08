"use client";

import { useState, useEffect, type FormEvent } from "react";

export interface ChatPersona {
  id: string;
  name: string;
  occupation?: string;
  profile_json?: {
    caresAbout?: string[];
    wouldSayNoIf?: string[];
    switchingFriction?: string;
    cognitiveBias?: string;
    currentAlternative?: string;
  };
}

interface Message {
  id: string;
  persona_id: string | null;
  persona_name?: string;
  persona_occupation?: string;
  question: string;
  answer: string;
  created_at: string;
}

interface PanelChatProps {
  jobId: string;
  personas: ChatPersona[];
}

export function PanelChat({ jobId, personas }: PanelChatProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/chat?jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            setMessages(data.messages);
          }
        }
      } catch (err) {
        console.error("Failed to load cross-examine history", err);
      } finally {
        setInitialLoading(false);
      }
    }
    void loadHistory();
  }, [jobId]);

  async function handleAsk(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          personaId: selectedPersonaId || undefined,
          question: question.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      const newMsg = await res.json();
      setMessages((prev) => [...prev, newMsg]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const selectedPersona = personas.find((p) => p.id === selectedPersonaId);

  // Dynamically compute intelligent suggestion chips
  const dynamicSuggestions = (() => {
    if (selectedPersona?.profile_json) {
      const prof = selectedPersona.profile_json;
      const suggestions: string[] = [];
      if (prof.wouldSayNoIf && prof.wouldSayNoIf.length > 0) {
        suggestions.push(`If we guaranteed a solution for "${prof.wouldSayNoIf[0]}", would you test a pilot?`);
      }
      if (prof.currentAlternative) {
        suggestions.push(`What single feature would make you switch away from ${prof.currentAlternative}?`);
      }
      if (prof.switchingFriction) {
        suggestions.push(`If we handled 100% of the migration and integration setup for you, would that resolve your hesitation?`);
      }
      if (suggestions.length > 0) return suggestions;
    }
    return [
      "If we offered a 30-day pilot with full data export and custom SLA, would your team test it?",
      "If pricing was structured at 50% discount with dedicated support, would that clear budget?",
      "What is the single most critical capability we must ship before you would consider paying?",
    ];
  })();

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
              Cross-Examine the Panel
            </h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200/60">
              Interactive Q&A
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Ask direct probing questions or test price concessions directly against persona objections.
          </p>
        </div>
        <div className="min-w-[220px]">
          <label htmlFor="target-respondent" className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
            Target Respondent
          </label>
          <select
            id="target-respondent"
            value={selectedPersonaId}
            onChange={(e) => setSelectedPersonaId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5 text-xs font-medium text-zinc-800 outline-none focus:border-zinc-900 focus:bg-white transition-colors"
          >
            <option value="">Lead Skeptic (Auto-selected)</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.occupation}
              </option>
            ))}
          </select>
        </div>
      </div>

      {initialLoading ? (
        <div role="status" aria-live="polite" className="py-8 text-center text-xs text-zinc-400">Loading prior Q&amp;A history…</div>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center text-xs text-zinc-500 space-y-2">
          <p className="font-semibold text-zinc-700">No cross-examination questions asked yet.</p>
          <p className="text-zinc-500">
            Test counter-proposals or feature guarantees against {selectedPersona ? selectedPersona.name : "the lead skeptic"}.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {dynamicSuggestions.map((suggested, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuestion(suggested)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all text-left cursor-pointer"
              >
                &ldquo;{suggested}&rdquo;
              </button>
            ))}
          </div>
        </div>
      ) : (

        <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl bg-zinc-50/60 p-4 border border-zinc-200/80 space-y-3 text-xs sm:text-sm">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-bold text-zinc-700 flex items-center gap-1.5">
                  <span>Founder Query</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="font-medium text-zinc-900 bg-white p-3 rounded-lg border border-zinc-200/70 shadow-2xs">
                &ldquo;{m.question}&rdquo;
              </p>

              <div className="pt-2 border-t border-zinc-200/60 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                  <span>💬 {m.persona_name || "Panel Member"}</span>
                  {m.persona_occupation && (
                    <span className="font-normal text-zinc-500 text-[11px]">({m.persona_occupation})</span>
                  )}
                </div>
                <p className="text-zinc-800 leading-relaxed pl-1 whitespace-pre-line text-xs sm:text-sm">
                  {m.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200 font-medium">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleAsk} className="flex gap-2 pt-1">
        <label htmlFor="panel-question" className="sr-only">Question for the panel</label>
        <input
          id="panel-question"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            selectedPersona
              ? `Ask ${selectedPersona.name} a question or counter-proposal...`
              : "Ask the panel lead a question or test a concession..."
          }
          className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-900 focus:bg-white focus:ring-1 focus:ring-zinc-900 transition-all shadow-2xs"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-3 text-xs sm:text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-sm cursor-pointer shrink-0"
        >
          {loading ? "Asking…" : "Ask Persona"}
        </button>
      </form>
    </div>
  );
}
