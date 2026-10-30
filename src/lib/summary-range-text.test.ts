import { describe, expect, it } from "vitest";
import type { DaySpec } from "./summary-range";
import { hasDateToken, parseRangeText, presetRange } from "./summary-range-text";

const d = (day: number, month: number, year: number | null = null): DaySpec => ({
  day,
  month,
  year,
});

describe("parseRangeText: the many ways to write a range", () => {
  it.each([
    // numeric, with a slash or a dot
    ["20/10-30/10", d(20, 10), d(30, 10)],
    ["20/10 - 30/10", d(20, 10), d(30, 10)],
    ["20/10 ถึง 30/10", d(20, 10), d(30, 10)],
    ["20/10 ถึงวันที่ 30/10", d(20, 10), d(30, 10)],
    ["20/10 ไป 30/10", d(20, 10), d(30, 10)],
    ["20/10 to 30/10", d(20, 10), d(30, 10)],
    ["20/10–30/10", d(20, 10), d(30, 10)], // en dash
    ["20/10 — 30/10", d(20, 10), d(30, 10)], // em dash
    ["20/10~30/10", d(20, 10), d(30, 10)],
    ["20.10-30.10", d(20, 10), d(30, 10)],
    ["20/10/2569-30/10/2569", d(20, 10, 2569), d(30, 10, 2569)],
    ["20/10/26 - 30/10/26", d(20, 10, 26), d(30, 10, 26)],
    ["2026-10-20 to 2026-10-30", d(20, 10, 2026), d(30, 10, 2026)],
    ["2026-10-20 - 2026-10-30", d(20, 10, 2026), d(30, 10, 2026)],
    // month names: English
    ["20oct-30oct", d(20, 10), d(30, 10)],
    ["20 oct - 30 oct", d(20, 10), d(30, 10)],
    ["20 Oct to 30 Oct", d(20, 10), d(30, 10)],
    ["20 october - 30 october 2026", d(20, 10), d(30, 10, 2026)],
    ["oct 20 - oct 30", d(20, 10), d(30, 10)],
    ["oct20-oct30", d(20, 10), d(30, 10)],
    ["1 sep - 30 sept", d(1, 9), d(30, 9)],
    ["5 may-9 may", d(5, 5), d(9, 5)],
    // month names: Thai
    ["20 ต.ค. - 30 ต.ค.", d(20, 10), d(30, 10)],
    ["20 ต.ค. ถึง 30 ต.ค.", d(20, 10), d(30, 10)],
    ["20ต.ค.-30ต.ค.", d(20, 10), d(30, 10)],
    ["20 ตค - 30 ตค", d(20, 10), d(30, 10)],
    ["20 ตุลาคม - 30 ตุลาคม 2569", d(20, 10), d(30, 10, 2569)],
    ["25 ก.ย. - 24 ต.ค.", d(25, 9), d(24, 10)],
    // a bare day takes the month of the date beside it
    ["1-15 ต.ค.", d(1, 10), d(15, 10)],
    ["1 - 15 oct", d(1, 10), d(15, 10)],
    ["20-30 oct 2026", d(20, 10, 2026), d(30, 10, 2026)],
    ["20 oct - 30", d(20, 10), d(30, 10)],
    ["วันที่ 1 ถึง 15 ต.ค.", d(1, 10), d(15, 10)],
    ["1/10 - 15", d(1, 10), d(15, 10)],
    // mixed styles, Thai digits, case, spaces
    ["20/10 - 30 ต.ค.", d(20, 10), d(30, 10)],
    [
      "๒๐/๑๐ ถึง ๓๐/๑๐".replace(/[๐-๙]/g, (c) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(c))),
      d(20, 10),
      d(30, 10),
    ],
    ["  20OCT  -  30OCT  ", d(20, 10), d(30, 10)],
    // words before the dates
    ["ตั้งแต่ 20/10 ถึง 30/10", d(20, 10), d(30, 10)],
    ["จาก 20/10 ถึง 30/10", d(20, 10), d(30, 10)],
    ["ช่วง 20/10-30/10", d(20, 10), d(30, 10)],
    ["วันที่ 20/10 ถึงวันที่ 30/10", d(20, 10), d(30, 10)],
    ["from 20 oct to 30 oct", d(20, 10), d(30, 10)],
  ])("%s", (input, start, end) => {
    expect(parseRangeText(input)).toEqual({ start, end });
  });

  it("an end of today", () => {
    expect(parseRangeText("1/10 ถึง วันนี้")).toEqual({ start: d(1, 10), end: "today" });
    expect(parseRangeText("1 oct - วันนี้")).toEqual({ start: d(1, 10), end: "today" });
  });

  it("one date after ตั้งแต่ / จาก / from / since runs to today", () => {
    expect(parseRangeText("ตั้งแต่ 20/10")).toEqual({ start: d(20, 10), end: "today" });
    expect(parseRangeText("จาก 20 ต.ค.")).toEqual({ start: d(20, 10), end: "today" });
    expect(parseRangeText("since oct 20")).toEqual({ start: d(20, 10), end: "today" });
  });

  it.each([
    "",
    "หมวด",
    "20/10", // a single date with no "from"
    "20/10 ถึง", // the other end is missing
    "20/10 ถึง อะไรสักอย่าง",
    "20/10 และ 30/10", // not a range word
    "20/10 30/10", // no separator
    "20/10-25/10-30/10", // three dates
    "20-30", // no month anywhere
    "วันนี้ ถึง 30/10",
    "20/10 ถึง 30/10 เท่าไร", // trailing words
    "กาแฟ 20/10-30/10", // words before are not allowed
  ])("%j is not a range", (input) => {
    expect(parseRangeText(input)).toBeNull();
  });
});

describe("hasDateToken", () => {
  it("is true when a date is in the text (so a broken range gets the help text)", () => {
    expect(hasDateToken("20/10")).toBe(true);
    expect(hasDateToken("20 ต.ค. ถึง")).toBe(true);
    expect(hasDateToken("oct 20")).toBe(true);
    expect(hasDateToken("หมวด")).toBe(false);
    expect(hasDateToken("30")).toBe(false); // a bare number is not a date
  });
});

describe("presetRange (Wednesday 28 Oct 2026, Bangkok)", () => {
  const now = new Date("2026-10-28T03:00:00Z");
  it("yesterday", () => {
    expect(presetRange("yesterday", now)).toEqual({ start: d(27, 10, 2026), end: d(27, 10, 2026) });
  });
  it("this week: from Monday, up to today", () => {
    expect(presetRange("this-week", now)).toEqual({ start: d(26, 10, 2026), end: null });
  });
  it("last week: the Monday to the Sunday before", () => {
    expect(presetRange("last-week", now)).toEqual({ start: d(19, 10, 2026), end: d(25, 10, 2026) });
  });
  it("last month: the 1st to the last day, over a year change too", () => {
    expect(presetRange("last-month", now)).toEqual({ start: d(1, 9, 2026), end: d(30, 9, 2026) });
    expect(presetRange("last-month", new Date("2026-01-15T03:00:00Z"))).toEqual({
      start: d(1, 12, 2025),
      end: d(31, 12, 2025),
    });
  });
  it("this week across a month change", () => {
    // Sunday 1 Nov 2026: the week began Monday 26 Oct
    expect(presetRange("this-week", new Date("2026-11-01T03:00:00Z")).start).toEqual(
      d(26, 10, 2026),
    );
  });
});
