import type {
  Company,
  PageType,
  ScanCompanyResult,
  ScanEvidence,
  Signal,
  Snapshot,
} from "./types";
import { fetchPageText, searchWeb } from "./retrieval";
import { htmlToText } from "./html";
import { extractSignals, PROMPT_VERSION } from "./ai";
import { hash, id } from "./store";
import type { Store } from "./store.supabase";
import { emailConfigured, sendEmail } from "./email";
import { signalAlertEmail } from "./email/templates";
import { appUrl } from "./env";
import { logger } from "./logger";
import { planFor } from "./plans";
import { SCAN_USAGE_KIND, scanQuotaStatus, startOfMonthIso } from "./quota";
import { dispatchSignalIntegrations } from "./integrations/dispatch";
import { friendlyGeminiError } from "./gemini";

// ── The core loop ───────────────────────────────────────────────────────────
//   live web (Gemini grounding) → diff vs last scan → AI signals + reasoning → store
// This is the one workflow the whole product (and demo) revolves around.

/** Line-level diff summary good enough to feed the model "what changed".
 *  Exported for unit testing — it's the core "what changed" primitive. */
export function diffSummary(oldText: string, newText: string): string | null {
  if (!oldText) return null;
  const oldLines = new Set(oldText.split("\n").map((l) => l.trim()));
  const newLines = new Set(newText.split("\n").map((l) => l.trim()));

  const added = [...newLines].filter((l) => l && !oldLines.has(l));
  const removed = [...oldLines].filter((l) => l && !newLines.has(l));
  if (added.length === 0 && removed.length === 0) return null;

  const cap = (arr: string[]) => arr.slice(0, 12).map((l) => `  ${l}`).join("\n");
  const parts: string[] = [];
  if (added.length) parts.push(`ADDED lines:\n${cap(added)}`);
  if (removed.length) parts.push(`REMOVED lines:\n${cap(removed)}`);
  return parts.join("\n");
}

function homepageUrlFor(company: Company): string {
  return `https://${company.domain}/`;
}

interface FetchedPage {
  pageType: PageType;
  url: string;
  text: string;
  changeSummary: string | null;
  /** True if this page's content differs from the last snapshot (or is new). */
  changed: boolean;
}

async function fetchAndDiff(
  store: Store,
  company: Company,
  pageType: PageType,
  url: string,
): Promise<FetchedPage> {
  // Gemini reads the live page (URL-context tool) and returns its text. We still
  // run it through htmlToText to normalize whitespace/entities for stable diffs.
  const text = htmlToText(await fetchPageText(url));

  // The page couldn't be read (empty / RECITATION-blocked / rate-limited). Skip
  // it entirely — don't persist an empty snapshot or feed blank text to the model.
  if (text.trim().length < 40) {
    return { pageType, url, text: "", changeSummary: null, changed: false };
  }

  const newHash = hash(text);
  const prev = await store.latestSnapshot(company.id, pageType);
  const changed = !prev || prev.hash !== newHash;
  const changeSummary = prev ? diffSummary(prev.text, text) : null;

  // Only persist a new snapshot when the content actually changed — avoids
  // unbounded identical rows on scheduled re-scans.
  if (changed) {
    const snap: Snapshot = {
      id: id(),
      companyId: company.id,
      pageType,
      url,
      text,
      hash: newHash,
      fetchedAt: new Date().toISOString(),
    };
    await store.saveSnapshot(snap);
  }
  return { pageType, url, text, changeSummary, changed };
}

/** Run the full intelligence pass for one company. Never throws — errors are
 *  returned on the result so the UI can keep streaming the other companies. */
