import { describe, expect, it } from "vitest";
import { can, effectivePlan, slipsRemaining } from "./plan";

const NOW = new Date("2026-10-15T08:00:00Z");

describe("effectivePlan", () => {
  it("free without expiry stays free", () => {
    expect(effectivePlan("free", null, NOW)).toBe("free");
  });

  it("plus without expiry is plus", () => {
    expect(effectivePlan("plus", null, NOW)).toBe("plus");
  });

  it("ultimate keeps its tier while valid and falls back to free once expired", () => {
    expect(effectivePlan("ultimate", null, NOW)).toBe("ultimate");
    expect(effectivePlan("ultimate", "2026-11-01T00:00:00Z", NOW)).toBe("ultimate");
    expect(effectivePlan("ultimate", "2026-10-01T00:00:00Z", NOW)).toBe("free");
  });

  it("an expired plus falls back to free", () => {
    expect(effectivePlan("plus", "2026-10-01T00:00:00Z", NOW)).toBe("free");
  });

  it("a future expiry is plus, even for a free row (redeemed points)", () => {
    expect(effectivePlan("free", "2026-11-01T00:00:00Z", NOW)).toBe("plus");
  });
});

describe("limits", () => {
  it("free cannot read slips", () => {
    expect(slipsRemaining("free", 0)).toBe(0);
    expect(slipsRemaining("free", 99)).toBe(0);
  });

  it("professional has 5 slips a month", () => {
    expect(slipsRemaining("plus", 0)).toBe(5);
    expect(slipsRemaining("plus", 4)).toBe(1);
    expect(slipsRemaining("plus", 5)).toBe(0);
    expect(slipsRemaining("plus", 99)).toBe(0);
  });

  it("ultimate is unlimited and has every paid feature", () => {
    expect(slipsRemaining("ultimate", 500)).toBeNull();
    expect(can("ultimate", "savingsChart")).toBe(true);
  });

  it("feature flags", () => {
    expect(can("free", "savingsChart")).toBe(false);
    expect(can("plus", "savingsChart")).toBe(true);
  });
});
