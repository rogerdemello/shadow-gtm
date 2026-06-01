import { describe, expect, it } from "vitest";
import { signalAlertEmail, weeklyDigestEmail } from "../../lib/email/templates";
import type { Company, Signal } from "../../lib/types";

const company: Company = {
  id: "c1",
  name: "Acme",
  domain: "acme.com",
  pricingUrl: "https://acme.com/pricing",
  createdAt: "2026-05-01T00:00:00Z",
};

function sig(partial: Partial<Signal>): Signal {
  return {
    id: "s1",
    companyId: "c1",
    companyName: "Acme",
    scanId: "scan1",
    type: "pricing",
    description: "Raised Starter 60%",
    impact: "high",
    confidence: 0.9,
    opportunityScore: 88,
    reasoning: "Moving upmarket",
    recommendedAction: "Run a migration campaign",
    sourceUrl: "https://acme.com/pricing",
    createdAt: "2026-05-08T00:00:00Z",
    ...partial,
  };
}

describe("signalAlertEmail", () => {
  it("includes company, score, and the recommended play", () => {
    const { subject, html } = signalAlertEmail(company, [sig({})], "https://app.test");
    expect(subject).toContain("Acme");
    expect(subject).toContain("88");
    expect(html).toContain("Raised Starter 60%");
    expect(html).toContain("Run a migration campaign");
    expect(html).toContain("https://app.test");
  });

  it("escapes HTML in signal fields (no injection)", () => {
    const { html } = signalAlertEmail(
      company,
      [sig({ description: "<script>alert(1)</script>" })],
      "https://app.test",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("weeklyDigestEmail", () => {
  it("lists top plays with the company name prefixed", () => {
    const { subject, html } = weeklyDigestEmail(
      "My Org",
      [sig({ companyName: "Acme", description: "Launched enterprise tier" })],
      3,
      "https://app.test",
    );
    expect(subject).toContain("weekly brief");
    expect(html).toContain("My Org");
    expect(html).toContain("Acme: Launched enterprise tier");
  });

  it("handles an empty week gracefully", () => {
    const { html } = weeklyDigestEmail("My Org", [], 0, "https://app.test");
    expect(html).toContain("No signals captured");
  });
});
