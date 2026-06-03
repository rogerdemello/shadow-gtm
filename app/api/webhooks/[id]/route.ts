import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fetch one webhook endpoint with its delivery health (no secret).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await contextOrError();
  if (r.res) return r.res;
  const webhook = await r.ctx.store.getWebhook(id);
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ webhook });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  await r.ctx.store.deleteWebhook(id);
  return NextResponse.json({ ok: true });
}
