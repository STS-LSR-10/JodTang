import { describe, expect, it } from "vitest";
import { alertText, budgetState, crossedThreshold, percentUsed } from "./budget";

describe("percentUsed / budgetState", () => {
  it("handles zero and missing budgets", () => {
    expect(percentUsed(5000, 0)).toBe(0);
    expect(percentUsed(0, 10000)).toBe(0);
  });

  it("rounds down", () => {
    expect(percentUsed(7999, 10000)).toBe(79);
    expect(percentUsed(8000, 10000)).toBe(80);
  });

  it.each([
    [7999, "ok"],
    [8000, "warn"],
    [9999, "warn"],
    [10000, "over"],
    [25000, "over"],
  ] as const)("spent %i of 10000 is %s", (spent, state) => {
    expect(budgetState(spent, 10000)).toBe(state);
  });
});

describe("crossedThreshold", () => {
  const limit = 100_000; // 1,000 baht

  it("fires 80 when crossing from below", () => {
    expect(crossedThreshold(70_000, 85_000, limit)).toBe(80);
  });

  it("fires when landing exactly on 80%", () => {
    expect(crossedThreshold(70_000, 80_000, limit)).toBe(80);
  });

  it("fires 100 when crossing the limit", () => {
    expect(crossedThreshold(90_000, 100_000, limit)).toBe(100);
  });

  it("a jump over both lines reports 100 only", () => {
    expect(crossedThreshold(10_000, 120_000, limit)).toBe(100);
  });

  it("does not repeat 80 once already past it", () => {
    expect(crossedThreshold(85_000, 90_000, limit)).toBeNull();
  });

  it("does not repeat 100 once already over", () => {
    expect(crossedThreshold(105_000, 130_000, limit)).toBeNull();
  });

  it("is silent without a budget or without spending", () => {
    expect(crossedThreshold(0, 50_000, 0)).toBeNull();
    expect(crossedThreshold(50_000, 50_000, limit)).toBeNull();
  });
});

describe("alertText", () => {
  it("overall 80%", () => {
    expect(
      alertText({ level: 80, scopeName: null, spentSatang: 80_000, limitSatang: 100_000 }),
    ).toBe("งบรวมใช้ไปแล้ว 80% (฿800 จาก ฿1,000)");
  });

  it("category over budget", () => {
    expect(
      alertText({ level: 100, scopeName: "อาหาร", spentSatang: 120_050, limitSatang: 100_000 }),
    ).toBe("เกินงบหมวดอาหารแล้ว (฿1,200.50 จาก ฿1,000)");
  });
});
