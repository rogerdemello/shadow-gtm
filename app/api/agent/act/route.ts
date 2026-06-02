import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import { DuplicateCompanyError } from "@/lib/store";
import { planFor } from "@/lib/plans";
import { companyLimitReached } from "@/lib/quota";
import type { SignalStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Execute a server-class action the analyst proposed and the user confirmed.
// Only fast, store-only mutations run here; heavy generative actions (scan,
// deep-dive, battlecard) are "client" actions driven by the UI, not this route.
export async function POST(req: Request) {
  let body: { tool?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const tool = body.tool ?? "";
  const args = body.args ?? {};

  const r = await contextOrError();
  if (r.res) return r.res;
  const { store } = r.ctx;

  try {
    switch (tool) {
      case "add_competitor": {
        const name = String(args.name ?? "").trim();
        const domain = String(args.domain ?? "").trim();
        if (!name || !domain) {
          return NextResponse.json({ error: "name and domain required" }, { status: 400 });
        }
        const [existing, sub] = await Promise.all([
          store.listCompanies(),
          store.getSubscription(),
        ]);
        if (companyLimitReached(planFor(sub.plan), existing.length)) {
          return NextResponse.json(
            { error: "Plan competitor limit reached — upgrade in Settings → Billing." },
            { status: 402 },
          );
        }
        const company = await store.addCompany({
          name,
          domain,
          pricingUrl: args.pricingUrl ? String(args.pricingUrl) : undefined,
        });
        return NextResponse.json({ ok: true, summary: `Added ${company.name} to the watchlist.` });
      }

      case "set_signal_status": {
        const status = String(args.status ?? "") as SignalStatus;
        if (!["active", "handled", "dismissed"].includes(status)) {
          return NextResponse.json({ error: "invalid status" }, { status: 400 });
        }
        const companyName = args.companyName ? String(args.companyName).toLowerCase() : null;
        const needle = args.description ? String(args.description).toLowerCase() : null;
        const signals = await store.listSignals();
        const match = signals.find(
          (s) =>
            (!companyName || s.companyName.toLowerCase().includes(companyName)) &&
            (!needle || s.description.toLowerCase().includes(needle)),
        );
        if (!match) return NextResponse.json({ error: "No matching signal found." }, { status: 404 });
        await store.setSignalStatus(match.id, status);
        return NextResponse.json({ ok: true, summary: `Marked "${match.description.slice(0, 40)}" as ${status}.` });
      }

      case "set_alert_threshold": {
        const value = Math.round(Number(args.value));
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          return NextResponse.json({ error: "value must be 0–100" }, { status: 400 });
        }
        await store.updateAlertRule({ minOpportunity: value });
        return NextResponse.json({ ok: true, summary: `Alert threshold set to ${value}.` });
      }

      default:
        return NextResponse.json({ error: `Unknown or non-server action: ${tool}` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof DuplicateCompanyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
