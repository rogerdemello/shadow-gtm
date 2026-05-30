import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
