import { describe, expect, it } from "vitest";
import { POINTS_PER_PLUS_DAY } from "./config";
import { bangkokDateKey, currentStreak, redeemable } from "./points";

// Fri 2026-10-16 15:00 Bangkok
const NOW = new Date("2026-10-16T08:00:00Z");

describe("bangkokDateKey", () => {
  it("uses the Bangkok calendar day", () => {
    expect(bangkokDateKey(new Date("2026-10-16T08:00:00Z"))).toBe("2026-10-16");
    // 17:30 UTC on the 15th is already the 16th in Bangkok
    expect(bangkokDateKey(new Date("2026-10-15T17:30:00Z"))).toBe("2026-10-16");
    expect(bangkokDateKey(new Date("2026-10-15T16:59:00Z"))).toBe("2026-10-15");
  });
});

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-10-16", "2026-10-15", "2026-10-14"], NOW)).toBe(3);
  });

  it("stays alive through yesterday", () => {
    expect(currentStreak(["2026-10-15", "2026-10-14"], NOW)).toBe(2);
  });

  it("breaks after a missed day", () => {
    expect(currentStreak(["2026-10-16", "2026-10-14", "2026-10-13"], NOW)).toBe(1);
    expect(currentStreak(["2026-10-14", "2026-10-13"], NOW)).toBe(0);
  });

  it("handles month boundaries and unordered or duplicate input", () => {
    const now = new Date("2026-11-01T05:00:00Z"); // 1 Nov Bangkok
    expect(currentStreak(["2026-10-30", "2026-11-01", "2026-10-31", "2026-10-31"], now)).toBe(3);
  });

  it("is zero without data", () => {
    expect(currentStreak([], NOW)).toBe(0);
  });
});

describe("redeemable", () => {
  it("converts whole days only", () => {
    expect(redeemable(0)).toEqual({ days: 0, cost: 0 });
    expect(redeemable(POINTS_PER_PLUS_DAY - 1)).toEqual({ days: 0, cost: 0 });
    expect(redeemable(POINTS_PER_PLUS_DAY * 3 + 4)).toEqual({
      days: 3,
      cost: POINTS_PER_PLUS_DAY * 3,
    });
  });

  it("ignores negative balances", () => {
    expect(redeemable(-50)).toEqual({ days: 0, cost: 0 });
  });
});
