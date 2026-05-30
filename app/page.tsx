import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import AccountBar from "@/components/AccountBar";
import { supabaseConfigured } from "@/lib/env";
import { getServerClient } from "@/lib/db/server";
import { ensureActiveOrg } from "@/lib/store-context";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Keyless local demo: no auth, single-tenant JSON store.
  if (!supabaseConfigured()) return <Dashboard />;

  const db = await getServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  // First visit provisions a default workspace; later visits resolve it.
  const orgId = await ensureActiveOrg();
  const { data: org } = await db
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  return (
    <>
      <AccountBar email={user.email ?? ""} orgName={org?.name ?? "Workspace"} />
      <Dashboard />
    </>
  );
}
