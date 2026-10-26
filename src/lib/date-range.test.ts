import { describe, expect, it } from "vitest";
import {
  addDays,
  compareYmd,
  formatRange,
  monthGrid,
  presetRange,
  rangeToFilter,
  ymdKey,
} from "./date-range";

// Sun 2026-10-25 12:00 Bangkok
const NOW = new Date("2026-10-25T05:00:00Z");

describe("monthGrid", () => {
  it("starts on a Sunday, ends on a Saturday, and holds the whole month", () => {
    const grid = monthGrid(2026, 10); // 1 Oct 2026 is a Thursday
    expect(grid.length % 7).toBe(0);
    expect(ymdKey(grid[0]!)).toBe("2026-09-27");
    expect(grid[0]!.inMonth).toBe(false);
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
    expect(ymdKey(grid.at(-1)!)).toBe("2026-10-31"); // a Saturday: five full weeks
  });

  it("a month that starts on Sunday has no leading days; February is short", () => {
    expect(monthGrid(2026, 3)[0]!.inMonth).toBe(true); // 1 Mar 2026 is a Sunday
    expect(monthGrid(2026, 2).filter((d) => d.inMonth)).toHaveLength(28);
    expect(monthGrid(2028, 2).filter((d) => d.inMonth)).toHaveLength(29);
  });
});

describe("addDays and compare", () => {
  it("crosses month and year ends", () => {
    expect(ymdKey(addDays({ year: 2026, month: 12, day: 31 }, 1))).toBe("2027-01-01");
    expect(ymdKey(addDays({ year: 2026, month: 3, day: 1 }, -1))).toBe("2026-02-28");
    expect(
      compareYmd({ year: 2026, month: 10, day: 9 }, { year: 2026, month: 10, day: 10 }),
    ).toBeLessThan(0);
  });
});

describe("rangeToFilter", () => {
  it("from the start of the first day to the start of the day after the last (Bangkok time)", () => {
    expect(
      rangeToFilter({ year: 2026, month: 10, day: 1 }, { year: 2026, month: 10, day: 31 }),
    ).toEqual({ from: "2026-09-30T17:00:00.000Z", to: "2026-10-31T17:00:00.000Z" });
  });
});

describe("presetRange", () => {
  it("this month, this week (Monday to Sunday), last month", () => {
    const m = presetRange("month", NOW);
    expect(formatRange(m.start, m.end)).toBe("1 ต.ค. 2569 — 31 ต.ค. 2569");
    const w = presetRange("week", NOW); // Sunday: the week started on Monday 19
    expect(formatRange(w.start, w.end)).toBe("19 ต.ค. 2569 — 25 ต.ค. 2569");
    const l = presetRange("lastMonth", NOW);
    expect(formatRange(l.start, l.end)).toBe("1 ก.ย. 2569 — 30 ก.ย. 2569");
  });

  it("last month in January is December of the year before", () => {
    const l = presetRange("lastMonth", new Date("2027-01-10T05:00:00Z"));
    expect(formatRange(l.start, l.end)).toBe("1 ธ.ค. 2569 — 31 ธ.ค. 2569");
  });
});
