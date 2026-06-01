import { NextResponse } from "next/server";
import { contextOrError, type Store } from "@/lib/store-context";
import type { MemberRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: MemberRole[] = ["owner", "admin", "member"];

/** Guard: an org must always keep at least one owner. Returns true if the
 *  proposed change to `targetUserId` would remove the final owner. */
async function wouldOrphanOrg(
  store: Store,
  targetUserId: string,
  nextRole: MemberRole | null,
): Promise<boolean> {
  const members = await store.listMembers();
  const owners = members.filter((m) => m.role === "owner");
  const targetIsOwner = owners.some((m) => m.userId === targetUserId);
  if (!targetIsOwner) return false;
  // Removing (null) or demoting the target away from owner.
  if (nextRole === "owner") return false;
  return owners.length <= 1;
}

// Change a member's role (owner/admin only).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  let body: { role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const role = body.role as MemberRole;
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 });
  }

  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  if (await wouldOrphanOrg(r.ctx.store, userId, role)) {
    return NextResponse.json({ error: "An org must keep at least one owner." }, { status: 400 });
  }
  await r.ctx.store.updateMemberRole(userId, role);
  return NextResponse.json({ ok: true });
}

// Remove a member (owner/admin only).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const r = await contextOrError(["owner", "admin"]);
  if (r.res) return r.res;

  if (await wouldOrphanOrg(r.ctx.store, userId, null)) {
    return NextResponse.json({ error: "An org must keep at least one owner." }, { status: 400 });
  }
  await r.ctx.store.removeMember(userId);
  return NextResponse.json({ ok: true });
}
