import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";
import { idempotencyKey, replayIdempotent, rememberIdempotent } from "@/lib/idempotency";
import type { ScheduleCadence } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CADENCES: ScheduleCadence[] = ["hourly", "daily", "weekly"];

// List the org's schedules (any member).
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  const schedules = await r.ctx.store.listSchedules();
  return NextResponse.json({ schedules });
}

// Create a schedule for a company (or the whole org if companyId omitted).
// Owner/admin only — schedules drive background Gemini spend.
// Body: { companyId?: string | null, cadence: 'hourly'|'daily'|'weekly', enabled?: boolean }
export async function POST(req: Request) {
  let body: { companyId?: string | null; cadence?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cadence = body.cadence as ScheduleCadence;
  if (!CADENCES.includes(cadence)) {
    return NextResponse.json(
      { error: `cadence must be one of ${CADENCES.join(", ")}` },
      { status: 400 },
    );
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  const store = r.ctx.store;

  // Validate the target company belongs to this org (FK alone doesn't scope it).
  if (body.companyId) {
    const company = await store.getCompany(body.companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
  }

  const idem = idempotencyKey(req);
  const replay = replayIdempotent("schedules", idem);
  if (replay) return replay;

  const schedule = await store.createSchedule({
    companyId: body.companyId ?? null,
    cadence,
    enabled: body.enabled ?? true,
  });
  rememberIdempotent("schedules", idem, 201, { schedule });
  return NextResponse.json({ schedule }, { status: 201 });
}
