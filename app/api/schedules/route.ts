import { NextResponse } from "next/server";
import { getStore, UnauthorizedError } from "@/lib/store-context";
import { getServerClient } from "@/lib/db/server";
import { resolveActiveOrgId } from "@/lib/store-context";
import type { ScheduleCadenceEnum } from "@/lib/db/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CADENCES: ScheduleCadenceEnum[] = ["hourly", "daily", "weekly"];

// List the org's schedules.
export async function GET() {
  try {
    await getStore(); // ensures auth + org resolution (throws if unauthed)
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
  const db = await getServerClient();
  const { data, error } = await db.from("schedules").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedules: data });
}

// Create/replace a schedule for a company (or the whole org if companyId omitted).
// Body: { companyId?: string | null, cadence: 'hourly'|'daily'|'weekly', enabled?: boolean }
export async function POST(req: Request) {
  let body: { companyId?: string | null; cadence?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cadence = body.cadence as ScheduleCadenceEnum;
  if (!CADENCES.includes(cadence)) {
    return NextResponse.json(
      { error: `cadence must be one of ${CADENCES.join(", ")}` },
      { status: 400 },
    );
  }

  const db = await getServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await resolveActiveOrgId(db, user.id);
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 409 });

  const { data, error } = await db
    .from("schedules")
    .insert({
      org_id: orgId,
      company_id: body.companyId ?? null,
      cadence,
      enabled: body.enabled ?? true,
      next_run_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data }, { status: 201 });
}
