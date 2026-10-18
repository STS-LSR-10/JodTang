import { describe, expect, it } from "vitest";
import { daySpecFromIso, MAX_RANGE_DAYS, resolveRange, type DaySpec } from "./summary-range";

const NOW = new Date("2026-10-17T08:00:00Z"); // 15:00 on 17 Oct 2026 in Bangkok
const d = (day: number, month: number, year: number | null = null): DaySpec => ({
  day,
  month,
  year,
});
const iso = (date: Date) => date.toISOString();

function ok(start: DaySpec, end: DaySpec | null) {
  const r = resolveRange(start, end, NOW);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r;
}

describe("resolveRange", () => {
  it("covers whole Bangkok days: from midnight of the first to midnight after the last", () => {
    const r = ok(d(1, 10), d(15, 10));
    expect(iso(r.range.from)).toBe("2026-09-30T17:00:00.000Z"); // 1 Oct 00:00 +07
    expect(iso(r.range.to)).toBe("2026-10-15T17:00:00.000Z"); // 16 Oct 00:00 +07
    expect(r.days).toBe(15);
  });

  it("a single day is one day long", () => {
    const r = ok(d(10, 10), d(10, 10));
    expect(r.days).toBe(1);
    expect(r.range.to.getTime() - r.range.from.getTime()).toBe(86_400_000);
  });

  it("no end means up to and including today", () => {
    const r = ok(d(10, 10), null);
    expect(r.days).toBe(8); // 10..17 Oct
    expect(iso(r.range.to)).toBe("2026-10-17T17:00:00.000Z"); // 18 Oct 00:00 +07
  });

  it("the previous period is the same length right before", () => {
    const r = ok(d(1, 10), d(15, 10));
    expect(r.previous.to).toEqual(r.range.from);
    expect(r.previous.to.getTime() - r.previous.from.getTime()).toBe(15 * 86_400_000);
  });

  it("without a year a date is the latest one not after the end (a cycle across New Year)", () => {
    const r = ok(d(25, 12), d(24, 1));
    expect(iso(r.range.from)).toBe("2025-12-24T17:00:00.000Z"); // 25 Dec 2025
    expect(iso(r.range.to)).toBe("2026-01-24T17:00:00.000Z"); // 25 Jan 2026
    expect(r.days).toBe(31);
  });

  it("a date still ahead this year means last year", () => {
    const r = ok(d(25, 12), d(31, 12, 2025));
    expect(iso(r.range.from)).toBe("2025-12-24T17:00:00.000Z");
  });

  it("reads Buddhist and two-digit years", () => {
    expect(ok(d(1, 1, 2569), d(31, 1, 2569)).days).toBe(31);
    expect(ok(d(1, 1, 26), d(31, 1, 26)).days).toBe(31);
  });

  it("cuts an end after today to today", () => {
    const r = ok(d(10, 10), d(31, 10, 2026));
    expect(r.days).toBe(8);
  });

  it("rejects a start after the end", () => {
    expect(resolveRange(d(15, 10, 2026), d(1, 10, 2026), NOW)).toEqual({
      ok: false,
      reason: "order",
    });
    expect(resolveRange(d(1, 12, 2026), null, NOW)).toEqual({ ok: false, reason: "order" });
  });

  it("rejects dates that do not exist", () => {
    expect(resolveRange(d(31, 2), d(1, 3), NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveRange(d(1, 13), null, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveRange(d(1, 10), d(30, 2), NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("allows exactly 366 days and no more", () => {
    // 17 Oct 2025 .. 17 Oct 2026 = 366 days
    expect(ok(d(17, 10, 2025), null).days).toBe(MAX_RANGE_DAYS);
    expect(resolveRange(d(16, 10, 2025), null, NOW)).toEqual({ ok: false, reason: "too_long" });
  });

  it("near midnight in Bangkok 'today' is the Bangkok day, not the UTC one", () => {
    const late = new Date("2026-10-17T18:30:00Z"); // already 18 Oct 01:30 in Bangkok
    const r = resolveRange(d(18, 10), null, late);
    expect(r.ok && r.days).toBe(1);
  });
});

describe("daySpecFromIso", () => {
  it("reads the date picker's value", () => {
    expect(daySpecFromIso("2026-10-12")).toEqual({ year: 2026, month: 10, day: 12 });
  });
  it("rejects anything else", () => {
    expect(daySpecFromIso("2026-02-31")).toBeNull();
    expect(daySpecFromIso("12/10/2026")).toBeNull();
    expect(daySpecFromIso(undefined)).toBeNull();
  });
});
