import { describe, expect, it } from "vitest";
import { gregorianYear, MAX_YEARS_BACK, resolveYear } from "./year-summary";
import { fromBangkok } from "./thai-date";

const NOW = new Date("2026-10-17T08:00:00Z"); // 17 Oct 2026 in Bangkok
const iso = (d: Date) => d.toISOString();

function ok(spec: number | "last" | null) {
  const r = resolveYear(spec, NOW);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r;
}

describe("gregorianYear", () => {
  it("turns Buddhist years into Gregorian ones", () => {
    expect(gregorianYear(2569)).toBe(2026);
    expect(gregorianYear(2026)).toBe(2026);
  });
});

describe("resolveYear", () => {
  it("this year runs from 1 January up to and including today, with the months so far", () => {
    const y = ok(null);
    expect(y.year).toBe(2026);
    expect(y.current).toBe(true);
    expect(iso(y.range.from)).toBe(iso(fromBangkok(2026, 1, 1)));
    expect(iso(y.range.to)).toBe(iso(fromBangkok(2026, 10, 18)));
    expect(y.months).toHaveLength(10);
    expect(iso(y.months[0]!)).toBe(iso(fromBangkok(2026, 1, 1)));
  });

  it("this year is compared with the same days a year earlier", () => {
    const y = ok(null);
    expect(iso(y.previous.from)).toBe(iso(fromBangkok(2025, 1, 1)));
    expect(iso(y.previous.to)).toBe(iso(fromBangkok(2025, 10, 18)));
  });

  it("a past year is the whole year, twelve months, against the year before", () => {
    const y = ok(2568);
    expect(y.year).toBe(2025);
    expect(y.current).toBe(false);
    expect(iso(y.range.to)).toBe(iso(fromBangkok(2026, 1, 1)));
    expect(y.months).toHaveLength(12);
    expect(iso(y.previous.from)).toBe(iso(fromBangkok(2024, 1, 1)));
    expect(iso(y.previous.to)).toBe(iso(fromBangkok(2025, 1, 1)));
  });

  it("'last' is the year before this one", () => {
    expect(ok("last").year).toBe(2025);
  });

  it("accepts Gregorian and Buddhist years alike", () => {
    expect(ok(2024).year).toBe(2024);
    expect(ok(2567).year).toBe(2024);
  });

  it("refuses a year that has not started and one too far back", () => {
    expect(resolveYear(2027, NOW)).toEqual({ ok: false, reason: "future" });
    expect(resolveYear(2570, NOW)).toEqual({ ok: false, reason: "future" });
    expect(resolveYear(2026 - MAX_YEARS_BACK - 1, NOW)).toEqual({ ok: false, reason: "too_old" });
    expect(resolveYear(2026 - MAX_YEARS_BACK, NOW).ok).toBe(true);
  });

  it("on 1 January the year so far is one day", () => {
    const y = resolveYear(null, new Date("2026-01-01T03:00:00Z"));
    expect(y.ok && y.months).toHaveLength(1);
    expect(y.ok && iso(y.range.to)).toBe(iso(fromBangkok(2026, 1, 2)));
  });

  it("near midnight the year follows Bangkok, not UTC", () => {
    // 31 Dec 2026 18:30 UTC is already 1 Jan 2027 in Bangkok
    expect(
      resolveYear(null, new Date("2026-12-31T18:30:00Z")).ok &&
        (resolveYear(null, new Date("2026-12-31T18:30:00Z")) as { year: number }).year,
    ).toBe(2027);
  });
});
