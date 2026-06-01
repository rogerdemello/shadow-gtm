import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Get the active org's settings (any member).
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  const org = await r.ctx.store.getOrgSettings();
  return NextResponse.json({ org, role: r.ctx.role });
}

// Rename the org (owner/admin only).
export async function PATCH(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 80) {
    return NextResponse.json({ error: "name must be 80 characters or fewer" }, { status: 400 });
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  await r.ctx.store.updateOrgName(name);
  return NextResponse.json({ ok: true });
}
