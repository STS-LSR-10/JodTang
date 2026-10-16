import { describe, expect, it } from "vitest";
import { can, effectivePlan, FREE_SLIP_LIMIT, slipsRemaining } from "./plan";

const NOW = new Date("2026-10-15T08:00:00Z");

describe("effectivePlan", () => {
  it("free without expiry stays free", () => {
    expect(effectivePlan("free", null, NOW)).toBe("free");
  });

  it("plus without expiry is plus", () => {
    expect(effectivePlan("plus", null, NOW)).toBe("plus");
  });

  it("an expired plus falls back to free", () => {
    expect(effectivePlan("plus", "2026-10-01T00:00:00Z", NOW)).toBe("free");
  });

  it("a future expiry is plus, even for a free row (redeemed points)", () => {
    expect(effectivePlan("free", "2026-11-01T00:00:00Z", NOW)).toBe("plus");
  });
});

describe("limits", () => {
  it("free has 30 slips a month", () => {
    expect(slipsRemaining("free", 0)).toBe(FREE_SLIP_LIMIT);
    expect(slipsRemaining("free", 29)).toBe(1);
    expect(slipsRemaining("free", 30)).toBe(0);
    expect(slipsRemaining("free", 99)).toBe(0);
  });

  it("plus is unlimited", () => {
    expect(slipsRemaining("plus", 500)).toBeNull();
  });

  it("feature flags", () => {
    expect(can("free", "savingsChart")).toBe(false);
    expect(can("plus", "savingsChart")).toBe(true);
  });
});
