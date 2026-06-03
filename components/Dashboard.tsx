"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Company, ScanCompanyResult, Signal } from "@/lib/types";
import AddCompany from "./AddCompany";
import CompetitorMatrix from "./CompetitorMatrix";
import IntelligenceFeed from "./IntelligenceFeed";
import dynamic from "next/dynamic";
import Recommendations from "./Recommendations";
import ErrorBoundary from "./ErrorBoundary";
import { LiveDot } from "./bits";
import { readSSE } from "@/lib/sse";
import type { TrendEntry } from "./TrendsPanel";

// Code-split the heavy/optional surfaces so they're off the initial bundle:
// TrendsPanel pulls in Recharts; the three modals only mount when opened.
const TrendsPanel = dynamic(() => import("./TrendsPanel"));
const BattlecardModal = dynamic(() => import("./BattlecardModal"));
const WarRoomModal = dynamic(() => import("./WarRoomModal"));
const EvidenceModal = dynamic(() => import("./EvidenceModal"));
const DossierModal = dynamic(() => import("./DossierModal"));
const AnalystModal = dynamic(() => import("./AnalystModal"));
const NarrativeModal = dynamic(() => import("./NarrativeModal"));

interface DossierState {
  company: Company;
  markdown: string | null;
  steps: string[];
  loading: boolean;
}

interface AttackPlan {
  markdown: string;
  companyName: string | null;
  directive: string;
}

interface Config {
  gemini: boolean;
  supabase: boolean;
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [trends, setTrends] = useState<TrendEntry[]>([]);

  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scanningName, setScanningName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [card, setCard] = useState<{
    company: Company;
    markdown: string | null;
    loading: boolean;
  } | null>(null);

  const [warOpen, setWarOpen] = useState(false);
  const [warPlan, setWarPlan] = useState<AttackPlan | null>(null);
  const [warLoading, setWarLoading] = useState(false);

  const [dossier, setDossier] = useState<DossierState | null>(null);
  const dossierAbortRef = useRef<AbortController | null>(null);

  const [analystOpen, setAnalystOpen] = useState(false);
  const [narrative, setNarrative] = useState<{ markdown: string | null; loading: boolean } | null>(
    null,
  );
  const narrativeAbortRef = useRef<AbortController | null>(null);

  const [evidenceSignal, setEvidenceSignal] = useState<Signal | null>(null);

  const [hydrated, setHydrated] = useState(false);

  const loadState = useCallback(async () => {
    const res = await fetch("/api/state");
    const data = await res.json();
    setCompanies(data.companies ?? []);
    setSignals(data.signals ?? []);
    setConfig(data.config ?? null);
    setHydrated(true);
  }, []);

  // Trends are supplementary (their own endpoint + history query) — load them
  // separately so a trends hiccup never blocks the core dashboard from rendering.
  const loadTrends = useCallback(async () => {
    try {
      const res = await fetch("/api/trends");
      if (!res.ok) {
        setTrends([]);
        return;
      }
      const data = await safeJson(res);
      setTrends((data.trends as TrendEntry[] | undefined) ?? []);
    } catch {
      setTrends([]);
    }
  }, []);

  useEffect(() => {
    loadState().catch((e) => {
      setError(String(e));
      setHydrated(true);
    });
    loadTrends();
  }, [loadState, loadTrends]);

