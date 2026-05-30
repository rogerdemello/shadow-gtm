import { describe, expect, it } from "vitest";
import {
  rowToCompany,
  rowToSnapshot,
  rowToSignal,
  rowToScan,
  rowToEvidence,
  rowToBattlecard,
} from "../../lib/store.supabase";

// Contract tests: the Supabase store must hand the rest of the app the SAME
// domain shapes the JSON store did. These pin the row→domain mapping (snake_case
// columns → camelCase fields, null→undefined coercion) without needing a live DB.

describe("rowToCompany", () => {
  it("maps columns to the Company domain shape", () => {
    expect(
      rowToCompany({
        id: "c1",
        org_id: "o1",
        name: "Acme",
        domain: "acme.com",
        pricing_url: "https://acme.com/pricing",
        render_js: true,
        created_by: "u1",
        created_at: "2026-05-30T00:00:00.000Z",
      }),
    ).toEqual({
      id: "c1",
      name: "Acme",
      domain: "acme.com",
      pricingUrl: "https://acme.com/pricing",
      renderJs: true,
      createdAt: "2026-05-30T00:00:00.000Z",
    });
  });
});

describe("rowToSnapshot", () => {
  it("maps page_type and fetched_at", () => {
    const snap = rowToSnapshot({
      id: "s1",
      org_id: "o1",
      company_id: "c1",
      page_type: "pricing",
      url: "https://acme.com/pricing",
      text: "Starter $49",
      hash: "abc123",
      fetched_at: "2026-05-30T00:00:00.000Z",
    });
    expect(snap).toEqual({
      id: "s1",
      companyId: "c1",
      pageType: "pricing",
      url: "https://acme.com/pricing",
      text: "Starter $49",
      hash: "abc123",
      fetchedAt: "2026-05-30T00:00:00.000Z",
    });
  });
});

describe("rowToSignal", () => {
  const base = {
    id: "sig1",
    org_id: "o1",
    company_id: "c1",
    company_name: "Acme",
    scan_id: "scan1",
    type: "pricing" as const,
    description: "Raised Starter 60%",
    impact: "high" as const,
    confidence: 0.92,
    opportunity_score: 88,
    reasoning: "Moving upmarket",
    recommended_action: "Run a migration campaign",
    source_url: "https://acme.com/pricing",
    quote: "Starter is now $79/mo",
    is_current: true,
    created_at: "2026-05-30T00:00:00.000Z",
  };

  it("maps a full signal row", () => {
    expect(rowToSignal(base)).toEqual({
      id: "sig1",
      companyId: "c1",
      companyName: "Acme",
      scanId: "scan1",
      type: "pricing",
      description: "Raised Starter 60%",
      impact: "high",
      confidence: 0.92,
      opportunityScore: 88,
      reasoning: "Moving upmarket",
      recommendedAction: "Run a migration campaign",
      sourceUrl: "https://acme.com/pricing",
      quote: "Starter is now $79/mo",
      createdAt: "2026-05-30T00:00:00.000Z",
    });
  });

  it("coerces null quote to undefined and null scan_id to empty string", () => {
    const r = rowToSignal({ ...base, quote: null, scan_id: null });
    expect(r.quote).toBeUndefined();
    expect(r.scanId).toBe("");
  });
});

describe("rowToScan", () => {
  it("maps arrays and null finished_at", () => {
    expect(
      rowToScan({
        id: "scan1",
        org_id: "o1",
        started_at: "2026-05-30T00:00:00.000Z",
        finished_at: null,
        company_ids: ["c1", "c2"],
        signal_count: 5,
      }),
    ).toEqual({
      id: "scan1",
      startedAt: "2026-05-30T00:00:00.000Z",
      finishedAt: undefined,
      companyIds: ["c1", "c2"],
      signalCount: 5,
    });
  });
});

describe("rowToEvidence", () => {
  it("defaults null serp/sources to empty arrays", () => {
    const ev = rowToEvidence({
      id: "e1",
      org_id: "o1",
      company_id: "c1",
      scan_id: "scan1",
      change_summary: null,
      serp: null,
      sources: null,
      created_at: "2026-05-30T00:00:00.000Z",
    });
    expect(ev.serp).toEqual([]);
    expect(ev.sources).toEqual([]);
    expect(ev.changeSummary).toBeNull();
    expect(ev.companyId).toBe("c1");
  });

  it("passes through jsonb serp/sources", () => {
    const serp = [{ title: "t", link: "l", snippet: "s" }];
    const sources = [{ url: "u", pageType: "pricing" as const }];
    const ev = rowToEvidence({
      id: "e1",
      org_id: "o1",
      company_id: "c1",
      scan_id: "scan1",
      change_summary: "prices changed",
      serp,
      sources,
      created_at: "2026-05-30T00:00:00.000Z",
    });
    expect(ev.serp).toEqual(serp);
    expect(ev.sources).toEqual(sources);
  });
});

describe("rowToBattlecard", () => {
  it("maps the markdown card", () => {
    expect(
      rowToBattlecard({
        id: "b1",
        org_id: "o1",
        company_id: "c1",
        company_name: "Acme",
        markdown: "# Why we win",
        created_at: "2026-05-30T00:00:00.000Z",
      }),
    ).toEqual({
      id: "b1",
      companyId: "c1",
      companyName: "Acme",
      markdown: "# Why we win",
      createdAt: "2026-05-30T00:00:00.000Z",
    });
  });
});
