# ◢ Shadow GTM

**Autonomous web intelligence for revenue teams.** Shadow GTM watches the live
web with [Google's Gemini](https://ai.google.dev/gemini-api) — reading competitor
pages and searching the web through its grounding tools — and turns competitor
movement into **ranked, explained GTM plays** — not another summarizer, an analyst.

The one loop the whole product runs on:

```
live web (Gemini grounding) → diff vs last scan → AI signals + reasoning → ranked play
```

Most tools tell you *"Competitor raised prices."* Shadow GTM tells you
*"Competitor raised Starter 60% → moving upmarket → their SMB base is now
under-served → launch a migration campaign this week,"* with an opportunity
score and a one-click battlecard — and a **verbatim quote from the source** to
back every claim.

Built as a real multi-tenant SaaS: isolated workspaces, roles, autonomous
monitoring, multi-channel alerting, billing, a public API, and an enterprise
governance story.

---

## Features

**Intelligence**
- **Watchlist + live scans** — Gemini reads each competitor's pricing page *and* homepage (URL-context tool) and pulls news/reviews/hiring/intent via Google Search grounding, diffs against the last scan, and extracts scored, reasoned signals — all real, cited, live web data. Results stream into the feed live (SSE).
- **Auditable evidence** — every signal carries a verbatim source quote; every fetched page is fingerprinted (URL + SHA-256 + timestamp) in an immutable audit trail.
- **Battlecards & War Room** — stream a Markdown sales battlecard from a competitor's signals, or type an attack directive for a full, signal-grounded campaign plan.
- **Trends & momentum** — append-only signal history powers opportunity-over-time charts, per-competitor momentum, and matrix sparklines (Recharts).

**Platform**
- **Multi-tenant workspaces** — Supabase Postgres with row-level security; every row is org-scoped and RLS-enforced.
- **Auth, team & roles** — email/password + optional SSO/SAML; owner/admin/member roles; email-based invitations.
- **Autonomous monitoring** — schedule hourly/daily/weekly scans; a background worker drains a retrying job queue (pg_cron → pg_net → worker route).
- **Multi-channel alerts** — in-app realtime, email (Resend), Slack, and signed outbound webhooks fire when a signal crosses your opportunity threshold; plus a weekly digest.
- **Billing & quotas** — tiered Stripe plans (Free → Enterprise) with monthly scan / competitor / seat caps enforced from real usage.
- **Public REST API** — org-scoped API keys (`/api/v1/companies`, `/signals`, `/trends`) and outbound webhooks.
- **Governance** — usage metering, a dead-letter view with retry, data export (GDPR portability), one-click workspace deletion, and a legal pack (Terms / Privacy / DPA).

## Web data (Gemini grounding)

All live web data comes straight from the Gemini API — no scraping infrastructure,
one key:

| Capability | Where it's used |
|---|---|
| **URL context** | `lib/retrieval.ts → fetchPageText()` — Gemini reads a competitor's pricing/home page and returns its real content, which we hash + diff. |
| **Google Search grounding** | `lib/retrieval.ts → searchWeb()` — live, cited news / reviews / hiring / funding / intent findings. |

Retrieval (grounding tools) and signal extraction (structured JSON) are separate
Gemini calls, since the two can't be combined in one request.

## Tech

- **Next.js 16** (App Router, TypeScript) — UI + API routes in one deployable app.
- **Supabase** — Postgres + Row-Level Security (multi-tenant isolation), Auth, Realtime, and pg_cron/pg_net for scheduling. Schema lives in `supabase/migrations/`.
- **Gemini** via `@google/genai` — structured signal extraction (`responseSchema` + Zod) with a model fallback; battlecards and War Room plans stream over SSE.
- **Tailwind CSS** — dark "war-room" terminal UI; **Recharts** for analytics.
- **Stripe** billing, **Resend** email, **Sentry** error reporting — each behind a config flag.
- **Swappable store** — every read/write goes through one `Store` interface (`lib/store.supabase.ts`), with a keyless JSON fallback (`lib/store.ts`) for the demo.

> A scan needs only a Gemini key. Everything else (Supabase, Stripe, Resend, Slack, Sentry, SSO) is optional and behind a config flag — with no keys, the app builds, tests, and runs (single-tenant, Free plan). Configuration only *adds* capability.

---

## Run it

```bash
npm install
cp .env.local.example .env.local   # fill in keys (all optional — see below)
npm run dev                         # http://localhost:3000
```

**Minimal:** set `GEMINI_API_KEY` and you can add competitors and run real scans
against the live web (single-tenant JSON store, no auth). That's the whole core
loop with one key.

**Full SaaS mode:** provision a Supabase project, set the keys below, and apply
the migrations (`npm run db:migrate`) — you then get auth, multi-tenant
workspaces, scheduling, alerts, billing, and the API.

### Configuration

```ini
# ── AI (Gemini) — the only key a scan needs (retrieval + reasoning) ─
GEMINI_API_KEY=                 # Google AI Studio → aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.5-flash   # gemini-2.5-pro for deeper reasoning
GEMINI_MODEL_FALLBACK=          # optional secondary model on failure
GEMINI_THINKING_BUDGET=         # optional token cap; 0 disables thinking

# ── Supabase (enables the full SaaS: auth, tenancy, scheduling) ─
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server-only; background worker
WORKER_SECRET=                  # shared secret for the scan worker
NEXT_PUBLIC_SSO_ENABLED=        # "1" once an SSO provider is configured

# ── Optional services (each no-ops when unset) ───────────────
RESEND_API_KEY= / EMAIL_FROM= / APP_URL=         # email alerts + digest
STRIPE_SECRET_KEY= / STRIPE_WEBHOOK_SECRET=      # billing
STRIPE_PRICE_STARTUP= / STRIPE_PRICE_GROWTH=
SENTRY_DSN=                                      # error reporting
APP_REGION=us                                    # data-residency reporting
```

See [`.env.local.example`](.env.local.example) for the annotated list, and
[`supabase/README.md`](supabase/README.md) for applying migrations.

## Public API

Mint a key in **Settings → Integrations → API keys**, then:

```bash
curl https://YOUR_APP/api/v1/signals \
  -H "Authorization: Bearer sk_live_xxxxxxxx"
```

Endpoints: `GET /api/v1/companies`, `/api/v1/signals`, `/api/v1/trends`. Outbound
webhooks deliver a signed payload (`x-shadowgtm-signature`, HMAC-SHA256) on new
high-opportunity signals. Full reference at `/docs/api`.

## Repo layout

```
app/
  page.tsx                 # logged-out → marketing landing; authed → dashboard
  login/ · invite/[token]/ # auth + invitation accept
  settings/                # org, team, billing, integrations, alerts, usage, audit
  (marketing)/             # public landing, features, pricing, docs
  (legal)/                 # terms, privacy, dpa
  api/
    scan/stream · battlecard · warroom · evidence   # core (SSE where streamed)
    companies · state · report · trends · audit
    members · invitations · org · alert-rules · usage  # team & settings
    billing/{checkout,portal,webhook} · integrations · webhooks · api-keys
    worker/process · jobs · health · v1/*              # automation, ops, public API
components/                # dashboard, feed, matrix, charts, modals, settings, marketing
lib/
  retrieval.ts ai.ts workflow.ts             # scan loop: Gemini grounding → diff → reason
  store.ts store.supabase.ts store-context.ts# Store interface + JSON/Supabase impls
  plans.ts quota.ts billing.ts               # tiers + usage caps + Stripe
  email.ts email/ integrations/ apikey.ts    # alerts + channels + public API auth
  eval.ts i18n.ts region.ts retry.ts env.ts logger.ts trends.ts types.ts
supabase/migrations/       # Postgres schema, RLS, functions, triggers
test/                      # unit + live-DB integration ; eval/ = AI quality gate
```

## Testing

```bash
npm run typecheck     # tsc --noEmit
npm test              # unit tests (no DB; external services mocked)
npm run test:int      # live-DB integration (needs Supabase keys in .env.local)
npm run eval          # AI extraction quality gate (live with a Gemini key, else offline)
npm run build         # production build
```

## Deploy

Deploys to Vercel + Supabase. Apply the migrations (`npm run db:migrate`),
regenerate types (`supabase gen types`), set env vars, then wire the autonomous
worker by running [`supabase/cron-setup.sql`](supabase/cron-setup.sql) with your
deployed worker URL + `WORKER_SECRET`. Provision Resend / Stripe / Slack / Sentry
/ your IdP as needed — each is optional and gated behind its config.

---

MIT — see [`LICENSE`](LICENSE).
