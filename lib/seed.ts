import type {
  Battlecard,
  Company,
  ScanEvidence,
  Signal,
} from "./types";
import { id } from "./store";

// Hand-curated sample data. Drives the "Load demo" button so judges can see a
// fully populated dashboard without configuring Bright Data / Gemini keys.
// Numbers and quotes are illustrative — not scraped — so the experience is
// reproducible. Stories are believable and demo-friendly.

interface SeedBundle {
  companies: Company[];
  signals: Signal[];
  evidence: ScanEvidence[];
  battlecards: Battlecard[];
  scanId: string;
}

export function buildSeed(): SeedBundle {
  const now = new Date().toISOString();
  const scanId = id();

  const hubspotId = id();
  const clayId = id();
  const apolloId = id();

  const companies: Company[] = [
    {
      id: hubspotId,
      name: "HubSpot",
      domain: "hubspot.com",
      pricingUrl: "https://www.hubspot.com/pricing/marketing",
      renderJs: false,
      createdAt: now,
    },
    {
      id: clayId,
      name: "Clay",
      domain: "clay.com",
      pricingUrl: "https://www.clay.com/pricing",
      renderJs: false,
      createdAt: now,
    },
    {
      id: apolloId,
      name: "Apollo",
      domain: "apollo.io",
      pricingUrl: "https://www.apollo.io/pricing",
      renderJs: false,
      createdAt: now,
    },
  ];

  const sig = (
    companyId: string,
    companyName: string,
    s: Omit<Signal, "id" | "companyId" | "companyName" | "scanId" | "createdAt">,
  ): Signal => ({
    id: id(),
    companyId,
    companyName,
    scanId,
    createdAt: now,
    ...s,
  });

  const signals: Signal[] = [
    sig(hubspotId, "HubSpot", {
      type: "pricing",
      description: "Starter tier raised 60% ($45 → $72/mo) with seat caps tightened.",
      impact: "high",
      confidence: 0.92,
      opportunityScore: 88,
      reasoning:
        "HubSpot is repositioning upmarket. Their long-tail SMB base is now under-served and price-sensitive — a displacement window is opening for the next 60-90 days.",
      recommendedAction:
        "Launch a migration campaign targeting HubSpot Starter customers with a side-by-side cost comparison; lead with seat economics.",
      sourceUrl: "https://www.hubspot.com/pricing/marketing",
      quote:
        "Starter — $72/mo · 2 seats included · additional seats $25/mo (was $45/mo / 5 seats)",
    }),
    sig(hubspotId, "HubSpot", {
      type: "hiring",
      description: "12 open Enterprise AE / RevOps roles posted in the last 30 days.",
      impact: "medium",
      confidence: 0.81,
      opportunityScore: 71,
      reasoning:
        "Hiring pattern confirms the upmarket pivot. Enterprise GTM build-out leaves SMB coverage thinner — expect slower support response and renewal slippage on the existing low-tier book.",
      recommendedAction:
        "Time outbound to renewal windows; cite hiring data publicly as proof of de-prioritization.",
      sourceUrl: "https://www.hubspot.com/careers",
      quote:
        "We're hiring 12 roles across Enterprise Sales and RevOps — join us as we scale into the upmarket segment.",
    }),
    sig(hubspotId, "HubSpot", {
      type: "sentiment",
      description:
        "Reddit /r/sales: 4 posts in 2 weeks debating Starter price hike + switching costs.",
      impact: "medium",
      confidence: 0.74,
      opportunityScore: 65,
      reasoning:
        "Buyers are actively evaluating alternatives in public — this is buying intent, not idle complaint. The objection ('switching cost') tells you exactly what to defuse in outbound.",
      recommendedAction:
        "Run a paid ad on /r/sales targeting 'HubSpot alternative' with a free migration audit offer.",
      sourceUrl: "https://www.reddit.com/r/sales/",
      quote:
        "After the latest price hike our team is actively evaluating alternatives to HubSpot. Anyone switched recently?",
    }),
    sig(hubspotId, "HubSpot", {
      type: "messaging",
      description:
        "Homepage hero swapped from 'CRM for SMBs' to 'The enterprise customer platform'.",
      impact: "high",
      confidence: 0.95,
      opportunityScore: 79,
      reasoning:
        "Public positioning shift validates the upmarket move beyond just pricing. SMB-targeted messaging is gone — your sales motion can credibly claim 'HubSpot left this market'.",
      recommendedAction:
        "Update the comparison page and outbound script to lead with the positioning change as the headline 'why now'.",
      sourceUrl: "https://www.hubspot.com/",
      quote: "The enterprise customer platform — built for teams at scale.",
    }),

    sig(clayId, "Clay", {
      type: "product",
      description:
        "Launched 'Clay AI Researcher' agent — claims 10x faster prospect enrichment.",
      impact: "high",
      confidence: 0.87,
      opportunityScore: 82,
      reasoning:
        "Clay is doubling down on the agentic data layer — this both expands their TAM and exposes a roadmap gap for tools that don't have any AI agent surface. Differentiate on quality of reasoning, not just speed.",
      recommendedAction:
        "Ship a 'transparent reasoning' comparison demo; lead with explainability where Clay is a black box.",
      sourceUrl: "https://www.clay.com/blog/ai-researcher",
      quote:
        "Introducing Clay AI Researcher: autonomous prospect enrichment, now in beta — 10× faster than manual research.",
    }),
    sig(clayId, "Clay", {
      type: "funding",
      description: "Series C $46M led by Sequoia — pushing upmarket into enterprise.",
      impact: "medium",
      confidence: 0.96,
      opportunityScore: 60,
      reasoning:
        "Fresh capital + Sequoia signaling enterprise means Clay will burn for growth. Expect aggressive discounting on multi-year contracts — short-term competitive pressure, but their land motion will fragment.",
      recommendedAction:
        "Lock in 2-year terms with strategic accounts now before Clay can underbid.",
      sourceUrl: "https://techcrunch.com/clay-series-c",
      quote:
        "Clay announces $46M Series C led by Sequoia — funding will accelerate enterprise GTM and AI agent development.",
    }),

    sig(apolloId, "Apollo", {
      type: "sentiment",
      description: "G2 reviews: data quality complaints up 38% QoQ.",
      impact: "high",
      confidence: 0.83,
      opportunityScore: 86,
      reasoning:
        "Data quality is Apollo's core value prop — when that erodes, every renewal is contestable. The exact phrasing in reviews ('bounce rate') gives you the wedge in outbound.",
      recommendedAction:
        "Build a 'send us 100 Apollo leads, we'll verify free' campaign; publish the bounce rate delta.",
      sourceUrl: "https://www.g2.com/products/apollo-io/reviews",
      quote:
        "Bounce rate on Apollo lists has gotten noticeably worse this quarter — we're paying for data we can't use.",
    }),
    sig(apolloId, "Apollo", {
      type: "intent",
      description:
        "'Apollo alternatives' Google search volume +52% MoM (per SERP intent signals).",
      impact: "high",
      confidence: 0.78,
      opportunityScore: 84,
      reasoning:
        "Search-intent acceleration paired with the G2 sentiment drop = a tight cohort actively shopping right now. Catch them in the 2-week eval window with a free comparison.",
      recommendedAction:
        "Bid on 'Apollo alternative' / 'Apollo competitor' SEM with a calculator landing page.",
      sourceUrl: "https://www.google.com/search?q=apollo+alternatives",
      quote:
        "Top searches: 'apollo alternative', 'apollo vs ...', 'replacing apollo io' — all up double-digits this month.",
    }),
    sig(apolloId, "Apollo", {
      type: "risk",
      description: "GDPR complaint filed in DE — data sourcing dispute under review.",
      impact: "medium",
      confidence: 0.62,
      opportunityScore: 58,
      reasoning:
        "Regulatory friction in EU is a deal-killer for security-conscious enterprise buyers. Even before a ruling, procurement will pause Apollo in regulated verticals.",
      recommendedAction:
        "Equip AEs with a one-pager on your DPA + lawful basis; target EU-headquartered prospects with active Apollo contracts.",
      sourceUrl: "https://noyb.eu/en/",
      quote:
        "noyb files complaint against Apollo over allegedly unlawful B2B contact data processing in the EU.",
    }),
  ];

  const sources = (domain: string, pricingUrl: string) => [
    { url: pricingUrl, pageType: "pricing" as const },
    { url: `https://${domain}/`, pageType: "homepage" as const },
  ];

  const evidence: ScanEvidence[] = [
    {
      scanId,
      companyId: hubspotId,
      changeSummary:
        "ADDED lines:\n  Starter — $72/mo · 2 seats included\n  The enterprise customer platform — built for teams at scale.\nREMOVED lines:\n  Starter — $45/mo · 5 seats included\n  CRM for SMBs that need to grow",
      serp: [
        {
          title: "We're leaving HubSpot — pricing got out of control (r/sales)",
          link: "https://www.reddit.com/r/sales/",
          snippet:
            "After the latest price hike our team is actively evaluating alternatives to HubSpot.",
        },
        {
          title: "HubSpot raises prices, repositions for enterprise — TechCrunch",
          link: "https://techcrunch.com/hubspot-upmarket",
          snippet:
            "HubSpot's Starter tier is up 60%; CMO confirms the SMB-first era is over.",
        },
      ],
      sources: sources("hubspot.com", "https://www.hubspot.com/pricing/marketing"),
      createdAt: now,
    },
    {
      scanId,
      companyId: clayId,
      changeSummary:
        "ADDED lines:\n  Introducing Clay AI Researcher — autonomous prospect enrichment\n  $46M Series C led by Sequoia",
      serp: [
        {
          title: "Clay launches AI Researcher agent",
          link: "https://www.clay.com/blog/ai-researcher",
          snippet:
            "Clay AI Researcher: autonomous prospect enrichment, 10× faster than manual research.",
        },
        {
          title: "Clay raises $46M Series C — Sequoia leads",
          link: "https://techcrunch.com/clay-series-c",
          snippet: "Funding will accelerate enterprise GTM and AI agent development.",
        },
      ],
      sources: sources("clay.com", "https://www.clay.com/pricing"),
      createdAt: now,
    },
    {
      scanId,
      companyId: apolloId,
      changeSummary: null,
      serp: [
        {
          title: "Apollo reviews — data quality slipping (G2)",
          link: "https://www.g2.com/products/apollo-io/reviews",
          snippet:
            "Bounce rate on Apollo lists has gotten noticeably worse this quarter.",
        },
        {
          title: "noyb files GDPR complaint over Apollo data sourcing",
          link: "https://noyb.eu/en/",
          snippet:
            "Complaint against Apollo over allegedly unlawful B2B contact data processing in the EU.",
        },
      ],
      sources: sources("apollo.io", "https://www.apollo.io/pricing"),
      createdAt: now,
    },
  ];

  const battlecards: Battlecard[] = [
    {
      id: id(),
      companyId: hubspotId,
      companyName: "HubSpot",
      markdown: `## Why we win
- Their Starter tier just jumped **60%** — your seat economics now read 30–40% lower at SMB volume.
- HubSpot has publicly repositioned as "the enterprise customer platform" — they've conceded the under-50-seat market in their own copy.
- Your time-to-value is hours; theirs is weeks of onboarding services.

## Their weaknesses right now
- Hiring 12 enterprise roles in 30 days means SMB support coverage will degrade — cite this in renewal conversations.
- Public sentiment on r/sales is already searching for alternatives: "actively evaluating alternatives to HubSpot."
- Switching cost is the only real moat — kill it with a free migration audit.

## Objection handling
- *"But HubSpot is the safe choice."* → "Safe at $72/seat? Their CMO just confirmed the SMB-first era is over."
- *"We've built workflows in HubSpot."* → "We'll port them in two weeks, free. Here's how the last three customers did it."
- *"What about reporting parity?"* → Side-by-side report walkthrough; ours ships from day one.

## Outbound angle
**Subject:** HubSpot just raised your Starter bill 60% — here's the math

Saw HubSpot pushed Starter to $72/seat last week and reduced seats from 5 → 2. For a 10-person team that's a ~$5K/yr jump for the same product. We've moved 14 ex-HubSpot teams in the last 90 days at half the cost. Want a 15-min walkthrough of the diff?
`,
      createdAt: now,
    },
  ];

  return { companies, signals, evidence, battlecards, scanId };
}
