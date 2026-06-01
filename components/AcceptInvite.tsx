"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | { kind: "working" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export default function AcceptInvite({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "working" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // accept exactly once
    ran.current = true;
    (async () => {
      try {
        const res = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        setState({ kind: "ok" });
      } catch (e) {
        setState({ kind: "error", message: (e as Error).message });
      }
    })();
  }, [token]);

  return (
    <div className="w-full max-w-sm rounded-lg border border-ink-500/60 bg-ink-800/80 p-8 text-center shadow-2xl">
      <div className="mb-4 font-mono text-lg font-semibold tracking-tight text-slate-100">
        ◢ Shadow GTM
      </div>

      {state.kind === "working" && (
        <p className="text-sm text-slate-400">
          Accepting your invitation as <span className="text-slate-200">{email}</span>…
        </p>
      )}

      {state.kind === "ok" && (
        <>
          <p className="mb-4 text-sm text-accent">You&apos;ve joined the workspace.</p>
          <button
            onClick={() => {
              router.replace("/");
              router.refresh();
            }}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110"
          >
            Go to dashboard
          </button>
        </>
      )}

      {state.kind === "error" && (
        <>
          <p className="mb-4 text-sm text-signal-high">{state.message}</p>
          <button
            onClick={() => {
              router.replace("/");
              router.refresh();
            }}
            className="w-full rounded-lg border border-ink-500 px-3 py-2 text-sm text-slate-300 transition hover:border-accent/50 hover:text-accent"
          >
            Continue to dashboard
          </button>
        </>
      )}
    </div>
  );
}
