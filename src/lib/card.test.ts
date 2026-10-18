import { describe, expect, it } from "vitest";
import {
  cardStatus,
  limitAlert,
  nextDayOfMonth,
  previousStatementCycle,
  statementCycle,
} from "./card";
import type { Wallet } from "./wallet";

const card = (over: Partial<Wallet> = {}): Wallet => ({
  id: "c1",
  name: "KTC",
  kind: "card",
  isDefault: false,
  openingSatang: 0,
  incomeSatang: 0,
  expenseSatang: 0,
  transferInSatang: 0,
  transferOutSatang: 0,
  entryCount: 0,
  creditLimitSatang: 5_000_000,
  statementDay: 25,
  dueDay: 10,
  ...over,
});

// 2026-10-18 in Bangkok
const NOW = new Date("2026-10-18T05:00:00Z");

describe("statement cycle", () => {
  it("runs from the statement day to the next one", () => {
    const c = statementCycle(NOW, 25);
    expect(c.from.toISOString()).toBe("2026-09-24T17:00:00.000Z"); // 25 Sep 00:00 Bangkok
    expect(c.to.toISOString()).toBe("2026-10-24T17:00:00.000Z"); // 25 Oct
  });

  it("the previous cycle ends where this one starts", () => {
    const prev = previousStatementCycle(NOW, 25);
    expect(prev.to.toISOString()).toBe(statementCycle(NOW, 25).from.toISOString());
    expect(prev.from.toISOString()).toBe("2026-08-24T17:00:00.000Z");
  });

  it("after the statement day the cycle has moved on", () => {
    const c = statementCycle(new Date("2026-10-26T05:00:00Z"), 25);
    expect(c.from.toISOString()).toBe("2026-10-24T17:00:00.000Z");
  });
});

describe("nextDayOfMonth", () => {
  it("is this month when the day is still ahead, today included", () => {
    expect(nextDayOfMonth(NOW, 25).toISOString()).toBe("2026-10-24T17:00:00.000Z");
    expect(nextDayOfMonth(NOW, 18).toISOString()).toBe("2026-10-17T17:00:00.000Z");
  });

  it("is next month once it has passed (also across the year end)", () => {
    expect(nextDayOfMonth(NOW, 10).toISOString()).toBe("2026-11-09T17:00:00.000Z");
    expect(nextDayOfMonth(new Date("2026-12-20T05:00:00Z"), 5).toISOString()).toBe(
      "2027-01-04T17:00:00.000Z",
    );
  });
});

describe("cardStatus", () => {
  it("owed, available and percent of the limit", () => {
    const s = cardStatus(card({ openingSatang: -1_250_000 }), { cycle: 300, previous: 200 }, NOW);
    expect(s).toMatchObject({
      owedSatang: 1_250_000,
      availableSatang: 3_750_000,
      usedPercent: 25,
      cycleSpentSatang: 300,
      previousCycleSpentSatang: 200,
    });
  });

  it("paying in more than is owed is not 'owed' (a credit balance)", () => {
    expect(
      cardStatus(card({ transferInSatang: 100 }), { cycle: 0, previous: 0 }, NOW).owedSatang,
    ).toBe(0);
  });

  it("over the limit gives a negative amount available and more than 100%", () => {
    const s = cardStatus(card({ expenseSatang: 6_000_000 }), { cycle: 0, previous: 0 }, NOW);
    expect(s.availableSatang).toBe(-1_000_000);
    expect(s.usedPercent).toBe(120);
  });

  it("without a limit or days there is nothing to compute", () => {
    const s = cardStatus(
      card({ creditLimitSatang: null, statementDay: null, dueDay: null }),
      { cycle: 0, previous: 0 },
      NOW,
    );
    expect(s).toMatchObject({
      limitSatang: null,
      availableSatang: null,
      usedPercent: null,
      cycle: null,
      nextStatement: null,
      nextDue: null,
    });
  });
});

describe("limitAlert", () => {
  const limit = 1_000_000; // ฿10,000

  it("warns when the amount owed crosses 80%", () => {
    const msg = limitAlert(card({ creditLimitSatang: limit, expenseSatang: 850_000 }), 100_000);
    expect(msg).toContain("80%");
    expect(msg).toContain("KTC");
  });

  it("says the card is full when it crosses 100%", () => {
    const msg = limitAlert(card({ creditLimitSatang: limit, expenseSatang: 1_050_000 }), 300_000);
    expect(msg).toContain("เต็มวงเงิน");
  });

  it("is quiet when no line was crossed (already past 80% before, or still low)", () => {
    expect(
      limitAlert(card({ creditLimitSatang: limit, expenseSatang: 900_000 }), 50_000),
    ).toBeNull();
    expect(
      limitAlert(card({ creditLimitSatang: limit, expenseSatang: 300_000 }), 100_000),
    ).toBeNull();
  });

  it("is quiet without a limit and for a wallet that is not a card", () => {
    expect(limitAlert(card({ creditLimitSatang: null, expenseSatang: 9_000_000 }), 100)).toBeNull();
    expect(
      limitAlert(card({ kind: "bank", creditLimitSatang: limit, expenseSatang: 950_000 }), 100_000),
    ).toBeNull();
  });
});
