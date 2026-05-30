"use client";

import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/db/browser";

// Thin top bar above the dashboard: shows the active workspace + signed-in user
// and a sign-out control. Rendered by the server shell (app/page.tsx) only when
// auth is active.
export default function AccountBar({
  email,
  orgName,
}: {
  email: string;
  orgName: string;
}) {
  const router = useRouter();

  async function signOut() {
    await getBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-3 border-b border-neutral-900 bg-neutral-950 px-4 py-2 text-xs text-neutral-500">
      <span className="font-mono text-neutral-400">{orgName}</span>
      <span className="text-neutral-700">·</span>
      <span>{email}</span>
      <button
        onClick={signOut}
        className="rounded border border-neutral-800 px-2 py-1 text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100"
      >
        Sign out
      </button>
    </div>
  );
}
