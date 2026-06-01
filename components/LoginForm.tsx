"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/db/browser";
import { domainFromEmail, ssoEnabled } from "@/lib/auth/sso";

type Mode = "signin" | "signup";

/** Where to land after auth. Honors a ?next= param but only same-origin
 *  relative paths (no "//" protocol-relative escapes), defaulting to "/". */
function postLoginDest(): string {
  if (typeof window === "undefined") return "/";
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = getBrowserClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is on, there's no session yet.
        if (!data.session) {
          setNotice("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // Session is set in cookies — refresh so the server shell picks it up.
      router.replace(postLoginDest());
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithSSO() {
    setError(null);
    const domain = domainFromEmail(email);
    if (!domain) {
      setError("Enter your work email to sign in with SSO.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await getBrowserClient().auth.signInWithSSO({ domain });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-950/80 p-8 shadow-2xl">
      <div className="mb-6">
        <div className="font-mono text-lg font-semibold tracking-tight text-neutral-100">
          ◢ Shadow GTM
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === "signin" ? "Sign in to your workspace" : "Create your workspace"}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-600"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-600"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      {ssoEnabled() && (
        <div className="mt-3">
          <button
            type="button"
            onClick={signInWithSSO}
            disabled={busy}
            className="w-full rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-50"
          >
            Sign in with SSO
          </button>
          <p className="mt-1 text-center text-[11px] text-neutral-600">
            Uses your work email&apos;s identity provider (Enterprise).
          </p>
        </div>
      )}

      <button
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
          setNotice(null);
        }}
        className="mt-4 w-full text-center text-xs text-neutral-500 hover:text-neutral-300"
      >
        {mode === "signin"
          ? "No account? Create one"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
