# ◢ Shadow GTM

**Autonomous web intelligence for revenue teams.** Shadow GTM watches the live
web through [Bright Data](https://brightdata.com), reasons over what it finds
with Claude, and turns competitor movement into **ranked, explained GTM plays** —
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
  - fetches its pricing/site page through **Bright Data Web Unlocker**,
  - pulls live news / reviews / hiring / intent chatter through **Bright Data SERP API**,
  - diffs the page against the previous scan to surface *what changed*,
  - asks Claude to extract discrete **signals** (pricing, product, hiring,
    sentiment, funding, messaging, intent, risk) and — the differentiator —
    **reason about why each one matters** and what play to run.
- **Competitor matrix** — signal density + momentum per competitor.
- **AI recommended plays** — every signal ranked by opportunity score.
- **Battlecards** — one click turns a competitor's signals into a Markdown sales
  battlecard (why we win / their weaknesses / objection handling / outbound angle).
- **War Room** — type an attack directive ("Attack HubSpot in the SMB market")
  and Claude turns the live signals into an executable plan: thesis, exploitable
  weaknesses, pricing/positioning gaps, who to hit first, a 30-day campaign, and
  an outbound opener.

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
- **Claude** via `@anthropic-ai/sdk` — `claude-opus-4-7` by default. Signal
  extraction uses **structured outputs** (`messages.parse` + Zod) so every signal
  is typed and ranked; battlecards use a second free-text call. System prompts are
  cache-friendly (`cache_control`).
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
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-opus-4-7          # claude-sonnet-4-6 is ~2x faster for live demos
ANTHROPIC_EFFORT=medium                  # low | medium | high | max
```

Create the zones in the Bright Data dashboard (Proxies & Scraping Infra →
add a **Web Unlocker** zone and a **SERP API** zone) and put their names above.
For the SERP zone, make sure JSON parsing (`brd_json`) is available. Optionally
add a **Scraping Browser** zone and paste its `wss://…` connection string into
`BRIGHTDATA_BROWSER_WS` to render JS-heavy sites.

### Mock mode (no keys / offline)

Set `SHADOW_GTM_MOCK=1` (or just leave `BRIGHTDATA_API_TOKEN` empty) to run scans
against built-in sample pages — useful for UI work without spending credits. The
Claude call still needs `ANTHROPIC_API_KEY`.

---

## Demo script (≈90s)

1. Add competitors (preset chips: HubSpot, Clay, Apollo, Gong).
2. Hit **Run intelligence scan** — watch signals stream into the live feed as
   Bright Data fetches each site and Claude reasons over it.
3. Point at a signal's **"why it matters"** line — that's the intelligence, not
   the scrape.
4. Show the **AI recommended plays** ranked by opportunity score.
5. Click **Battlecard** on a competitor → live-generated sales enablement.
6. Open **⚔ War Room**, type *"Attack HubSpot in the SMB market"* → a full,
   signal-grounded attack plan. (The closer.)

## Repo layout

```
app/
  page.tsx                 # renders the dashboard
  api/
    state/                 # hydrate dashboard (companies, signals, config)
    companies/             # add / list / remove watchlist
    scan/                  # start a scan + per-company scan
    battlecard/            # generate / fetch battlecards
    warroom/               # generate an attack plan from live signals
components/                # dashboard, feed, matrix, recommendations, battlecard, war room
lib/
  brightdata.ts            # Bright Data: Web Unlocker + SERP API + Scraping Browser
  ai.ts                    # Claude: structured signal extraction + battlecards
  workflow.ts              # the core scan loop (collect → diff → reason → store)
  store.ts                 # JSON persistence behind a swappable interface
  html.ts / mock.ts / ui.ts / types.ts
```

## Deploy

Deploys to Vercel as-is. For persistence across serverless invocations, swap the
JSON store in `lib/store.ts` for a hosted DB (Neon/Turso/Vercel Postgres) — every
read/write already goes through that one module.

---

MIT.
