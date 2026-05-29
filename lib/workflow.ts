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
import {
  hash,
  id,
  latestSnapshot,
  replaceCompanySignals,
  saveEvidence,
  saveSnapshot,
} from "./store";

// ── The core loop ───────────────────────────────────────────────────────────
//   live web (Bright Data) → diff vs last scan → AI signals + reasoning → store
// This is the one workflow the whole product (and demo) revolves around.

/** Line-level diff summary good enough to feed the model "what changed". */
function diffSummary(oldText: string, newText: string): string | null {
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
}

async function fetchAndDiff(
  company: Company,
  pageType: PageType,
  url: string,
): Promise<FetchedPage> {
  const fetcher = company.renderJs ? fetchPageRendered : fetchPage;
  const html = await fetcher(url);
  const text = htmlToText(html);
  const prev = await latestSnapshot(company.id, pageType);
  const changeSummary = prev ? diffSummary(prev.text, text) : null;
  const snap: Snapshot = {
    id: id(),
    companyId: company.id,
    pageType,
    url,
    text,
    hash: hash(text),
    fetchedAt: new Date().toISOString(),
  };
  await saveSnapshot(snap);
  return { pageType, url, text, changeSummary };
}

/** Run the full intelligence pass for one company. Never throws — errors are
 *  returned on the result so the UI can keep streaming the other companies. */
export async function scanCompany(
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
    const pricingP = fetchAndDiff(company, "pricing", company.pricingUrl);
    const homepageP = fetchAndDiff(company, "homepage", homepageUrlFor(company))
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

    // 2. Build a combined change summary across all monitored pages.
    const combinedSummary = pages
      .filter((p) => p.changeSummary)
      .map((p) => `### ${p.pageType.toUpperCase()} (${p.url})\n${p.changeSummary}`)
      .join("\n\n") || null;

    // 3. Reason: turn it all into ranked, explained signals.
    const signals = await extractSignals({
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

    await replaceCompanySignals(company.id, signals);

    // 4. Persist what fed this scan so the evidence panel can show it.
    const evidence: ScanEvidence = {
      scanId,
      companyId: company.id,
      changeSummary: combinedSummary,
      serp,
      sources: pages.map((p) => ({ url: p.url, pageType: p.pageType })),
      createdAt: new Date().toISOString(),
    };
    await saveEvidence(evidence);

    return { ...base, signals, changeSummary: combinedSummary };
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }
}

// Re-export for callers that just want the type ergonomics.
export type { Signal };
