import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { contextOrError } from "@/lib/store-context";
import type { MemberRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITABLE_ROLES: MemberRole[] = ["admin", "member"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// List the org's invitations (owner/admin only).
export async function GET() {
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;
  const invitations = await r.ctx.store.listInvitations();
  return NextResponse.json({ invitations });
}

// Create an invitation (owner/admin only). Returns the token so the UI can
// surface a copyable accept link; Phase 9 will also email it.
export async function POST(req: Request) {
  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  const role = (body.role as MemberRole) ?? "member";
  if (!INVITABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of ${INVITABLE_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  const token = randomBytes(24).toString("hex");
  const invitation = await r.ctx.store.createInvitation({
    email,
    role,
    token,
    invitedBy: r.ctx.userId,
  });
  return NextResponse.json({ invitation }, { status: 201 });
}
