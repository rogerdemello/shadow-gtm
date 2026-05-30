# Shadow GTM — Pitch Deck Outline

10 slides, ~3 minutes. Each slide notes the **judging criterion** it scores.
Judging: *Application of Technology · Presentation · Business Value · Originality.*

---

### 1 — Title
- **Shadow GTM**
- Tagline: *"Autonomous web intelligence for revenue teams."*
- One-liner: *We turn the live web into a real-time GTM intelligence layer —
  and prove every claim with a verbatim quote.*
- Team name · Web Data UNLOCKED Hackathon · Track 1: GTM Intelligence.

### 2 — The Problem  *(Business Value)*
- GTM teams run on market knowledge — and waste hours hand-researching
  competitors, pricing, hiring, reviews, news.
- The intelligence already exists on the web. But it's **fragmented,
  unstructured, constantly changing, and blocked by anti-bot systems**.
- And every "AI competitive intel" tool today asks you to **trust a black box.**

### 3 — The Insight
- **Bright Data solves access. Gemini solves interpretation.**
- One loop: **live signal → AI reasoning → a play a rep can run today —
  with a quote from the source.**
- Big visual of the pipeline.

### 4 — What It Is  *(Presentation)*
- An autonomous agent that watches competitors 24/7 and surfaces **actionable,
  auditable signals** — not summaries, not a black box.
- Five moments: **Live signal feed · Evidence panel · Competitor matrix ·
  Streaming battlecards · War Room.**
- Screenshot of the dark "war-room" dashboard.

### 5 — Live Demo
- Cut to the 90-second demo (see `DEMO_SCRIPT.md`).
- Open with **✦ Try with demo data** → click a signal → **Evidence** → stream
  a **Battlecard** → close on **War Room**.

### 6 — How It Works  *(Application of Technology — the Bright Data slide)*
- Diagram: **Live web → Bright Data → diff vs last scan → Gemini → ranked plays
  + verbatim quotes.**
- **Bright Data (required, 3 products):**
  - **Web Unlocker** — competitor pricing + homepage, past bot detection.
  - **SERP API** — structured news / reviews / buying-intent search.
  - **Scraping Browser** — JS-heavy/interactive sites (e.g. LinkedIn) via CDP.
- **Gemini (`gemini-2.5-flash`)** — structured signal extraction (typed + scored
  + quoted) *and* strategic reasoning, in one pass; battlecards and war-room
  plans **stream** via `generateContentStream` over Server-Sent Events.

### 7 — Why It's Different  *(Originality)*
- Most hackathon tools **summarize or scrape**. Shadow GTM **reasons, acts,
  and proves it.**
- The differentiators:
  - **Evidence panel** — every signal carries a verbatim quote + the SERP
    context + the diff vs. last scan. AI cannot hand-wave.
  - **"Why it matters" + opportunity score** — second-order implications, not
    restatements.
  - **Streaming outputs** — battlecards and war-room plans render token-by-token.
  - **War Room mode** — operator directive → executable attack plan.
- Autonomous + live + reasoning-driven + auditable — not a chatbot, not a dashboard.

### 8 — Business Value  *(Business Value)*
- Impacts pipeline, win rate, outbound conversion, competitive readiness.
- Buyers: B2B SaaS sales / RevOps, agencies, PE & investor research.
- Category neighbors: ZoomInfo, Gong, Clay, AlphaSense, SimilarWeb — but
  autonomous, live, reasoning-first, **and the only one that shows its work.**
- Output: ranked plays, streaming battlecards, **one-click Markdown brief**
  exported every Friday.
- Pricing sketch: Startup $99 · Growth $499 · Enterprise $5k+/mo.

### 9 — Built in 5 Days
- Next.js 16 full-stack · Gemini (`@google/genai`, structured outputs +
  streaming) · Bright Data (3 products) · SSE everywhere (scan, battlecard,
  war room) · zero-DB swappable persistence.
- Production-shaped: typed end-to-end, graceful failure, deployable.
- Public repo + live demo URL.

### 10 — Vision & Ask
- "Bloomberg Terminal for GTM" — every B2B company needs live, **auditable**
  competitive intel.
- Roadmap: CRM/Slack actions, GTM memory graph, autonomous outreach.
- Ask: **Bright Data AI Startup Program** to keep building on production infra.

---

**Design:** dark, terminal/Bloomberg aesthetic to match the product. Real
screenshots over stock art. One idea per slide. Let the demo carry the middle.
