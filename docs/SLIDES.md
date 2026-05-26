# Shadow GTM — Pitch Deck Outline

10 slides, ~3 minutes. Each slide notes the **judging criterion** it scores.
Judging: *Application of Technology · Presentation · Business Value · Originality.*

---

### 1 — Title
- **Shadow GTM**
- Tagline: *"Autonomous web intelligence for revenue teams."*
- One-liner: *We turn the live web into a real-time GTM intelligence layer.*
- Team name · Web Data UNLOCKED Hackathon · Track 1: GTM Intelligence.

### 2 — The Problem  *(Business Value)*
- GTM teams run on market knowledge — and waste hours hand-researching
  competitors, pricing, hiring, reviews, news.
- The intelligence already exists on the web. But it's **fragmented,
  unstructured, constantly changing, and blocked by anti-bot systems**.
- So it's done manually, late, and at a fraction of the coverage.

### 3 — The Insight
- **Bright Data solves access. Claude solves interpretation.**
- One loop: **live signal → AI reasoning → a play a rep can run today.**
- Big visual of the pipeline.

### 4 — What It Is  *(Presentation)*
- An autonomous agent that watches competitors 24/7 and surfaces **actionable
  signals**, not summaries.
- Four moments: **Live signal feed · Competitor matrix · Ranked plays · War Room.**
- Screenshot of the dark "war-room" dashboard.

### 5 — Live Demo
- Cut to the 90-second demo (see `DEMO_SCRIPT.md`).
- End on War Room generating an attack plan.

### 6 — How It Works  *(Application of Technology — the Bright Data slide)*
- Diagram: **Live web → Bright Data → diff vs last scan → Claude → ranked plays.**
- **Bright Data (required, 3 products):**
  - **Web Unlocker** — competitor pricing/site pages, past bot detection.
  - **SERP API** — structured news / reviews / buying-intent search.
  - **Scraping Browser** — JS-heavy/interactive sites (e.g. LinkedIn) via CDP.
- **Claude (`claude-opus-4-7`)** — structured signal extraction (typed + scored)
  *and* strategic reasoning, in one pass; prompt-cached system prompts.

### 7 — Why It's Different  *(Originality)*
- Most hackathon tools **summarize or scrape**. Shadow GTM **reasons and acts.**
- The differentiator is the **"why it matters"** layer + an **opportunity score**
  + a concrete play — and **War Room mode** that turns a directive into a battle plan.
- Autonomous + live + reasoning-driven — not a chatbot, not a dashboard.

### 8 — Business Value  *(Business Value)*
- Impacts pipeline, win rate, outbound conversion, competitive readiness.
- Buyers: B2B SaaS sales / RevOps, agencies, PE & investor research.
- Category neighbors: ZoomInfo, Gong, Clay, AlphaSense, SimilarWeb — but
  autonomous, live, and reasoning-first.
- Pricing sketch: Startup $99 · Growth $499 · Enterprise $5k+/mo.

### 9 — Built in 5 Days
- Next.js 16 full-stack · Claude (`@anthropic-ai/sdk`, structured outputs) ·
  Bright Data (3 products) · live SSE scan feed.
- Production-shaped: typed, swappable persistence, graceful failure, deployable.
- Public repo + live demo URL.

### 10 — Vision & Ask
- "Bloomberg Terminal for GTM" — every B2B company needs live competitive intel.
- Roadmap: CRM/Slack actions, GTM memory graph, autonomous outreach.
- Ask: **Bright Data AI Startup Program** to keep building on production infra.

---

**Design:** dark, terminal/Bloomberg aesthetic to match the product. Real
screenshots over stock art. One idea per slide. Let the demo carry the middle.
