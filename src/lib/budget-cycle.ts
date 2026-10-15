import type { BudgetCycle } from "@/lib/types";
import { bangkokParts, fromBangkok } from "@/lib/thai-date";

export interface DateRange {
  /** inclusive */
  from: Date;
  /** exclusive */
  to: Date;
}

/** Bangkok calendar day containing `now`. */
export function dayRange(now: Date): DateRange {
  const p = bangkokParts(now);
  return { from: fromBangkok(p.year, p.month, p.day), to: fromBangkok(p.year, p.month, p.day + 1) };
}

/** Bangkok calendar month containing `now`. */
export function calendarMonthRange(now: Date): DateRange {
  const p = bangkokParts(now);
  return { from: fromBangkok(p.year, p.month, 1), to: fromBangkok(p.year, p.month + 1, 1) };
}

/**
 * The budget cycle containing `now`.
 * monthly: starts on `startDay` (1-28) each month; weekly: starts on Monday.
 */
export function cycleRange(now: Date, cycle: BudgetCycle, startDay = 1): DateRange {
  const p = bangkokParts(now);
  if (cycle === "weekly") {
    const sinceMonday = (p.weekday + 6) % 7;
    return {
      from: fromBangkok(p.year, p.month, p.day - sinceMonday),
      to: fromBangkok(p.year, p.month, p.day - sinceMonday + 7),
    };
  }
  const day = Math.min(Math.max(Math.trunc(startDay), 1), 28);
  const startMonth = p.day >= day ? p.month : p.month - 1;
  return {
    from: fromBangkok(p.year, startMonth, day),
    to: fromBangkok(p.year, startMonth + 1, day),
  };
}
