# Shadow GTM — Definitive Best-in-Domain Plan

> **Delivery status (2026-06-03):** P0 (all 8 blockers) ✅ · P1 (all 10 items) ✅ ·
> P2 substantially ✅ (CRUD completeness, input validation, SERP-aware cache-skip,
> responsive matrix, chart a11y, quality feedback loop, add-competitor validation).
> Idempotency-Key headers ✅. **Deliberately not built:** short-TTL response cache
> (battlecard/narrative/dossier are already DB-persisted and served from cache via
> their GET endpoints) and per-use-case thinking budgets (left at model-default to
> protect the free-tier token budget; tune via `GEMINI_THINKING_BUDGET`).
> Migrations 0018–0021 are authored & type-modeled, applied at deploy via
> `npm run db:migrate`.


> Generated from a multi-agent audit (51 agents, 91 findings, 41 verified against the
> actual code). Overall readiness at audit time: **71 / 100**. Every item below was
> checked against real code.

## Per-area scorecard

| Area | Score | Summary |
|---|---|---|
| API endpoints & routes | 72 | Consistent `storeOr401`/`contextOrError` and broad CRUD, but: no PATCH for companies; schedules has no PATCH/DELETE and its POST bypasses `contextOrError` to write the DB directly; **alert-rules PATCH is an open permission-escalation hole** (cost-bearing `autonomyLevel` editable by any member); unbounded lists; weak array validation; no v1 rate limiting. |
| Agentic workflows | 72 | Solid multi-step agent + dossier/autonomy/narrative with SSE and Gemini-specific error handling. Weak spots: agent never validates Gemini tool-call shape against `DECLARATIONS`; no `AbortSignal` (disconnected clients keep burning quota); **dossier/narrative/battlecard persist with `.catch(()=>{})` → silent data loss**; triage failures are dark; extraction failures return empty silently. |
| Data layer, RLS & migrations | 74 | Good RLS/FK/index coverage. **Runtime bug:** `scan_jobs` has only `select`/`insert` policies, so `retryJob()`'s UPDATE via the authed client fails RLS — "retry failed job" is broken. `Signal.scanId` typed required but column is nullable. |
| UI / UX completeness | 70 | Core GTM surfaces present with good streaming UX. Gaps: schedules API has **zero management UI**; dossier history isn't browsable; competitor matrix has no responsive overflow; charts lack `aria-label`. |
| Production readiness | 66 | Good foundations (headers, env validation, RLS, Sentry, 19 test files). Blockers: **Stripe webhook has no idempotency** (retries double-write); no per-org rate limiting/concurrency; no DLQ/error_code on failed jobs; worker cron is hand-edited SQL with no health monitor; health endpoint missing stripe/sentry/response-time/cache; billing-webhook/retry/RLS untested in CI. |
| AI quality & cost | 58 | Weakest area. **Only `gemini_extraction` counts toward quota** — dossier/narrative/agent record `units:1` not tokens and never gate (a free user drains quota with one dossier); no pre-flight token estimate or per-request budget; eval has exactly **2 golden cases** and no CI regression; fallback exists only on extraction; no AI-ops logging or quality feedback. |

---

## P0 — Correctness & blocking

1. **scan_jobs RLS gap breaks retry.** `retryJob()` UPDATEs via the authed client but the scheduling migration defines only `scan_jobs_select`/`scan_jobs_insert`. Add `scan_jobs_update`/`scan_jobs_delete` (`for all using(is_org_member(org_id)) with check(...)`) in a new migration; add an RLS test proving a member can retry.
2. **Stripe webhook idempotency.** Add `webhook_events(stripe_event_id pk, org_id, type, processed_at)`, insert-on-conflict-do-nothing, return 200 early on replay. Test duplicate + missing-orgId.
3. **Permission escalation in alert-rules.** PATCH uses `contextOrError()` with no role guard → any member can set `autonomyLevel='deep_dive'`. Change PATCH to `contextOrError(['owner','admin'])`; keep GET member-level.
4. **Schedules hardening.** POST bypasses `contextOrError` and writes via `getServerClient`; no PATCH/DELETE. Route mutations through store methods behind `contextOrError(['owner','admin'])`, validate companyId ∈ org, add PATCH/DELETE `/api/schedules/[id]`.
5. **Silent AI persistence loss.** dossier/narrative/battlecard persist with `.catch(()=>{})` after `done`. Retry once on transient error; on permanent failure emit an explicit `persist_failed` SSE event.
6. **Unbounded queries.** `listSignals()`/`listCompanies()` have no `.limit()`. Add hard `.limit(1000)` + paged variants; bound `/api/state`.
7. **Token-budget quota bypass.** Only `gemini_extraction` gates. Capture real `tokensIn/tokensOut` for every call, enforce a monthly token budget, 402 before firing on overflow.
8. **Worker replay hardening.** Add `X-Timestamp` freshness (≤5 min) + HMAC-SHA256(body+timestamp, WORKER_SECRET); validate secret strength in `lib/env.ts`.

