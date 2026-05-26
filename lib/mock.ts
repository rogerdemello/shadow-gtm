// Offline fallback data so the UI + LLM pipeline run without Bright Data creds
// (set SHADOW_GTM_MOCK=1). Live mode uses lib/brightdata.ts instead.

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Prices drift a little each scan so "what changed since last scan?" has
// something to detect during an offline demo.
function jitterPrice(base: number): number {
  const bump = Math.floor(Date.now() / 60_000) % 3; // changes each minute
  return base + bump * 10;
}

export function mockPage(url: string): string {
  const d = domainOf(url);
  const name = d.split(".")[0];
  const starter = jitterPrice(49);
  const pro = jitterPrice(99);
  return `<!doctype html><html><head><title>${name} — Pricing</title></head><body>
    <header><nav>Product Pricing Customers Docs Careers</nav></header>
    <main>
      <h1>Plans that scale with ${name}</h1>
      <section>
        <h2>Starter</h2><p>$${starter}/mo — for small teams getting started.</p>
        <h2>Pro</h2><p>$${pro}/mo — advanced automation and analytics.</p>
        <h2>Enterprise</h2><p>Custom — SSO, dedicated support, security review.</p>
      </section>
      <section>
        <h3>New</h3>
        <p>Introducing AI Agents for ${name}: autonomous workflows now in beta.</p>
      </section>
      <footer>We're hiring 12 roles across Enterprise Sales and RevOps.</footer>
    </main>
  </body></html>`;
}

export function mockSerp(query: string) {
  const q = query.toLowerCase();
  const subject = q.replace(/alternatives|reviews|pricing|news|funding|to /g, "").trim();
  return [
    {
      title: `We're leaving ${subject} — pricing got out of control (r/sales)`,
      link: "https://www.reddit.com/r/sales/comments/example",
      snippet:
        `After the latest price hike our team is actively evaluating alternatives to ${subject}. Anyone switched recently?`,
    },
    {
      title: `${subject} raises Series C to push upmarket into enterprise`,
      link: "https://techcrunch.com/example",
      snippet:
        `${subject} announced new enterprise tier and is repositioning away from SMB customers.`,
    },
    {
      title: `${subject} reviews: support response times slipping (G2)`,
      link: "https://www.g2.com/products/example/reviews",
      snippet:
        `Recent reviewers report slower support and rising costs after renewal for ${subject}.`,
    },
  ];
}
