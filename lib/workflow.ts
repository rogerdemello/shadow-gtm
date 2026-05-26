import type { Company, ScanCompanyResult, Snapshot } from "./types";
import { fetchPage, serpSearch } from "./brightdata";
import { htmlToText } from "./html";
import { extractSignals } from "./ai";
import {
  hash,
  id,
  latestSnapshot,
  replaceCompanySignals,
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
    // 1. Collect: pricing/site page (Web Unlocker) + intent search (SERP API),
    //    in parallel. A SERP failure shouldn't sink the whole company.
    const [pricingHtml, serp] = await Promise.all([
      fetchPage(company.pricingUrl),
      serpSearch(
        `${company.name} pricing OR alternatives OR layoffs OR funding OR reviews`,
        8,
      ).catch(() => []),
    ]);

    const pricingText = htmlToText(pricingHtml);

    // 2. Diff against the previous snapshot to answer "what changed?".
    const prev = await latestSnapshot(company.id, "pricing");
    const changeSummary = prev ? diffSummary(prev.text, pricingText) : null;

    // 3. Persist the new snapshot for next time.
    const snap: Snapshot = {
      id: id(),
      companyId: company.id,
      pageType: "pricing",
      url: company.pricingUrl,
      text: pricingText,
      hash: hash(pricingText),
      fetchedAt: new Date().toISOString(),
    };
    await saveSnapshot(snap);

    // 4. Reason: turn it all into ranked, explained signals.
    const signals = await extractSignals({
      company,
      pricingText,
      pricingUrl: company.pricingUrl,
      serp,
      changeSummary,
      scanId,
    });

    await replaceCompanySignals(company.id, signals);
    return { ...base, signals, changeSummary };
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }
}
