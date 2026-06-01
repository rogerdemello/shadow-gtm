import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/env";
import { getServerClient } from "@/lib/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accept an invitation by token. The caller must be signed in (any user) — they
// are not yet a member, so this goes through the accept_invitation() RPC which
// validates the token/email/expiry and adds the membership under SECURITY DEFINER.
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Workspaces are not configured." }, { status: 400 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const db = await getServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await db.rpc("accept_invitation", { invite_token: token });
  if (error) {
    // The RPC raises readable messages (expired / wrong email / not found).
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, orgId: data });
}
