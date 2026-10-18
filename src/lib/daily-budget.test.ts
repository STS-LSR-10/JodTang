import { describe, expect, it } from "vitest";
import { SCOLD_COUNT, dailyBudgetAlert, dailyBudgetStatus } from "./daily-budget";

const LIMIT = 50_000; // ฿500

describe("dailyBudgetAlert", () => {
  it("scolds the first time the day goes over the limit, naming spent, limit and the excess", () => {
    const msg = dailyBudgetAlert({
      beforeSatang: 40_000,
      afterSatang: 62_000,
      limitSatang: LIMIT,
      pick: 0,
    });
    expect(msg).toContain("฿620");
    expect(msg).toContain("฿500");
    expect(msg).toContain("฿120");
  });

  it("is exactly on the limit: not over yet, so quiet", () => {
    expect(
      dailyBudgetAlert({ beforeSatang: 40_000, afterSatang: 50_000, limitSatang: LIMIT }),
    ).toBeNull();
  });

  it("one satang over is over", () => {
    expect(
      dailyBudgetAlert({ beforeSatang: 49_999, afterSatang: 50_001, limitSatang: LIMIT, pick: 0 }),
    ).not.toBeNull();
  });

  it("more spending while already over gives one short line with the excess so far", () => {
    expect(
      dailyBudgetAlert({ beforeSatang: 62_000, afterSatang: 70_000, limitSatang: LIMIT }),
    ).toBe("ยังเกินงบวันนี้อยู่ ฿200");
  });

  it("is quiet when under the limit, when nothing was added, and without a limit", () => {
    expect(
      dailyBudgetAlert({ beforeSatang: 10_000, afterSatang: 20_000, limitSatang: LIMIT }),
    ).toBeNull();
    expect(
      dailyBudgetAlert({ beforeSatang: 60_000, afterSatang: 60_000, limitSatang: LIMIT }),
    ).toBeNull();
    expect(dailyBudgetAlert({ beforeSatang: 0, afterSatang: 900_000, limitSatang: 0 })).toBeNull();
  });

  it("has several phrasings, all mentioning the excess, picked by the random number", () => {
    expect(SCOLD_COUNT).toBeGreaterThanOrEqual(4);
    const phrasings = new Set<string>();
    for (let i = 0; i < SCOLD_COUNT; i++) {
      const msg = dailyBudgetAlert({
        beforeSatang: 40_000,
        afterSatang: 62_000,
        limitSatang: LIMIT,
        pick: i / SCOLD_COUNT,
      });
      expect(msg).toContain("฿120");
      phrasings.add(msg ?? "");
    }
    expect(phrasings.size).toBe(SCOLD_COUNT);
  });

  it("a random number of 1 (or more) still picks a real phrasing", () => {
    expect(
      dailyBudgetAlert({ beforeSatang: 0, afterSatang: 90_000, limitSatang: LIMIT, pick: 1 }),
    ).toContain("฿400");
  });
});

describe("dailyBudgetStatus", () => {
  it("shows used, percent and what is left", () => {
    expect(dailyBudgetStatus(32_000, LIMIT)).toBe("งบวันนี้ ฿500 · ใช้ไป ฿320 (64%) · เหลือ ฿180");
  });

  it("says how much over when over", () => {
    expect(dailyBudgetStatus(62_000, LIMIT)).toContain("เกินมา ฿120");
  });
});
