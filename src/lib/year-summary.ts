import type { DateRange } from "@/lib/budget-cycle";
import { bangkokParts, fromBangkok } from "@/lib/thai-date";

export const MAX_YEARS_BACK = 10;

export type YearResult =
  | {
      ok: true;
      /** Gregorian year. */
      year: number;
      /** 1 Jan of the year up to today (this year) or the end of the year (a past one). */
      range: DateRange;
      /** The same days a year earlier. */
      previous: DateRange;
      /** True for the year in progress. */
      current: boolean;
      /** Start of each month of `range` (Bangkok), January first. */
      months: Date[];
    }
  | { ok: false; reason: "future" | "too_old" };

/** A typed year as Gregorian: 2569 -> 2026. */
export function gregorianYear(value: number): number {
  return value >= 2400 ? value - 543 : value;
}

/**
 * The calendar year asked for. `null` is this year, "last" is the one before; numbers may be
 * Buddhist or Gregorian. A year in progress runs up to and including today.
 */
export function resolveYear(spec: number | "last" | null, now: Date): YearResult {
  const today = bangkokParts(now);
  const year = spec === null ? today.year : spec === "last" ? today.year - 1 : gregorianYear(spec);
  if (year > today.year) return { ok: false, reason: "future" };
  if (year < today.year - MAX_YEARS_BACK) return { ok: false, reason: "too_old" };

  const isCurrent = year === today.year;
  const from = fromBangkok(year, 1, 1);
  const to = isCurrent
    ? fromBangkok(year, today.month, today.day + 1)
    : fromBangkok(year + 1, 1, 1);
  const previousTo = isCurrent
    ? fromBangkok(year - 1, today.month, today.day + 1)
    : fromBangkok(year, 1, 1);
  const lastMonth = isCurrent ? today.month : 12;
  return {
    ok: true,
    year,
    range: { from, to },
    previous: { from: fromBangkok(year - 1, 1, 1), to: previousTo },
    current: isCurrent,
    months: Array.from({ length: lastMonth }, (_, i) => fromBangkok(year, i + 1, 1)),
  };
}
