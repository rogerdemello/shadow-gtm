import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";
import type { SignalStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: SignalStatus[] = ["active", "handled", "dismissed"];

// Update a signal's workflow status (active/handled/dismissed).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body.status as SignalStatus;
  if (!STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const r = await storeOr401();
  if (r.res) return r.res;
  await r.store.setSignalStatus(id, status);
  return NextResponse.json({ ok: true });
}
