import Link from "next/link";

const NAV = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/api", label: "API reference" },
  { href: "/docs/sso", label: "SSO setup" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
      <aside>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">Docs</p>
        <nav className="flex flex-col gap-1 font-mono text-[12px]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-slate-400 hover:text-accent">
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <article className="max-w-2xl space-y-4 text-sm leading-relaxed text-slate-300 [&_code]:rounded [&_code]:bg-ink-700 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-50 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-100 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-ink-500/60 [&_pre]:bg-ink-800/60 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px]">
        {children}
      </article>
    </div>
  );
}
