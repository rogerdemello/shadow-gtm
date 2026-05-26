"use client";

import { useCallback, useEffect, useState } from "react";
import type { Company, ScanCompanyResult, Signal } from "@/lib/types";
import AddCompany from "./AddCompany";
import CompetitorMatrix from "./CompetitorMatrix";
import IntelligenceFeed from "./IntelligenceFeed";
import Recommendations from "./Recommendations";
import BattlecardModal from "./BattlecardModal";
import { LiveDot } from "./bits";

interface Config {
  brightData: boolean;
  anthropic: boolean;
  mock: boolean;
  scrapingBrowser: boolean;
}

export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [config, setConfig] = useState<Config | null>(null);

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

  const loadState = useCallback(async () => {
    const res = await fetch("/api/state");
    const data = await res.json();
    setCompanies(data.companies ?? []);
    setSignals(data.signals ?? []);
    setConfig(data.config ?? null);
  }, []);

  useEffect(() => {
    loadState().catch((e) => setError(String(e)));
  }, [loadState]);

  const addCompany = useCallback(
    async (name: string, domain: string, pricingUrl?: string, renderJs?: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, domain, pricingUrl, renderJs }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Add failed");
        await loadState();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [loadState],
  );

  const removeCompany = useCallback(async (companyId: string) => {
    setCompanies((cs) => cs.filter((c) => c.id !== companyId));
    setSignals((ss) => ss.filter((s) => s.companyId !== companyId));
    await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
  }, []);

  const runScan = useCallback(async () => {
    setError(null);
    setScanning(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed to start");

      const { scanId, queue } = data as {
        scanId: string;
        queue: { id: string; name: string }[];
      };

      for (const item of queue) {
        setScanningId(item.id);
        setScanningName(item.name);
        try {
          const r = await fetch("/api/scan/company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scanId, companyId: item.id }),
          });
          const body = await r.json();
          const result = body.result as ScanCompanyResult | undefined;
          if (result?.error) {
            setError(`${item.name}: ${result.error}`);
          }
          if (result) {
            // Replace this company's signals; newest companies float to top.
            setSignals((prev) => [
              ...result.signals,
              ...prev.filter((s) => s.companyId !== item.id),
            ]);
          }
        } catch (e) {
          setError(`${item.name}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
      setScanningId(null);
      setScanningName(null);
    }
  }, []);

  const openBattlecard = useCallback(async (company: Company) => {
    setCard({ company, markdown: null, loading: true });
    try {
      const res = await fetch("/api/battlecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Battlecard failed");
      setCard({ company, markdown: data.battlecard.markdown, loading: false });
    } catch (e) {
      setCard({ company, markdown: `**Error:** ${(e as Error).message}`, loading: false });
    }
  }, []);

  // Esc closes the modal.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCard(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card]);

  const highImpact = signals.filter((s) => s.impact === "high").length;
  const avgScore = signals.length
    ? Math.round(signals.reduce((a, s) => a + s.opportunityScore, 0) / signals.length)
    : 0;

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
        <span className="ml-auto flex items-center gap-2">
          <Pill
            ok={config?.brightData ?? false}
            text={config?.mock ? "Bright Data · MOCK" : "Bright Data · LIVE"}
          />
          <Pill ok={config?.anthropic ?? false} text="Claude · key" />
        </span>
      </div>

      {config?.mock && (
        <div className="mb-4 rounded-lg border border-signal-mid/30 bg-signal-mid/5 px-3 py-2 text-xs text-signal-mid">
          Running in mock mode (no <code>BRIGHTDATA_API_TOKEN</code>). Scans use
          sample pages. Set credentials in <code>.env.local</code> to go live.
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
            scrapingBrowser={config?.scrapingBrowser ?? false}
          />
          <Recommendations signals={signals} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <CompetitorMatrix
            companies={companies}
            signals={signals}
            scanningId={scanningId}
            onBattlecard={openBattlecard}
            onRemove={removeCompany}
          />
          <div className="h-[560px]">
            <IntelligenceFeed signals={signals} scanningName={scanningName} />
          </div>
        </div>
      </div>

      {card && (
        <BattlecardModal
          companyName={card.company.name}
          markdown={card.markdown}
          loading={card.loading}
          onClose={() => setCard(null)}
        />
      )}
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
