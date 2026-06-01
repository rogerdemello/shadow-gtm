import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/env";
import { getServerClient } from "@/lib/db/server";
import AcceptInvite from "@/components/AcceptInvite";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!supabaseConfigured()) redirect("/");

  const db = await getServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  // Not signed in → send to login, returning here afterwards.
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <AcceptInvite token={token} email={user.email ?? ""} />
    </main>
  );
}
