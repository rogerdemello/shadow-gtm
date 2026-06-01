import type { Metadata } from "next";
import Link from "next/link";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing — Shadow GTM" };

function limit(n: number | null): string {
  return n === null ? "Unlimited" : n.toLocaleString();
}

export default function PricingPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-50">Pricing</h1>
      <p className="mt-2 text-sm text-slate-400">
        Start free. Upgrade as your competitive set and team grow. Quotas are enforced from real
        usage — no surprises.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const price =
            p.priceMonthly < 0 ? "Custom" : p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`;
          return (
            <div
              key={id}
              className="flex flex-col rounded-xl border border-ink-500/60 bg-ink-800/60 p-5"
            >
              <h2 className="text-lg font-bold text-slate-100">{p.name}</h2>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-50">
                {price}
                {p.priceMonthly > 0 && (
                  <span className="text-sm font-normal text-slate-500">/mo</span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">{p.blurb}</p>
              <ul className="mt-4 flex-1 space-y-1 font-mono text-[12px] text-slate-400">
                <li>{limit(p.limits.monthlyScans)} scans / mo</li>
                <li>{limit(p.limits.maxCompanies)} competitors</li>
                <li>{limit(p.limits.maxMembers)} team seats</li>
              </ul>
              <Link
                href="/login"
                className="mt-5 rounded-lg border border-accent/50 px-3 py-2 text-center text-sm font-bold text-accent transition hover:bg-accent/10"
              >
                {p.priceMonthly < 0 ? "Contact sales" : "Get started"}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
