import { NextResponse } from "next/server";
import { removeCompany } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await removeCompany(id);
  return NextResponse.json({ ok: true });
}
