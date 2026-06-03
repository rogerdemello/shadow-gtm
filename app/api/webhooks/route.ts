import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { contextOrError } from "@/lib/store-context";
import { idempotencyKey, replayIdempotent, rememberIdempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List outbound webhook endpoints (no secrets) — any member.
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  return NextResponse.json({ webhooks: await r.ctx.store.listWebhooks() });
}

// Create an endpoint (owner/admin). The signing secret is generated server-side
// and returned once so the caller can configure their receiver.
export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  if (!/^https?:\/\/.+/.test(url)) {
    return NextResponse.json({ error: "A valid http(s) URL is required." }, { status: 400 });
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  const idem = idempotencyKey(req);
  const replay = replayIdempotent("webhooks", idem);
  if (replay) return replay;

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const webhook = await r.ctx.store.createWebhook({ url, secret });
  // Return the secret once (it's stored, but we surface it here for setup).
  rememberIdempotent("webhooks", idem, 201, { webhook, secret });
  return NextResponse.json({ webhook, secret }, { status: 201 });
}
