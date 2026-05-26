"use client";

import type { Company, Signal, SignalType } from "@/lib/types";
import { SIGNAL_META } from "@/lib/ui";

const CELL_TYPES: SignalType[] = ["pricing", "product", "hiring", "sentiment"];

function Cell({ signals, type }: { signals: Signal[]; type: SignalType }) {
  const hits = signals.filter((s) => s.type === type);
  if (hits.length === 0) {
    return <span className="font-mono text-slate-700">—</span>;
  }
  const top = hits.sort((a, b) => b.opportunityScore - a.opportunityScore)[0];
  const c = SIGNAL_META[type].color;
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-xs"
      style={{ color: c }}
      title={top.description}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {hits.length}
    </span>
  );
}

function momentum(signals: Signal[]): { label: string; color: string } {
  if (signals.length === 0) return { label: "quiet", color: "#5a6678" };
  const total = signals.reduce((a, s) => a + s.opportunityScore, 0);
  if (total >= 220) return { label: "exploding", color: "#3ddc97" };
  if (total >= 120) return { label: "strong", color: "#ffb020" };
  return { label: "active", color: "#3aa0ff" };
}

export default function CompetitorMatrix({
  companies,
  signals,
  scanningId,
  onBattlecard,
  onRemove,
}: {
  companies: Company[];
  signals: Signal[];
  scanningId: string | null;
  onBattlecard: (company: Company) => void;
  onRemove: (companyId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-ink-500/60 bg-ink-800/60">
      <div className="border-b border-ink-500/60 px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-slate-400">
          ⚔ Competitor matrix
        </h2>
      </div>

      {companies.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-600">
          No competitors on the watchlist yet.
        </p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 font-medium">Company</th>
              {CELL_TYPES.map((t) => (
                <th key={t} className="px-2 py-2 text-center font-medium">
                  {SIGNAL_META[t].label.slice(0, 4)}
                </th>
              ))}
              <th className="px-2 py-2 font-medium">Momentum</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const sig = signals.filter((s) => s.companyId === c.id);
              const mo = momentum(sig);
              const scanning = scanningId === c.id;
              return (
                <tr
                  key={c.id}
                  className="border-t border-ink-500/40 transition hover:bg-ink-700/30"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {scanning && (
                        <span className="h-2 w-2 animate-pulseDot rounded-full bg-accent" />
                      )}
                      <span className="text-sm font-semibold text-slate-100">
                        {c.name}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-600">
                      {c.domain}
                    </span>
                  </td>
                  {CELL_TYPES.map((t) => (
                    <td key={t} className="px-2 py-2.5 text-center">
                      <Cell signals={sig} type={t} />
                    </td>
                  ))}
                  <td className="px-2 py-2.5">
                    <span
                      className="font-mono text-[11px] uppercase tracking-wide"
                      style={{ color: mo.color }}
                    >
                      {mo.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onBattlecard(c)}
                        disabled={sig.length === 0}
                        className="rounded border border-ink-500 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-300 transition hover:border-accent/60 hover:text-accent disabled:opacity-30"
                        title="Generate a sales battlecard from this company's signals"
                      >
                        Battlecard
                      </button>
                      <button
                        onClick={() => onRemove(c.id)}
                        className="rounded border border-ink-500 px-2 py-1 font-mono text-[10px] text-slate-500 transition hover:border-signal-high/60 hover:text-signal-high"
                        title="Remove from watchlist"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
