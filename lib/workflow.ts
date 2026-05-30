import type {
  Company,
  PageType,
  ScanCompanyResult,
  ScanEvidence,
  Signal,
  Snapshot,
} from "./types";
import { fetchPage, fetchPageRendered, serpSearch } from "./brightdata";
import { htmlToText } from "./html";
import { extractSignals } from "./ai";
import { hash, id } from "./store";
import type { Store } from "./store.supabase";

// ── The core loop ───────────────────────────────────────────────────────────
//   live web (Bright Data) → diff vs last scan → AI signals + reasoning → store
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
  const fetcher = company.renderJs ? fetchPageRendered : fetchPage;
  const html = await fetcher(url);
  const text = htmlToText(html);
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
    const serpP = serpSearch(
      `${company.name} pricing OR alternatives OR layoffs OR funding OR reviews`,
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

    // 2. Build a combined change summary across all monitored pages.
    const combinedSummary = pages
      .filter((p) => p.changeSummary)
      .map((p) => `### ${p.pageType.toUpperCase()} (${p.url})\n${p.changeSummary}`)
      .join("\n\n") || null;

    // 3. Reason: turn it all into ranked, explained signals.
    const { signals, usage } = await extractSignals({
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

    await store.replaceCompanySignals(company.id, signals);

    // 3b. Meter the Gemini call (cost + Phase 7 quotas). Best-effort.
    await store.recordUsage({
      kind: "gemini_extraction",
      tokensIn: usage.promptTokens,
      tokensOut: usage.outputTokens,
      scanId,
      companyId: company.id,
    });

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

    return { ...base, signals, changeSummary: combinedSummary };
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }
}

// Re-export for callers that just want the type ergonomics.
export type { Signal };
