import { describe, expect, it } from "vitest";
import { calendarMonthRange, cycleRange, dayRange } from "./budget-cycle";

// Thu 2026-10-15 15:00 Bangkok
const NOW = new Date("2026-10-15T08:00:00Z");

describe("budget-cycle", () => {
  it("dayRange covers the Bangkok day", () => {
    const r = dayRange(NOW);
    expect(r.from.toISOString()).toBe("2026-10-14T17:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-15T17:00:00.000Z");
  });

  it("a day just after midnight Bangkok belongs to the new Bangkok day", () => {
    const r = dayRange(new Date("2026-10-14T17:30:00Z")); // 00:30 on the 15th Bangkok
    expect(r.from.toISOString()).toBe("2026-10-14T17:00:00.000Z");
  });

  it("calendar month", () => {
    const r = calendarMonthRange(NOW);
    expect(r.from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("monthly cycle starting on the 1st", () => {
    const r = cycleRange(NOW, "monthly", 1);
    expect(r.from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("monthly cycle that started last month", () => {
    const r = cycleRange(NOW, "monthly", 25); // 15th < 25 -> since Sep 25
    expect(r.from.toISOString()).toBe("2026-09-24T17:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-24T17:00:00.000Z");
  });

  it("monthly cycle across a year boundary", () => {
    const r = cycleRange(new Date("2027-01-05T05:00:00Z"), "monthly", 20);
    expect(r.from.toISOString()).toBe("2026-12-19T17:00:00.000Z");
    expect(r.to.toISOString()).toBe("2027-01-19T17:00:00.000Z");
  });

  it("weekly cycle starts on Monday", () => {
    const r = cycleRange(NOW, "weekly");
    expect(r.from.toISOString()).toBe("2026-10-11T17:00:00.000Z"); // Mon Oct 12 00:00 BKK
    expect(r.to.toISOString()).toBe("2026-10-18T17:00:00.000Z");
  });

  it("clamps an out-of-range start day", () => {
    const r = cycleRange(NOW, "monthly", 31);
    expect(r.from.toISOString()).toBe("2026-09-27T17:00:00.000Z"); // 28th of Sep
  });
});
