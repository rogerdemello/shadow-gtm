import { NextResponse } from "next/server";
import { DuplicateCompanyError } from "@/lib/store";
import { storeOr401 } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Update a competitor's editable fields (name / domain / pricing URL).
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: { name?: string; domain?: string; pricingUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { name?: string; domain?: string; pricingUrl?: string } = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = body.name;
  }
  if (body.domain !== undefined) {
    if (!body.domain.trim()) return NextResponse.json({ error: "domain cannot be empty" }, { status: 400 });
    patch.domain = body.domain;
  }
  if (body.pricingUrl !== undefined) patch.pricingUrl = body.pricingUrl;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const r = await storeOr401();
  if (r.res) return r.res;
  const { id } = await ctx.params;
  try {
    const company = await r.store.updateCompany(id, patch);
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    return NextResponse.json({ company });
  } catch (err) {
    if (err instanceof DuplicateCompanyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const r = await storeOr401();
  if (r.res) return r.res;
  const { id } = await ctx.params;
  await r.store.removeCompany(id);
  return NextResponse.json({ ok: true });
}
