import { NextResponse } from "next/server";
import { storeOr401 } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the org's notifications (newest first).
export async function GET() {
  const r = await storeOr401();
  if (r.res) return r.res;
  return NextResponse.json({ notifications: await r.store.listNotifications() });
}

// Mark notifications read. Body: { ids: string[] }.
export async function POST(req: Request) {
  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(body.ids) ||
    body.ids.length === 0 ||
    body.ids.length > 500 ||
    !body.ids.every((x) => typeof x === "string" && x.length > 0 && x.length <= 100)
  ) {
    return NextResponse.json(
      { error: "ids must be a non-empty array (max 500) of id strings" },
      { status: 400 },
    );
  }
  const r = await storeOr401();
  if (r.res) return r.res;
  await r.store.markNotificationsRead(body.ids);
  return NextResponse.json({ ok: true });
}
