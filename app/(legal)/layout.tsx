import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="font-mono text-sm font-bold text-slate-100">
          ◢ Shadow GTM
        </Link>
        <nav className="flex gap-4 font-mono text-[11px] uppercase tracking-wider text-slate-500">
          <Link href="/terms" className="hover:text-accent">Terms</Link>
          <Link href="/privacy" className="hover:text-accent">Privacy</Link>
          <Link href="/dpa" className="hover:text-accent">DPA</Link>
        </nav>
      </header>
      <article className="prose-invert space-y-4 text-sm leading-relaxed text-slate-300 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-slate-50 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-100">
        {children}
      </article>
    </div>
  );
}
