import { NextResponse } from "next/server";
import { contextOrError } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dead-letter view: scan jobs that exhausted their retries (any member).
export async function GET() {
  const r = await contextOrError();
  if (r.res) return r.res;
  return NextResponse.json({ failed: await r.ctx.store.listFailedJobs() });
}