## P1 — Completeness & best-in-domain

- Schedules UI wired to the hardened API.
- Per-org rate limiting + concurrency (limiter around `contextOrError`/middleware), per-org scan caps, queue backpressure, plan-based per-API-key limits on `/api/v1/*` with `Retry-After`.
- DLQ + failure observability: `scan_jobs.error_code` + `retry_count`/`last_retry_at`; Sentry-tag `failJob()`; `/api/jobs/failed` list+retry; notify after max attempts.
- Worker self-healing + health: `scripts/setup-cron.mjs` (no secrets in SQL); extend `/api/health` with cron last-run, stripe + sentry, `response_time_ms`, cache header.
- Agent robustness: validate every Gemini `functionCall` against `DECLARATIONS`; handle empty `text`+`functionCalls`.
- Cancellation: thread `AbortSignal` into `runAgent`/`runDossierStream`/`scanCompany` → `searchWeb`/`extractSignals`.
- Extraction failure visibility: emit a scan warning / `extraction_failed` marker on parse/Zod failure.
- Autonomy triage observability: log + persist triage verdicts.
- Universal model fallback: extend MODEL→FALLBACK to battlecard, attack-plan, agent, narrative, dossier, triage via shared helper.
- Eval + CI regression: grow GOLDEN 2 → 15–20 weighted cases; nightly GitHub Actions eval gate.
- Pre-flight cost estimation + tokens-remaining meter.
- AI-ops logging: `ai_operations` table + `/api/ai-ops` aggregation.
- Integration/email durability: retry + DLQ; fix `sendDueDigests()` to stamp `last_digest_at` only after confirmed send.
- Critical-path CI tests: billing-webhook idempotency, job-claim contention, RLS isolation, route auth/error paths.

## P2 — Polish & differentiation

- Dossier history UI; responsive competitor matrix; chart `aria-label` + data-table fallback.
- Idempotency-Key on POST companies/invitations/webhooks/api-keys/schedules.
- Element-level array validation for `/api/notifications` and `/api/conversations`.
- Finish CRUD: PATCH companies, DELETE conversations, GET single webhook + delivery results.
- Conversation threading + generation lock; short-TTL Gemini response cache.
- SERP hashing in cache-skip; force-refresh-after-N-days.
- Quality feedback loop: ratings → `metrics_daily` → effectiveness dashboard.
- Scoring calibration dataset + per-use-case thinking budgets; default `DOSSIER_TO_SIGNALS` on.
- UX micro-polish across notifications, trends, add-company, evidence modal, scan cancel, empty states.

---

## Definition of done (best-in-domain)

- Every mutable core resource has full CRUD (companies PATCH, schedules PATCH/DELETE behind owner/admin, conversations DELETE, webhook GET + results).
- `scan_jobs` has UPDATE/DELETE RLS with a test proving a member can retry a failed job.
- Stripe webhooks are idempotent; duplicate deliveries are no-ops, tested.
- All cost-bearing settings require owner/admin; members read but cannot mutate autonomy/budget.
- No unbounded list endpoint; `/api/v1/*` and per-org requests are throttled with 429 + Retry-After.
- Every Gemini call records real token counts, counts toward a monthly budget, and 402s before firing on overflow; a tokens-remaining meter is visible.
- All AI generators support model fallback, are cancellable on disconnect, and never silently lose generated content.
- Agent validates tool-calls and degrades gracefully; extraction failures are surfaced.
- Autonomous monitoring is end-to-end usable: schedules UI, env-driven worker setup, observable triage.
- Failed jobs are categorized, admin-retryable, Sentry-alerted, and dead-lettered; integration/email/webhook deliveries have retry + DLQ.
- Health reports db/stripe/sentry/cron + response time with a cache header; cron last-run is monitored.
- Eval covers 15–20 weighted golden cases with a nightly CI regression gate; AI ops are logged.
- CI runs unit + integration + RLS + route-auth tests including webhook idempotency and job-claim contention.
- UI is responsive, accessible, and every backend capability is discoverable in the product.
