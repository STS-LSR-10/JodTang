import { bangkokParts, fromBangkok } from "@/lib/thai-date";

export type Cadence = "daily" | "weekly" | "monthly";

/**
 * Recurring rules are scheduled by Bangkok calendar day. `next_run_at` is that day's midnight
 * (Bangkok) and the generated entry is dated the same instant.
 *
 * day_of_period: weekly -> 0..6 (0 = Sunday); monthly -> 1..31 (clamped to short months);
 * daily -> ignored.
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthlyOn(year: number, month: number, day: number): Date {
  // month may overflow (13 -> next January); fromBangkok normalises it
  const norm = bangkokParts(fromBangkok(year, month, 1));
  const clamped = Math.min(day, daysInMonth(norm.year, norm.month));
  return fromBangkok(norm.year, norm.month, clamped);
}

/** The first run on or after today (Bangkok). */
export function firstRunAt(now: Date, cadence: Cadence, dayOfPeriod: number | null): Date {
  const p = bangkokParts(now);
  const today = fromBangkok(p.year, p.month, p.day);

  if (cadence === "daily") return today;

  if (cadence === "weekly") {
    const target = dayOfPeriod ?? p.weekday;
    const ahead = (target - p.weekday + 7) % 7;
    return fromBangkok(p.year, p.month, p.day + ahead);
  }

  const day = dayOfPeriod ?? p.day;
  const thisMonth = monthlyOn(p.year, p.month, day);
  return thisMonth.getTime() >= today.getTime() ? thisMonth : monthlyOn(p.year, p.month + 1, day);
}

/** The run after `current`. Monthly uses the rule's own day so a 31st recovers after February. */
export function nextRunAfter(current: Date, cadence: Cadence, dayOfPeriod: number | null): Date {
  const p = bangkokParts(current);
  if (cadence === "daily") return fromBangkok(p.year, p.month, p.day + 1);
  if (cadence === "weekly") return fromBangkok(p.year, p.month, p.day + 7);
  return monthlyOn(p.year, p.month + 1, dayOfPeriod ?? p.day);
}

/** Runs due at `now`, oldest first, capped so a long outage cannot flood the ledger. */
export function dueRuns(
  nextRunAt: Date,
  now: Date,
  cadence: Cadence,
  dayOfPeriod: number | null,
  maxCatchUp = 12,
): Date[] {
  const runs: Date[] = [];
  let cursor = nextRunAt;
  while (cursor.getTime() <= now.getTime() && runs.length < maxCatchUp) {
    runs.push(cursor);
    cursor = nextRunAfter(cursor, cadence, dayOfPeriod);
  }
  return runs;
}

/** Where the rule should continue after processing `ranCount` runs. */
export function resumeAfter(
  nextRunAt: Date,
  ranCount: number,
  cadence: Cadence,
  dayOfPeriod: number | null,
): Date {
  let cursor = nextRunAt;
  for (let i = 0; i < ranCount; i++) cursor = nextRunAfter(cursor, cadence, dayOfPeriod);
  return cursor;
}

export function describeRule(cadence: Cadence, dayOfPeriod: number | null): string {
  const weekdays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
  if (cadence === "daily") return "ทุกวัน";
  if (cadence === "weekly") return `ทุกวัน${weekdays[dayOfPeriod ?? 0] ?? ""}`;
  return `ทุกเดือน วันที่ ${dayOfPeriod ?? 1}`;
}