export async function scanCompany(
  store: Store,
  company: Company,
  scanId: string,
): Promise<ScanCompanyResult> {
  const base: ScanCompanyResult = {
    companyId: company.id,
    companyName: company.name,
    signals: [],
    changeSummary: null,
  };

  try {
    // 1. Collect: pricing + homepage pages + intent SERP, mostly in parallel.
    //    The pricing fetch is the required path; homepage and SERP are
    //    best-effort so a partial result still surfaces intelligence.
    const pricingP = fetchAndDiff(store, company, "pricing", company.pricingUrl);
    const homepageP = fetchAndDiff(store, company, "homepage", homepageUrlFor(company))
      .catch(() => null);
    const serpP = searchWeb(
      `${company.name} (${company.domain}) — pricing changes, product launches, funding, hiring, reviews, alternatives`,
      8,
    ).catch(() => []);

    const [pricing, homepage, serp] = await Promise.all([
      pricingP,
      homepageP,
      serpP,
    ]);

    const pages: FetchedPage[] = [pricing];
    if (homepage) pages.push(homepage);

    // 1b. Cache-skip: if no monitored page changed and we already have signals
    //     for this company, reuse them instead of paying for another Gemini
    //     extraction. This is the big cost saver on scheduled re-scans. (Trade-
    //     off: a SERP-only change won't surface until a page also moves — an
    //     acceptable bound on cost; revisit with SERP hashing if needed.)
    const anyChanged = pages.some((p) => p.changed);
    if (!anyChanged) {
      const existing = (await store.listSignals()).filter(
        (s) => s.companyId === company.id,
      );
      if (existing.length > 0) {
        return { ...base, signals: existing, changeSummary: null };
      }
    }

    // 1c. Enforce the org's monthly scan quota before paying for extraction.
    //     Runs after the cache-skip return, so reused (unchanged) scans are free.
    const sub = await store.getSubscription();
    const plan = planFor(sub.plan);
    const usedThisMonth =
      (await store.getUsageSummary(startOfMonthIso(new Date()))).byKind[SCAN_USAGE_KIND] ?? 0;
    if (scanQuotaStatus(plan, usedThisMonth).over) {
      return {
        ...base,
        error: `Monthly scan limit reached on the ${plan.name} plan (${plan.limits.monthlyScans}). Upgrade in Settings → Billing.`,
      };
    }

    // 2. Build a combined change summary across all monitored pages.
    const combinedSummary = pages
      .filter((p) => p.changeSummary)
      .map((p) => `### ${p.pageType.toUpperCase()} (${p.url})\n${p.changeSummary}`)
      .join("\n\n") || null;

    // 3. Reason: turn it all into ranked, explained signals.
    const extractStart = Date.now();
    const { signals, usage, warning } = await extractSignals({
      company,
      pages: pages.map((p) => ({
        pageType: p.pageType,
        url: p.url,
        text: p.text,
      })),
      serp,
      changeSummary: combinedSummary,
      scanId,
    });
    const extractLatency = Date.now() - extractStart;

    await store.replaceCompanySignals(company.id, signals);

    // 3b. Meter the Gemini call (cost + Phase 7 quotas + AI-ops). Best-effort.
    //     status reflects extraction health so /api/ai-ops can spot failure runs.
    await store.recordUsage({
      kind: "gemini_extraction",
      tokensIn: usage.promptTokens,
      tokensOut: usage.outputTokens,
      scanId,
      companyId: company.id,
      promptVersion: PROMPT_VERSION,
      latencyMs: extractLatency,
      status: warning ? "error" : "ok",
    });
    if (warning) {
      logger.warn("scan extraction warning", { company: company.name, scanId, warning });
    }

    // 3c. Alert on signals crossing the org's opportunity threshold. Runs only
    //     when extraction ran (the cache-skip path returns earlier), so we don't
    //     re-notify when nothing changed.
    const rule = await store.getAlertRule();
    const alerts = signals
      .filter((s) => s.opportunityScore >= rule.minOpportunity)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
    if (alerts.length) {
      await store.createNotifications(
        alerts.map((s) => ({
          signalId: s.id,
          companyId: company.id,
          companyName: company.name,
          title: `${company.name}: ${s.description}`,
          body: s.reasoning,
          opportunityScore: s.opportunityScore,
        })),
      );

      // Email channel (opt-in via alert settings). Best-effort — never block the
      // scan; no-ops when Resend isn't configured.
      if (rule.channels.includes("email") && emailConfigured()) {
        await dispatchSignalEmail(store, company, alerts).catch((e) =>
          logger.warn("signal email dispatch failed", { error: (e as Error).message }),
        );
      }

      // Slack / outbound webhooks (opt-in via alert channels + configured per-org).
      if (rule.channels.includes("slack") || rule.channels.includes("webhook")) {
        await dispatchSignalIntegrations(store, company, alerts, rule.channels).catch((e) =>
          logger.warn("integration dispatch failed", { error: (e as Error).message }),
        );
      }
    }

    // 4. Persist what fed this scan so the evidence panel can show it.
    const evidence: ScanEvidence = {
      scanId,
      companyId: company.id,
      changeSummary: combinedSummary,
      serp,
      sources: pages.map((p) => ({ url: p.url, pageType: p.pageType })),
      createdAt: new Date().toISOString(),
    };
    await store.saveEvidence(evidence);

    return { ...base, signals, changeSummary: combinedSummary, warning };
  } catch (err) {
    return { ...base, error: friendlyGeminiError(err) };
  }
}

/** Email the org's members about a company's high-opportunity signals. */
async function dispatchSignalEmail(
  store: Store,
  company: Company,
  alerts: Signal[],
): Promise<void> {
  const members = await store.listMembers();
  const to = members.map((m) => m.email).filter((e): e is string => Boolean(e));
  if (to.length === 0) return;
  const { subject, html } = signalAlertEmail(company, alerts, appUrl());
  await sendEmail({ to, subject, html });
}

// Re-export for callers that just want the type ergonomics.
export type { Signal };
