import { describe, expect, it } from "vitest";
import { FEATURE_GROUPS, PRICES, yearlyPerDay, yearlySavingPercent } from "./pricing";

describe("pricing", () => {
  it("has the agreed prices", () => {
    expect(PRICES.plus).toEqual({ monthly: 59, yearly: 299 });
    expect(PRICES.ultimate).toEqual({ monthly: 139, yearly: 799 });
  });

  it("yearly is cheaper than twelve months and per-day is derived", () => {
    for (const p of Object.values(PRICES)) expect(p.yearly).toBeLessThan(p.monthly * 12);
    expect(yearlyPerDay(PRICES.plus)).toBe("0.8");
    expect(yearlyPerDay(PRICES.ultimate)).toBe("2.2");
    expect(yearlySavingPercent(PRICES.plus)).toBe(58);
    expect(yearlySavingPercent(PRICES.ultimate)).toBe(52);
  });

  it("every row has three cells and Free never has more than Professional", () => {
    for (const row of FEATURE_GROUPS.flatMap((g) => g.rows)) {
      expect(row.cells).toHaveLength(3);
      if (row.cells[0] === true) expect(row.cells[1]).toBe(true);
    }
  });
});
