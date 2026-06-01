import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/env";
import { getActiveContext, UnauthorizedError } from "@/lib/store-context";
import Settings from "@/components/settings/Settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Settings are a workspace (Supabase) feature; the keyless demo has none.
  if (!supabaseConfigured()) redirect("/");

  let ctx;
  try {
    ctx = await getActiveContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
  const org = await ctx.store.getOrgSettings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-50">Settings</h1>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {org.name} · you are {ctx.role}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-ink-500 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-slate-300 transition hover:border-accent/50 hover:text-accent"
        >
          ← Dashboard
        </Link>
      </header>

      <Settings
        role={ctx.role}
        me={ctx.userId}
        initialOrg={{ name: org.name, slug: org.slug }}
      />
    </div>
  );
}
