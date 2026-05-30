# Shadow GTM — lablab.ai Submission Fields

Copy-paste straight into the submission form.

---

## Project Title
**Shadow GTM**

## Short Description (one line)
Autonomous AI agents that monitor the live web via Bright Data and turn
competitor movement into ranked, explained GTM plays.

## Long Description

**The problem.** Every go-to-market team runs on market knowledge — competitor
pricing, hiring, product launches, customer sentiment, buying intent. That
intelligence already lives on the public web, but it's fragmented, unstructured,
constantly changing, and locked behind anti-bot systems. So revenue teams
research it manually: late, shallow, and at a fraction of the real coverage.

**The solution.** Shadow GTM is an autonomous intelligence agent that watches
competitors on the live web and turns what it finds into action. The whole
product runs on one loop: **live signal → AI reasoning → a play a rep can run
today.** Add competitors to a watchlist and run a scan; the feed fills in live
with ranked, explained signals, a competitor matrix, prioritized plays, and
one-click sales battlecards. Its "War Room" turns a directive like *"Attack
HubSpot in the SMB market"* into a full, signal-grounded attack plan.

**How Bright Data is used (3 products).**
- **Web Unlocker** fetches competitor pricing and site pages past bot detection.
- **SERP API** pulls structured news, reviews, and buying-intent search results.
- **Scraping Browser** renders JS-heavy / interactive sites (e.g. LinkedIn) over CDP.
Each scan diffs a competitor's page against the previous run to detect *what
changed*, then feeds everything to the model.

**How the AI is used.** Google's Gemini (`gemini-2.5-flash`) extracts discrete,
typed, scored signals **and** reasons about why each one matters — the
second-order implication and the recommended play — in a single
structured-output pass (`responseSchema`). Battlecards and War Room plans are
streamed on demand.

**Why it's different.** Most tools summarize or scrape. Shadow GTM *reasons and
acts*: it explains why a change matters, scores the opportunity, and hands the
rep a concrete next move. Autonomous, live, and reasoning-first — not a chatbot,
not a static dashboard.

**Business value.** Directly impacts pipeline, win rate, and outbound conversion
for B2B SaaS sales/RevOps teams, agencies, and investor research. A live,
autonomous take on the category occupied by ZoomInfo, Gong, Clay, and AlphaSense.

Built in 5 days as a Next.js full-stack app. MIT-licensed.

## Technology & Category Tags
AI Agents · GTM Intelligence · Competitive Intelligence · Sales Intelligence ·
Bright Data · Web Unlocker · SERP API · Scraping Browser · Gemini ·
Google AI · Next.js · TypeScript · Real-time Web Data

## Links
- **GitHub:** https://github.com/rogerdemello/shadow-gtm
- **Demo URL:** _(add after deploy — Vercel works out of the box; data is per-session unless a DB is wired)_
- **Video:** _(add link — script in `docs/DEMO_SCRIPT.md`)_

## Assets in this repo
- **Cover image:** `docs/cover.svg` (open in a browser → screenshot to export PNG/JPG).
- **Pitch deck:** `docs/deck.html` (present in-browser, arrow-key nav) — outline in `docs/SLIDES.md`.

## Bright Data Requirement
✅ Uses three Bright Data products — **Web Unlocker, SERP API, and Scraping
Browser** — all in `lib/brightdata.ts`, driven by `lib/workflow.ts`.
