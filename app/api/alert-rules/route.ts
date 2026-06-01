import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import type { AlertRule } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CHANNELS = ["in_app", "email", "slack", "webhook"];

// Get the org's alert configuration (any member).
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  const rule = await r.ctx.store.getAlertRule();
  return NextResponse.json({ rule });
}

// Update the org's alert configuration (any member).
export async function PATCH(req: Request) {
  let body: Partial<AlertRule>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AlertRule> = {};
  if (body.minOpportunity !== undefined) {
    const n = Number(body.minOpportunity);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: "minOpportunity must be 0–100" }, { status: 400 });
    }
    patch.minOpportunity = Math.round(n);
  }
  if (body.channels !== undefined) {
    if (
      !Array.isArray(body.channels) ||
      !body.channels.every((c) => VALID_CHANNELS.includes(c))
    ) {
      return NextResponse.json(
        { error: `channels must be a subset of ${VALID_CHANNELS.join(", ")}` },
        { status: 400 },
      );
    }
    patch.channels = body.channels;
  }
  if (body.digestEnabled !== undefined) {
    patch.digestEnabled = Boolean(body.digestEnabled);
  }

  const r = await contextOrError();
  if (r.res) return r.res;
  await r.ctx.store.updateAlertRule(patch);
  return NextResponse.json({ ok: true });
}
