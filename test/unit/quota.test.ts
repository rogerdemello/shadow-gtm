import { describe, expect, it } from "vitest";
import {
  companyLimitReached,
  memberLimitReached,
  scanQuotaStatus,
  startOfMonthIso,
  tokenQuotaStatus,
} from "../../lib/quota";
import { CHECKOUT_PLANS, PLANS, planFor } from "../../lib/plans";

describe("planFor", () => {
  it("defaults to free for unknown/absent ids", () => {
    expect(planFor(undefined).id).toBe("free");
    expect(planFor(null).id).toBe("free");
    expect(planFor("bogus").id).toBe("free");
  });
  it("resolves known plans", () => {
    expect(planFor("growth").id).toBe("growth");
  });
  it("only offers self-serve checkout for paid non-enterprise tiers", () => {
    expect(CHECKOUT_PLANS).toEqual(["startup", "growth"]);
    expect(CHECKOUT_PLANS).not.toContain("enterprise");
  });
});

describe("scanQuotaStatus", () => {
  it("reports remaining under the limit", () => {
    const s = scanQuotaStatus(PLANS.free, 5); // free = 20
    expect(s.over).toBe(false);
    expect(s.remaining).toBe(15);
  });
  it("flags over at the limit", () => {
    const s = scanQuotaStatus(PLANS.free, 20);
    expect(s.over).toBe(true);
    expect(s.remaining).toBe(0);
  });
  it("treats null (enterprise) as unlimited", () => {
    const s = scanQuotaStatus(PLANS.enterprise, 999999);
    expect(s.over).toBe(false);
    expect(s.limit).toBeNull();
    expect(s.remaining).toBeNull();
  });
});

describe("tokenQuotaStatus", () => {
  it("reports remaining under the budget", () => {
    const s = tokenQuotaStatus(PLANS.free, 500_000); // free = 2,000,000
    expect(s.over).toBe(false);
    expect(s.remaining).toBe(1_500_000);
  });
  it("flags over at/above the budget", () => {
    expect(tokenQuotaStatus(PLANS.free, 2_000_000).over).toBe(true);
    expect(tokenQuotaStatus(PLANS.free, 2_500_000).over).toBe(true);
    expect(tokenQuotaStatus(PLANS.free, 2_500_000).remaining).toBe(0);
  });
  it("treats null (enterprise) as unlimited", () => {
    const s = tokenQuotaStatus(PLANS.enterprise, 10_000_000_000);
    expect(s.over).toBe(false);
    expect(s.limit).toBeNull();
    expect(s.remaining).toBeNull();
  });
});

describe("companyLimitReached / memberLimitReached", () => {
  it("blocks at the cap and allows unlimited plans", () => {
    expect(companyLimitReached(PLANS.free, 3)).toBe(true); // free = 3
    expect(companyLimitReached(PLANS.free, 2)).toBe(false);
    expect(companyLimitReached(PLANS.enterprise, 10_000)).toBe(false);
    expect(memberLimitReached(PLANS.startup, 5)).toBe(true); // startup = 5
    expect(memberLimitReached(PLANS.enterprise, 10_000)).toBe(false);
  });
});

describe("startOfMonthIso", () => {
  it("returns the first instant of the UTC month", () => {
    expect(startOfMonthIso(new Date("2026-06-17T13:45:00Z"))).toBe("2026-06-01T00:00:00.000Z");
  });
});
