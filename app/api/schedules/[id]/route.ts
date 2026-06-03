import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import type { ScheduleCadence } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CADENCES: ScheduleCadence[] = ["hourly", "daily", "weekly"];

// Update a schedule's cadence/enabled flag (owner/admin only).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { cadence?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { cadence?: ScheduleCadence; enabled?: boolean } = {};
  if (body.cadence !== undefined) {
    if (!CADENCES.includes(body.cadence as ScheduleCadence)) {
      return NextResponse.json(
        { error: `cadence must be one of ${CADENCES.join(", ")}` },
        { status: 400 },
      );
    }
    patch.cadence = body.cadence as ScheduleCadence;
  }
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
  if (patch.cadence === undefined && patch.enabled === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  await r.ctx.store.updateSchedule(id, patch);
  return NextResponse.json({ ok: true });
}

// Delete a schedule (owner/admin only).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  await r.ctx.store.deleteSchedule(id);
  return NextResponse.json({ ok: true });
}
