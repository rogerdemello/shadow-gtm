import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Right to erasure: delete the active org and all its data (owner only). FK
// cascades clear every org-scoped table. The user can create a fresh workspace
// on next visit (ensureActiveOrg).
export async function POST() {
  const r = await contextOrError(["owner"]);
  if (r.res) return r.res;
  await r.ctx.store.deleteOrg();
  return NextResponse.json({ ok: true });
}
