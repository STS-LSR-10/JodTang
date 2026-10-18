import { describe, expect, it } from "vitest";
import { MIN_PLAN, type Feature } from "./plan";
import {
  FEATURE_GROUPS,
  MIN_CHARGE_BAHT,
  PRICES,
  prepaidUpgradeQuote,
  TRIAL_DAYS,
  yearlyPerDay,
  yearlySavingPercent,
} from "./pricing";

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

describe("what each plan can do", () => {
  const rows = FEATURE_GROUPS.flatMap((g) => g.rows);

  it("every real feature gate is listed, with the same plan as the gate", () => {
    for (const [feature, min] of Object.entries(MIN_PLAN) as [Feature, "plus" | "ultimate"][]) {
      const row = rows.find((r) => r.feature === feature);
      expect(row, `no row for ${feature}`).toBeDefined();
      const [free, plus, ultimate] = row!.cells;
      expect(ultimate, feature).not.toBe(false);
      if (min === "ultimate") expect(plus, feature).toBe(false);
      else expect(plus, feature).not.toBe(false);
      // a gated feature is not fully open to Free (at most a taste, like "1 ใบ")
      expect(free === true, feature).toBe(false);
    }
  });

  it("rows are short and every limit text sits on a plan that has the feature", () => {
    for (const row of rows) {
      expect(row.label.length, row.label).toBeLessThanOrEqual(40);
      const [free, plus, ultimate] = row.cells;
      if (typeof free === "string") expect(plus).not.toBe(false);
      if (typeof plus === "string") expect(ultimate).not.toBe(false);
    }
  });
});

describe("trial", () => {
  it("is 7 days", () => {
    expect(TRIAL_DAYS).toBe(7);
  });
});

describe("prepaidUpgradeQuote", () => {
  const now = new Date("2026-10-17T00:00:00Z");
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

  it("monthly prepaid: the daily price difference times the days left, rounded up", () => {
    // (139 - 59) / 30 * 15 = 40
    expect(
      prepaidUpgradeQuote({ from: "plus", to: "ultimate", months: 1, expiresAt: inDays(15), now }),
    ).toEqual({ amountBaht: 40, days: 15 });
    // 10 days: 80/30*10 = 26.67 -> 27
    expect(
      prepaidUpgradeQuote({ from: "plus", to: "ultimate", months: 1, expiresAt: inDays(10), now })
        ?.amountBaht,
    ).toBe(27);
  });

  it("yearly prepaid uses the yearly rates", () => {
    // (799 - 299) / 365 * 200 = 273.97 -> 274
    expect(
      prepaidUpgradeQuote({
        from: "plus",
        to: "ultimate",
        months: 12,
        expiresAt: inDays(200),
        now,
      }),
    ).toEqual({ amountBaht: 274, days: 200 });
  });

  it("never charges less than Stripe's minimum or more than a full new period", () => {
    const tiny = prepaidUpgradeQuote({
      from: "plus",
      to: "ultimate",
      months: 1,
      expiresAt: inDays(1),
      now,
    });
    expect(tiny?.amountBaht).toBe(MIN_CHARGE_BAHT);
    const huge = prepaidUpgradeQuote({
      from: "plus",
      to: "ultimate",
      months: 1,
      expiresAt: inDays(400),
      now,
    });
    expect(huge?.amountBaht).toBe(PRICES.ultimate.monthly);
  });

  it("counts a started day as a whole day", () => {
    const q = prepaidUpgradeQuote({
      from: "plus",
      to: "ultimate",
      months: 1,
      expiresAt: new Date(now.getTime() + 36 * 3_600_000),
      now,
    });
    expect(q?.days).toBe(2);
  });

  it("is null when the target is not a higher tier", () => {
    expect(
      prepaidUpgradeQuote({ from: "plus", to: "plus", months: 1, expiresAt: inDays(5), now }),
    ).toBeNull();
    expect(
      prepaidUpgradeQuote({ from: "ultimate", to: "plus", months: 1, expiresAt: inDays(5), now }),
    ).toBeNull();
  });
});
