# ◢ Shadow GTM

**Autonomous web intelligence for revenue teams.** Shadow GTM watches the live
web through [Bright Data](https://brightdata.com), reasons over what it finds
with Google's Gemini, and turns competitor movement into **ranked, explained GTM plays** —
not another summarizer, an analyst.

> Built for the **Web Data UNLOCKED Hackathon** (Bright Data × lablab.ai) —
> Track 1: GTM Intelligence.

The one loop the whole product runs on:

```
live web (Bright Data) → diff vs last scan → AI signals + reasoning → ranked play
```

Most tools tell you *"Competitor raised prices."* Shadow GTM tells you
*"Competitor raised Starter 60% → moving upmarket → their SMB base is now
under-served → launch a migration campaign this week,"* with an opportunity
score and a one-click battlecard.

---

## What it does

- **Watchlist** of competitors (add by name + domain).
- **Run intelligence scan** — for each competitor, in a live-updating feed:
  - fetches the **pricing page _and_ homepage** through **Bright Data Web Unlocker**,
  - pulls live news / reviews / hiring / intent chatter through **Bright Data SERP API**,
  - diffs each page against the previous scan to surface *what changed*,
  - asks Gemini to extract discrete **signals** (pricing, product, hiring,
    sentiment, funding, messaging, intent, risk) and — the differentiator —
    **reason about why each one matters** and what play to run.
- **Auditable evidence** — every signal carries a **verbatim quote** from the
  source. Click any signal to open an Evidence panel showing the quote, the
  change summary, the SERP results, and the exact URLs we monitored. The AI
  can't hand-wave; if there's no quote, there's no signal.
- **Competitor matrix** — signal density + momentum per competitor.
- **AI recommended plays** — every signal ranked by opportunity score.
- **Streaming battlecards** — one click and Gemini streams a Markdown sales
  battlecard (why we win / their weaknesses / objection handling / outbound
  angle) token-by-token into the dashboard.
- **Streaming War Room** — type an attack directive ("Attack HubSpot in the
  SMB market") and Gemini streams a full attack plan from the live signals:
  thesis, exploitable weaknesses, pricing/positioning gaps, who to hit first,
  a 30-day campaign, and an outbound opener.
- **One-click demo** — hit *✦ Try with demo data* on an empty dashboard to
  load a curated bundle (HubSpot / Clay / Apollo with 9 hand-crafted signals,
  evidence, and a pre-baked battlecard). No keys required to explore the UI.

## Bright Data integration (required)

| Product | Where it's used |
|---|---|
| **Web Unlocker** | `lib/brightdata.ts → fetchPage()` — fetches competitor pricing/site pages, bypassing bot detection. Default fetch path. |
| **SERP API** | `lib/brightdata.ts → serpSearch()` — structured Google results (`brd_json`) for buying-intent / news signals. |
| **Scraping Browser** | `lib/brightdata.ts → fetchPageRendered()` — full Chrome rendering over CDP (`puppeteer-core`) for JS-heavy / interactive sites (e.g. LinkedIn). Mark a competitor **"JS-heavy"** in the UI to route it here. |

Web Unlocker + SERP API go through Bright Data's unified API endpoint
(`https://api.brightdata.com/request`) with a named zone — no proxy/TLS plumbing.
Scraping Browser connects to a remote Chrome over a WebSocket CDP endpoint.

## Tech

- **Next.js 16** (App Router, TypeScript) — UI + API routes, one deployable app.
- **Gemini** via `@google/genai` — `gemini-2.5-flash` by default. Signal
  extraction uses **structured outputs** (`responseSchema` + Zod validation) so
  every signal is typed, ranked, and carries a verbatim quote. Battlecards and
  War Room plans are **streamed** via `generateContentStream()` and piped to the
  client as Server-Sent Events.
- **Tailwind CSS** — dark "war-room" terminal UI.
- **Zero-DB persistence** — a small JSON store (`lib/store.ts`) behind a clean
  interface, so swapping in Postgres/Turso for production is a one-file change.

---

## Run it

```bash
npm install
cp .env.local.example .env.local   # then fill in your keys (see below)
npm run dev                         # http://localhost:3000
```

### Keys & Bright Data zones

In `.env.local`:

```ini
BRIGHTDATA_API_TOKEN=...        # Bright Data dashboard → Account settings → API tokens
BRIGHTDATA_UNLOCKER_ZONE=web_unlocker1   # name of your Web Unlocker zone
BRIGHTDATA_SERP_ZONE=serp_api1           # name of your SERP API zone
BRIGHTDATA_BROWSER_WS=wss://...          # Scraping Browser CDP endpoint (optional)
GEMINI_API_KEY=...                       # Google AI Studio → https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.5-flash            # gemini-2.5-pro for deeper reasoning (slower)
GEMINI_THINKING_BUDGET=                  # optional token cap; 0 disables thinking
```

Create the zones in the Bright Data dashboard (Proxies & Scraping Infra →
add a **Web Unlocker** zone and a **SERP API** zone) and put their names above.
For the SERP zone, make sure JSON parsing (`brd_json`) is available. Optionally
add a **Scraping Browser** zone and paste its `wss://…` connection string into
`BRIGHTDATA_BROWSER_WS` to render JS-heavy sites.

### Mock mode (no keys / offline)

Set `SHADOW_GTM_MOCK=1` (or just leave `BRIGHTDATA_API_TOKEN` empty) to run scans
against built-in sample pages — useful for UI work without spending credits. The
Gemini call still needs `GEMINI_API_KEY`.

---

## Demo script (≈90s)

1. Land on the empty dashboard → hit **✦ Try with demo data**. Three
   competitors and a curated feed appear in under a second.
2. Click any signal → the **Evidence panel** opens with the verbatim quote
   from the source, the diff vs. the previous scan, the SERP results, and the
   exact URLs Bright Data fetched. *The intelligence is auditable.*
3. Hit **Run intelligence scan** — Bright Data fetches each competitor's
   pricing **and** homepage; results stream in live as Gemini reasons.
4. Show the **AI recommended plays** ranked by opportunity score.
5. Click **Battlecard** on a competitor → watch Gemini **stream** the sales
   enablement Markdown directly into the dashboard.
6. Open **⚔ War Room**, type *"Attack HubSpot in the SMB market"* → a full,
   signal-grounded attack plan **streams in** token-by-token. (The closer.)

## Repo layout

```
app/
  page.tsx                 # renders the dashboard
  api/
    state/                 # hydrate dashboard (companies, signals, config)
    companies/             # add / list / remove watchlist
    scan/stream/           # live SSE scan — streams the feed in as each company completes
    battlecard/            # streamed battlecard generation (SSE) + stored-card fetch
    warroom/               # streamed attack-plan generation (SSE)
    evidence/              # per-company evidence (sources, SERP, change summary)
    seed/                  # one-click demo data
components/                # dashboard, feed, matrix, recs, battlecard, war room, evidence
lib/
  brightdata.ts            # Bright Data: Web Unlocker + SERP API + Scraping Browser
  ai.ts                    # Gemini: structured signal extraction + streamed outputs
  workflow.ts              # the core scan loop (collect → diff → reason → store)
  store.ts                 # JSON persistence behind a swappable interface
  sse.ts                   # client-side POST-SSE parser
  seed.ts                  # curated demo bundle
  html.ts / mock.ts / ui.ts / types.ts
```

## Deploy

Deploys to Vercel as-is — on Vercel the JSON store writes to `/tmp` (the project
filesystem is read-only there), which persists within a warm instance: fine for a
live demo session. For durable persistence across serverless invocations, swap the
JSON store in `lib/store.ts` for a hosted DB (Neon/Turso/Vercel Postgres) — every
read/write already goes through that one module.

## Submission materials

- [`docs/deck.html`](docs/deck.html) — **presentable pitch deck** (open in a browser, arrow-key nav; present live or screen-record).
- [`docs/SLIDES.md`](docs/SLIDES.md) — the deck outline, mapped to judging criteria.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — 90-second demo script with timing.
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md) — ready-to-paste title / descriptions / tags.
- [`docs/cover.svg`](docs/cover.svg) — **cover image** (open in a browser → screenshot to export PNG/JPG for the lablab cover upload).

---

MIT — see [`LICENSE`](LICENSE).
