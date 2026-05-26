"use client";

import { useState } from "react";
import type { Company } from "@/lib/types";
import Markdown from "./Markdown";

const PRESET_DIRECTIVES = [
  "Attack their SMB base",
  "Win their unhappy customers",
  "Undercut on pricing",
  "Exploit their enterprise shift",
];

export default function WarRoomModal({
  companies,
  plan,
  loading,
  onGenerate,
  onClose,
}: {
  companies: Company[];
  plan: { markdown: string; companyName: string | null; directive: string } | null;
  loading: boolean;
  onGenerate: (directive: string, companyId: string | null) => void;
  onClose: () => void;
}) {
  const [companyId, setCompanyId] = useState<string>("");
  const [directive, setDirective] = useState("");

  const run = () => {
    if (!directive.trim() || loading) return;
    onGenerate(directive.trim(), companyId || null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-signal-high/40 bg-ink-800 shadow-glow-red"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-500/60 bg-ink-800 px-5 py-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-signal-high">
            ⚔ War Room
          </h2>
          <button
            onClick={onClose}
            className="rounded border border-ink-500 px-2 py-0.5 font-mono text-xs text-slate-400 hover:text-slate-100"
          >
            esc ✕
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm outline-none focus:border-signal-high/60"
            >
              <option value="">Whole market</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={directive}
              onChange={(e) => setDirective(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder='Directive — e.g. "Attack HubSpot in the SMB market"'
              className="flex-1 rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-signal-high/60"
            />
            <button
              onClick={run}
              disabled={loading || !directive.trim()}
              className="rounded-lg bg-signal-high/90 px-4 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110 disabled:opacity-40"
            >
              {loading ? "Planning…" : "▶ Plan"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_DIRECTIVES.map((d) => (
              <button
                key={d}
                onClick={() => setDirective(d)}
                className="rounded-full border border-ink-500 px-2.5 py-1 font-mono text-[11px] text-slate-400 transition hover:border-signal-high/50 hover:text-signal-high"
              >
                {d}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-ink-500/50 bg-ink-900/40 px-4 py-3">
            {loading ? (
              <div className="flex items-center gap-2 py-8 font-mono text-sm text-signal-high">
                <span className="h-2 w-2 animate-pulseDot rounded-full bg-signal-high" />
                Drafting attack plan from live intelligence…
              </div>
            ) : plan ? (
              <>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {plan.companyName ?? "Market"} · “{plan.directive}”
                </p>
                <Markdown source={plan.markdown} />
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-600">
                Pick a target, enter a directive, and Shadow GTM drafts the play.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
