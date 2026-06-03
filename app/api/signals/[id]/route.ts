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
  let body: { status?: string; feedback?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const r = await storeOr401();
  if (r.res) return r.res;

  // A PATCH carries a status change, a feedback rating, or both.
  if (body.feedback !== undefined) {
    if (![-1, 0, 1].includes(Number(body.feedback))) {
      return NextResponse.json({ error: "feedback must be -1, 0, or 1" }, { status: 400 });
    }
    await r.store.setSignalFeedback(id, Number(body.feedback));
  }
  if (body.status !== undefined) {
    const status = body.status as SignalStatus;
    if (!STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of ${STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    await r.store.setSignalStatus(id, status);
  }
  if (body.feedback === undefined && body.status === undefined) {
    return NextResponse.json({ error: "status or feedback required" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
