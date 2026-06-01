import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the active org's members (any member may view the roster).
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  const members = await r.ctx.store.listMembers();
  return NextResponse.json({ members, me: r.ctx.userId, myRole: r.ctx.role });
}
