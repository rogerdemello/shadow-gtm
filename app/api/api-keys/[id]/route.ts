import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Revoke an API key (owner/admin).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  await r.ctx.store.revokeApiKey(id);
  return NextResponse.json({ ok: true });
}
