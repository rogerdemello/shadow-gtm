"use client";

import { useState } from "react";

const PRESETS: { name: string; domain: string }[] = [
  { name: "HubSpot", domain: "hubspot.com" },
  { name: "Clay", domain: "clay.com" },
  { name: "Apollo", domain: "apollo.io" },
  { name: "Gong", domain: "gong.io" },
];

export default function AddCompany({
  onAdd,
  existingDomains,
  busy,
}: {
  onAdd: (name: string, domain: string, pricingUrl?: string) => Promise<void>;
  existingDomains: string[];
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [pricingUrl, setPricingUrl] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;
    await onAdd(name.trim(), domain.trim(), pricingUrl.trim() || undefined);
    setName("");
    setDomain("");
    setPricingUrl("");
  }

  const has = (d: string) => existingDomains.includes(d.replace(/^https?:\/\//, ""));

  return (
    <div className="rounded-xl border border-ink-500/60 bg-ink-800/60 p-4">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">
        Watchlist · Add competitor
      </h2>

      <form onSubmit={submit} className="space-y-2">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. HubSpot)"
            className="w-1/2 rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-accent/60"
          />
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Domain (hubspot.com)"
            className="w-1/2 rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-accent/60"
          />
        </div>
        <input
          value={pricingUrl}
          onChange={(e) => setPricingUrl(e.target.value)}
          placeholder="Page to monitor (optional — defaults to /pricing)"
          className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-accent/60"
        />
        <button
          type="submit"
          disabled={busy || !name.trim() || !domain.trim()}
          className="w-full rounded-lg bg-accent/90 py-2 text-sm font-semibold text-ink-900 transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add to watchlist
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.domain}
            disabled={busy || has(p.domain)}
            onClick={() => onAdd(p.name, p.domain)}
            className="rounded-full border border-ink-500 px-2.5 py-1 font-mono text-[11px] text-slate-400 transition hover:border-accent/50 hover:text-accent disabled:opacity-30"
          >
            {has(p.domain) ? "✓ " : "+ "}
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
