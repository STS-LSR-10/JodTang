import {
  bangkokParts,
  formatThaiDayMonth,
  formatThaiMonthShort,
  fromBangkok,
} from "@/lib/thai-date";

export type Bucket = "day" | "week" | "month";

export const BUCKET_COUNTS: Record<Bucket, number> = { month: 6, week: 8, day: 14 };

export interface SeriesPoint {
  /** ISO start of the bucket (Bangkok midnight). */
  start: string;
  label: string;
  incomeSatang: number;
  expenseSatang: number;
}

export interface SeriesRow {
  bucket_start: string;
  income: number | string;
  expense: number | string;
}

/**
 * Bucket start instants (oldest first) ending with the bucket that contains `now`, plus the end
 * bound. `windows` (0, -1, -2…) moves the whole list back by that many lists (6 months, 8 weeks or
 * 14 days each), so the page can step through earlier stretches of time.
 */
export function bucketStarts(now: Date, bucket: Bucket, windows = 0): { starts: Date[]; to: Date } {
  const p = bangkokParts(now);
  const n = BUCKET_COUNTS[bucket];
  const back = Math.min(0, Math.trunc(windows)) * n; // buckets to move back (<= 0)
  const starts: Date[] = [];

  if (bucket === "month") {
    for (let i = n - 1; i >= 0; i--) starts.push(fromBangkok(p.year, p.month + back - i, 1));
    return { starts, to: fromBangkok(p.year, p.month + back + 1, 1) };
  }
  if (bucket === "week") {
    const sinceMonday = (p.weekday + 6) % 7;
    const monday = p.day - sinceMonday + 7 * back;
    for (let i = n - 1; i >= 0; i--) starts.push(fromBangkok(p.year, p.month, monday - 7 * i));
    return { starts, to: fromBangkok(p.year, p.month, monday + 7) };
  }
  const day = p.day + back;
  for (let i = n - 1; i >= 0; i--) starts.push(fromBangkok(p.year, p.month, day - i));
  return { starts, to: fromBangkok(p.year, p.month, day + 1) };
}

function labelOf(start: Date, bucket: Bucket): string {
  if (bucket === "month") return formatThaiMonthShort(start);
  if (bucket === "week") return formatThaiDayMonth(start);
  return String(bangkokParts(start).day);
}

/** Merge DB rows into a continuous series (empty buckets become zeros). */
export function fillSeries(
  starts: Date[],
  rows: SeriesRow[],
  bucket: Bucket,
  toSatang: (v: number | string) => number,
): SeriesPoint[] {
  const byTime = new Map<number, SeriesRow>();
  for (const r of rows) byTime.set(new Date(r.bucket_start).getTime(), r);
  return starts.map((start) => {
    const row = byTime.get(start.getTime());
    return {
      start: start.toISOString(),
      label: labelOf(start, bucket),
      incomeSatang: row ? toSatang(row.income) : 0,
      expenseSatang: row ? toSatang(row.expense) : 0,
    };
  });
}
