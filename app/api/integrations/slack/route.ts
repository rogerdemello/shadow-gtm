import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Slack integration config (owner/admin only — the webhook URL is a credential).
export async function GET() {
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  const integ = await r.ctx.store.getIntegration("slack");
  return NextResponse.json({
    connected: Boolean(integ?.enabled),
    webhookUrl: (integ?.config.webhookUrl as string | undefined) ?? "",
  });
}

// Connect / update Slack: body { webhookUrl, enabled? }.
export async function PUT(req: Request) {
  let body: { webhookUrl?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const url = (body.webhookUrl ?? "").trim();
  if (!/^https:\/\/hooks\.slack\.com\//.test(url)) {
    return NextResponse.json({ error: "Enter a valid Slack incoming-webhook URL." }, { status: 400 });
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  await r.ctx.store.upsertIntegration("slack", { webhookUrl: url }, body.enabled ?? true);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  await r.ctx.store.deleteIntegration("slack");
  return NextResponse.json({ ok: true });
}