  const addCompany = useCallback(
    async (name: string, domain: string, pricingUrl?: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, domain, pricingUrl }),
        });
        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error(
            (typeof data.error === "string" && data.error) ||
              `Add failed (${res.status})`,
          );
        }
        await loadState();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [loadState],
  );

  const removeCompany = useCallback(
    async (companyId: string) => {
      setCompanies((cs) => cs.filter((c) => c.id !== companyId));
      setSignals((ss) => ss.filter((s) => s.companyId !== companyId));
      await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
      // Re-sync — the server cascaded deletes to evidence/snapshots/battlecards.
      await loadState();
      loadTrends();
    },
    [loadState, loadTrends],
  );

  const setSignalStatus = useCallback(
    async (signalId: string, status: Signal["status"]) => {
      // Optimistic: update in place, then persist (re-sync on failure).
      setSignals((prev) =>
        prev.map((s) => (s.id === signalId ? { ...s, status } : s)),
      );
      try {
        const res = await fetch(`/api/signals/${signalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) await loadState();
      } catch {
        await loadState();
      }
    },
    [loadState],
  );

  const setSignalFeedback = useCallback(
    async (signalId: string, feedback: number) => {
      // Optimistic thumbs up/down; persist, re-sync on failure.
      setSignals((prev) =>
        prev.map((s) => (s.id === signalId ? { ...s, feedback } : s)),
      );
      try {
        const res = await fetch(`/api/signals/${signalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback }),
        });
        if (!res.ok) await loadState();
      } catch {
        await loadState();
      }
    },
    [loadState],
  );

  const scanEsRef = useRef<EventSource | null>(null);
  const runScan = useCallback(() => {
    setError(null);
    setScanning(true);

    const es = new EventSource("/api/scan/stream");
    scanEsRef.current = es;

    const finish = () => {
      es.close();
      if (scanEsRef.current === es) scanEsRef.current = null;
      setScanning(false);
      setScanningId(null);
      setScanningName(null);
      // History grew this scan — refresh momentum/trends.
      loadTrends();
    };

    es.onmessage = (e) => {
      let ev:
        | { type: "start" }
        | { type: "company-start"; companyId: string; name: string }
        | { type: "company-done"; result: ScanCompanyResult }
        | { type: "error"; error: string }
        | { type: "done" };
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }

      if (ev.type === "company-start") {
        setScanningId(ev.companyId);
        setScanningName(ev.name);
      } else if (ev.type === "company-done") {
        const result = ev.result;
        if (result.error) {
          setError(`${result.companyName}: ${result.error}`);
          // Server preserves prior signals when the AI step fails — mirror
          // that here so the dashboard doesn't wipe a populated feed on a
          // partial failure (this matters for seeded demo + live mixed runs).
          return;
        }
        // Replace this company's signals; newest companies float to the top.
        setSignals((prev) => [
          ...result.signals,
          ...prev.filter((s) => s.companyId !== result.companyId),
        ]);
      } else if (ev.type === "error") {
        setError(ev.error);
      } else if (ev.type === "done") {
        finish();
      }
    };

    // Network drop / server close mid-stream — stop and reset (no auto-reconnect).
    es.onerror = () => finish();
  }, [loadTrends]);

  // If the user navigates away mid-scan, close the SSE so we don't leak it.
  useEffect(() => {
    return () => {
      scanEsRef.current?.close();
      scanEsRef.current = null;
    };
  }, []);

  // One in-flight battlecard op at a time — abort the previous so a slow
  // stream for company A never overwrites the modal after the user opened B.
  const bcAbortRef = useRef<AbortController | null>(null);

  const streamBattlecard = useCallback(async (company: Company) => {
    bcAbortRef.current?.abort();
    const ac = new AbortController();
    bcAbortRef.current = ac;
    setError(null);
    setCard({ company, markdown: "", loading: true });
    try {
      const res = await fetch("/api/battlecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            `Battlecard failed (${res.status})`,
        );
      }
      let acc = "";
      for await (const ev of readSSE<
        | { type: "delta"; text: string }
        | { type: "done" }
        | { type: "error"; error: string }
      >(res, ac.signal)) {
        if (ac.signal.aborted) return;
        if (ev.type === "delta") {
          acc += ev.text;
          setCard({ company, markdown: acc, loading: true });
        } else if (ev.type === "error") {
          throw new Error(ev.error);
        } else if (ev.type === "done") {
          setCard({ company, markdown: acc, loading: false });
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setCard({
        company,
        markdown: `**Error:** ${(e as Error).message}`,
        loading: false,
      });
    } finally {
      if (bcAbortRef.current === ac) bcAbortRef.current = null;
    }
  }, []);

  const openBattlecard = useCallback(
    async (company: Company) => {
      // New open → abort any prior open/stream so this one wins.
      bcAbortRef.current?.abort();
      const ac = new AbortController();
      bcAbortRef.current = ac;
      setError(null);
      setCard({ company, markdown: null, loading: true });
      try {
        const res = await fetch(
          `/api/battlecard?companyId=${encodeURIComponent(company.id)}`,
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        if (res.ok) {
          const data = await safeJson(res);
          const bc = data.battlecard as { markdown?: string } | null | undefined;
          if (bc?.markdown) {
            if (ac.signal.aborted) return;
            setCard({ company, markdown: bc.markdown, loading: false });
            return;
          }
        }
      } catch {
        if (ac.signal.aborted) return;
        // Otherwise fall through to streaming.
      } finally {
        if (bcAbortRef.current === ac) bcAbortRef.current = null;
      }
      await streamBattlecard(company);
    },
    [streamBattlecard],
  );

  const warAbortRef = useRef<AbortController | null>(null);

  const generatePlan = useCallback(
    async (directive: string, companyId: string | null) => {
      warAbortRef.current?.abort();
      const ac = new AbortController();
      warAbortRef.current = ac;

      // Resolve the company name up front so the streaming title doesn't
      // flicker "Market" → real name when the done event lands.
      const resolvedName =
        (companyId && companies.find((c) => c.id === companyId)?.name) || null;

      setError(null);
      setWarLoading(true);
      setWarPlan({ markdown: "", companyName: resolvedName, directive });
      try {
        const res = await fetch("/api/warroom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directive, companyId }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error(
            (typeof data.error === "string" && data.error) ||
              `War Room failed (${res.status})`,
          );
        }
        let acc = "";
        for await (const ev of readSSE<
          | { type: "delta"; text: string }
          | {
              type: "done";
              plan: { directive: string; companyName: string | null; markdown: string };
            }
          | { type: "error"; error: string }
        >(res, ac.signal)) {
          if (ac.signal.aborted) return;
          if (ev.type === "delta") {
            acc += ev.text;
            setWarPlan({ markdown: acc, companyName: resolvedName, directive });
          } else if (ev.type === "error") {
            throw new Error(ev.error);
          } else if (ev.type === "done") {
            setWarPlan({
              markdown: ev.plan.markdown,
              companyName: ev.plan.companyName ?? resolvedName,
              directive,
            });
          }
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setWarPlan({
          markdown: `**Error:** ${(e as Error).message}`,
          companyName: resolvedName,
          directive,
        });
      } finally {
        if (warAbortRef.current === ac) warAbortRef.current = null;
        if (!ac.signal.aborted) setWarLoading(false);
      }
    },
    [companies],
  );

  const closeWarRoom = useCallback(() => {
    // Cancel any in-flight stream and clear state so re-opening is fresh.
    warAbortRef.current?.abort();
    warAbortRef.current = null;
    setWarOpen(false);
    setWarPlan(null);
    setWarLoading(false);
  }, []);

  // ── Deep-dive dossier (agentic) ───────────────────────────────────────────
  const streamDossier = useCallback(async (company: Company) => {
    dossierAbortRef.current?.abort();
    const ac = new AbortController();
    dossierAbortRef.current = ac;
    setDossier({ company, markdown: "", steps: [], loading: true });

    try {
      const res = await fetch("/api/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(
          (typeof data.error === "string" && data.error) || `Deep dive failed (${res.status})`,
        );
      }

      let acc = "";
      const steps: string[] = [];
      for await (const ev of readSSE<
        | { type: "plan"; tasks: { dimension: string }[] }
        | { type: "gather"; dimension: string; found: number }
        | { type: "synthesis" }
        | { type: "delta"; text: string }
        | { type: "done"; markdown: string }
        | { type: "error"; error: string }
      >(res, ac.signal)) {
        if (ac.signal.aborted) return;
        if (ev.type === "plan") {
          steps.push(`Planned ${ev.tasks.length} research angles`);
          setDossier({ company, markdown: "", steps: [...steps], loading: true });
        } else if (ev.type === "gather") {
          steps.push(`Researched ${ev.dimension} — ${ev.found} finding${ev.found === 1 ? "" : "s"}`);
          setDossier({ company, markdown: "", steps: [...steps], loading: true });
        } else if (ev.type === "synthesis") {
          steps.push("Synthesizing dossier…");
          setDossier({ company, markdown: "", steps: [...steps], loading: true });
        } else if (ev.type === "delta") {
          acc += ev.text;
          setDossier({ company, markdown: acc, steps: [...steps], loading: true });
        } else if (ev.type === "error") {
          throw new Error(ev.error);
        } else if (ev.type === "done") {
          setDossier({ company, markdown: ev.markdown, steps: [...steps], loading: false });
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setDossier({
        company,
        markdown: `**Error:** ${(e as Error).message}`,
        steps: [],
        loading: false,
      });
    } finally {
      if (dossierAbortRef.current === ac) dossierAbortRef.current = null;
    }
  }, []);

  const openDossier = useCallback(
    async (company: Company) => {
      dossierAbortRef.current?.abort();
      const ac = new AbortController();
      dossierAbortRef.current = ac;
      setDossier({ company, markdown: null, steps: [], loading: true });
      try {
        const res = await fetch(
          `/api/dossier?companyId=${encodeURIComponent(company.id)}`,
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        if (res.ok) {
          const data = await safeJson(res);
          const d = data.dossier as { markdown?: string } | null | undefined;
          if (d?.markdown) {
            setDossier({ company, markdown: d.markdown, steps: [], loading: false });
            return;
          }
        }
      } catch {
        if (ac.signal.aborted) return;
      } finally {
        if (dossierAbortRef.current === ac) dossierAbortRef.current = null;
      }
      // No cached dossier — run the agent.
      await streamDossier(company);
    },
    [streamDossier],
  );

  const closeDossier = useCallback(() => {
    dossierAbortRef.current?.abort();
    dossierAbortRef.current = null;
    setDossier(null);
  }, []);

  // Run a confirmed client-side action proposed by the analyst (drives existing UIs).
  const handleAgentAction = useCallback(
    (tool: string, args: Record<string, unknown>) => {
      const findCo = (n: unknown) => {
        const q = String(n ?? "").toLowerCase();
        return (
          companies.find((c) => c.name.toLowerCase() === q) ||
          companies.find((c) => c.name.toLowerCase().includes(q) || c.domain.includes(q))
        );
      };
      setAnalystOpen(false); // surface the triggered UI
      if (tool === "run_scan") {
        runScan();
      } else if (tool === "run_deep_dive") {
        const c = findCo(args.companyName);
        if (c) openDossier(c);
      } else if (tool === "generate_battlecard") {
        const c = findCo(args.companyName);
        if (c) openBattlecard(c);
      }
    },
    [companies, runScan, openDossier, openBattlecard],
  );

  // ── Market-narrative memo (agent) ──────────────────────────────────────────
  const streamNarrative = useCallback(async () => {
    narrativeAbortRef.current?.abort();
    const ac = new AbortController();
    narrativeAbortRef.current = ac;
    setNarrative({ markdown: "", loading: true });
    try {
      const res = await fetch("/api/narrative", { method: "POST", signal: ac.signal });
      if (!res.ok) {
        const d = await safeJson(res);
        throw new Error((typeof d.error === "string" && d.error) || `Memo failed (${res.status})`);
      }
      let acc = "";
      for await (const ev of readSSE<
        | { type: "delta"; text: string }
        | { type: "done"; markdown: string }
        | { type: "error"; error: string }
      >(res, ac.signal)) {
        if (ac.signal.aborted) return;
        if (ev.type === "delta") {
          acc += ev.text;
          setNarrative({ markdown: acc, loading: true });
        } else if (ev.type === "error") {
          throw new Error(ev.error);
        } else if (ev.type === "done") {
          setNarrative({ markdown: ev.markdown, loading: false });
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setNarrative({ markdown: `**Error:** ${(e as Error).message}`, loading: false });
    } finally {
      if (narrativeAbortRef.current === ac) narrativeAbortRef.current = null;
    }
  }, []);

  const openNarrative = useCallback(async () => {
    narrativeAbortRef.current?.abort();
    const ac = new AbortController();
    narrativeAbortRef.current = ac;
    setNarrative({ markdown: null, loading: true });
    try {
      const res = await fetch("/api/narrative", { signal: ac.signal });
      if (ac.signal.aborted) return;
      if (res.ok) {
        const d = await safeJson(res);
        const n = d.narrative as { markdown?: string } | null | undefined;
        if (n?.markdown) {
          setNarrative({ markdown: n.markdown, loading: false });
          return;
        }
      }
    } catch {
      if (ac.signal.aborted) return;
    } finally {
      if (narrativeAbortRef.current === ac) narrativeAbortRef.current = null;
    }
    await streamNarrative();
  }, [streamNarrative]);

  const closeNarrative = useCallback(() => {
    narrativeAbortRef.current?.abort();
    narrativeAbortRef.current = null;
    setNarrative(null);
  }, []);

  // Esc closes whichever modal is open and cancels any in-flight stream.
  useEffect(() => {
    if (!card && !warOpen && !evidenceSignal && !dossier && !narrative) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      bcAbortRef.current?.abort();
      bcAbortRef.current = null;
      setCard(null);
      closeWarRoom();
      closeDossier();
      closeNarrative();
      setEvidenceSignal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, warOpen, evidenceSignal, dossier, narrative, closeWarRoom, closeDossier, closeNarrative]);

  const highImpact = signals.filter((s) => s.impact === "high").length;
  const avgScore = signals.length
    ? Math.round(signals.reduce((a, s) => a + s.opportunityScore, 0) / signals.length)
    : 0;
  const lastScanIso = signals.reduce<string | null>(
    (acc, s) => (!acc || s.createdAt > acc ? s.createdAt : acc),
    null,
  );
  const empty = companies.length === 0;

  // Per-company opportunity-over-time, for the matrix momentum sparklines.
  const sparklines: Record<string, number[]> = {};
  for (const t of trends) {
    sparklines[t.company.id] = t.series.map((p) => p.topOpportunity);
  }

  if (!hydrated) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-24 font-mono text-xs uppercase tracking-widest text-slate-500">
        <span className="mr-2 h-2 w-2 animate-pulseDot rounded-full bg-accent" />
        Booting Shadow GTM…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-50">
            <span className="text-accent">◢</span> Shadow GTM
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-slate-500">
            Autonomous web intelligence for revenue teams — live competitor
            signals → AI reasoning → ranked plays.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveDot active={scanning} />
          <button
            onClick={() => setAnalystOpen(true)}
            className="rounded-lg border border-accent/40 px-4 py-2.5 text-sm font-bold text-accent transition hover:bg-accent/10"
            title="Ask the analyst agent about your competitive landscape"
          >
            ✦ Ask
          </button>
          <button
            onClick={openNarrative}
            disabled={companies.length === 0}
            className="rounded-lg border border-ink-500 px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider text-slate-300 transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
            title="Generate a state-of-the-market memo across your watchlist"
          >
            ◷ Memo
          </button>
          <a
            href="/api/report"
            download
            aria-disabled={signals.length === 0}
            onClick={(e) => {
              if (signals.length === 0) e.preventDefault();
            }}
            className={`rounded-lg border border-ink-500 px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider text-slate-300 transition hover:border-accent/50 hover:text-accent ${
              signals.length === 0 ? "pointer-events-none opacity-40" : ""
            }`}
            title="Download a single Markdown brief with all signals + battlecards"
          >
            ⬇ Brief
          </a>
          <button
            onClick={() => setWarOpen(true)}
            disabled={companies.length === 0}
            className="rounded-lg border border-signal-high/50 px-4 py-2.5 text-sm font-bold text-signal-high transition hover:bg-signal-high/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⚔ War Room
          </button>
          <button
            onClick={runScan}
            disabled={scanning || companies.length === 0}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-ink-900 shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {scanning ? "⟳ Scanning…" : "▶ Run intelligence scan"}
          </button>
        </div>
      </header>

      {/* Status / config strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <Stat label="watching" value={String(companies.length)} />
        <Stat label="signals" value={String(signals.length)} />
        <Stat label="high-impact" value={String(highImpact)} accent={highImpact > 0} />
        <Stat label="avg score" value={String(avgScore)} />
        {lastScanIso && <Stat label="last scan" value={shortAgo(lastScanIso)} />}
        <span className="ml-auto flex items-center gap-2">
          <Pill ok={config?.gemini ?? false} text="Gemini · key" />
        </span>
      </div>

      {config && !config.gemini && (
        <div className="mb-4 rounded-lg border border-signal-mid/30 bg-signal-mid/5 px-3 py-2 text-xs text-signal-mid">
          No <code>GEMINI_API_KEY</code> set. Scans read the live web and reason
          through the Gemini API — add a key in <code>.env.local</code> to run one.
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-signal-high/40 bg-signal-high/10 px-3 py-2 text-xs text-signal-high">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <AddCompany
            onAdd={addCompany}
            existingDomains={companies.map((c) => c.domain)}
            busy={busy}
          />
          <Recommendations signals={signals} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <ErrorBoundary label="the competitor matrix">
            <CompetitorMatrix
              companies={companies}
              signals={signals}
              scanningId={scanningId}
              sparklines={sparklines}
              onBattlecard={openBattlecard}
              onDossier={openDossier}
              onRemove={removeCompany}
            />
          </ErrorBoundary>
          {!empty && (
            <ErrorBoundary label="the trends panel">
              <TrendsPanel trends={trends} />
            </ErrorBoundary>
          )}
          <div className="h-[560px]">
            <ErrorBoundary label="the intelligence feed">
              <IntelligenceFeed
                signals={signals}
                scanningName={scanningName}
                onEvidence={setEvidenceSignal}
                onSetStatus={setSignalStatus}
                onFeedback={setSignalFeedback}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {card && (
        <BattlecardModal
          companyName={card.company.name}
          markdown={card.markdown}
          loading={card.loading}
          onClose={() => {
            bcAbortRef.current?.abort();
            bcAbortRef.current = null;
            setCard(null);
          }}
          onRegenerate={() => streamBattlecard(card.company)}
        />
      )}

      {warOpen && (
        <WarRoomModal
          companies={companies}
          plan={warPlan}
          loading={warLoading}
          onGenerate={generatePlan}
          onClose={closeWarRoom}
        />
      )}

      {evidenceSignal && (
        <EvidenceModal
          signal={evidenceSignal}
          onClose={() => setEvidenceSignal(null)}
        />
      )}

      {dossier && (
        <DossierModal
          companyName={dossier.company.name}
          markdown={dossier.markdown}
          steps={dossier.steps}
          loading={dossier.loading}
          onClose={closeDossier}
          onRegenerate={() => streamDossier(dossier.company)}
        />
      )}

      {analystOpen && (
        <AnalystModal
          onClose={() => setAnalystOpen(false)}
          onAction={handleAgentAction}
          onActed={() => {
            loadState();
            loadTrends();
          }}
        />
      )}

      {narrative && (
        <NarrativeModal
          markdown={narrative.markdown}
          loading={narrative.loading}
          onClose={closeNarrative}
          onRegenerate={streamNarrative}
        />
      )}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-ink-500/40 pt-4 font-mono text-[10px] uppercase tracking-widest text-slate-600">
        <span>
          live web + reasoning ·{" "}
          <a
            href="https://ai.google.dev/gemini-api"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-accent"
          >
            Gemini
          </a>
        </span>
        <span className="flex items-center gap-3">
          <a href="/terms" className="hover:text-accent">Terms</a>
          <a href="/privacy" className="hover:text-accent">Privacy</a>
          <a href="/dpa" className="hover:text-accent">DPA</a>
          <span className="text-slate-700">·</span>
          <span>Shadow GTM</span>
        </span>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="rounded-md border border-ink-500/60 bg-ink-800/60 px-2.5 py-1">
      <span className="text-slate-500">{label} </span>
      <span className={accent ? "font-bold text-signal-high" : "font-bold text-slate-200"}>
        {value}
      </span>
    </span>
  );
}

function shortAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Pill({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
      style={{
        borderColor: ok ? "#3ddc9744" : "#ff4d5e44",
        color: ok ? "#3ddc97" : "#ff6b78",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: ok ? "#3ddc97" : "#ff4d5e" }}
      />
      {text}
    </span>
  );
}
