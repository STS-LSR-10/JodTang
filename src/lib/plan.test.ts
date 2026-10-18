import { describe, expect, it } from "vitest";
import { can, effectivePlan, FAIR_USE, recurringLimit, slipsRemaining, VOICE_LIMIT } from "./plan";

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

  it("professional has 30 slips a month", () => {
    expect(slipsRemaining("plus", 0)).toBe(30);
    expect(slipsRemaining("plus", 29)).toBe(1);
    expect(slipsRemaining("plus", 30)).toBe(0);
    expect(slipsRemaining("plus", 99)).toBe(0);
  });

  it("voice logging is Professional and above, with a monthly number each", () => {
    expect(can("free", "voiceLog")).toBe(false);
    expect(can("plus", "voiceLog")).toBe(true);
    expect(can("ultimate", "voiceLog")).toBe(true);
    expect(VOICE_LIMIT.plus).toBe(20);
    expect(VOICE_LIMIT.ultimate).toBe(FAIR_USE.voice);
  });

  it("Ultimate has more recurring entries than Professional", () => {
    expect(recurringLimit("free")).toBe(0);
    expect(recurringLimit("plus")).toBe(20);
    expect(recurringLimit("ultimate")).toBe(100);
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

describe("export and dashboard", () => {
  it("are Professional and above, never Free", () => {
    for (const feature of ["export", "dashboard"] as const) {
      expect(can("free", feature)).toBe(false);
      expect(can("plus", feature)).toBe(true);
      expect(can("ultimate", feature)).toBe(true);
    }
  });
});
