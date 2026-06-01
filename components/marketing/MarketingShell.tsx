import Link from "next/link";

// Shared chrome (nav + footer) for the public marketing site + docs, and the
// logged-out landing at "/". Server component — no client JS needed.
export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-900 text-slate-200">
      <header className="border-b border-ink-500/40">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-50">
            <span className="text-accent">◢</span> Shadow GTM
          </Link>
          <div className="flex items-center gap-5 font-mono text-[12px] uppercase tracking-wider text-slate-400">
            <Link href="/features" className="hover:text-accent">Features</Link>
            <Link href="/pricing" className="hover:text-accent">Pricing</Link>
            <Link href="/docs" className="hover:text-accent">Docs</Link>
            <Link
              href="/login"
              className="rounded-lg bg-accent px-3 py-1.5 font-bold text-ink-900 transition hover:brightness-110"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>

      <footer className="border-t border-ink-500/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 font-mono text-[11px] uppercase tracking-widest text-slate-600">
          <span>Shadow GTM · autonomous GTM intelligence</span>
          <span className="flex gap-4">
            <Link href="/about" className="hover:text-accent">About</Link>
            <Link href="/terms" className="hover:text-accent">Terms</Link>
            <Link href="/privacy" className="hover:text-accent">Privacy</Link>
            <Link href="/dpa" className="hover:text-accent">DPA</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
