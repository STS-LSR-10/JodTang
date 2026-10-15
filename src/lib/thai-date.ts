// Asia/Bangkok has a fixed UTC+7 offset (no DST), so plain arithmetic is safe.
const OFFSET_MS = 7 * 60 * 60 * 1000;

export interface BangkokParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

export function bangkokParts(date: Date): BangkokParts {
  const d = new Date(date.getTime() + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** Build a UTC Date from a Bangkok wall-clock time. Day/month overflow is normalized. */
export function fromBangkok(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS);
}

export function isValidYmd(year: number, month: number, day: number): boolean {
  const t = new Date(Date.UTC(year, month - 1, day));
  return t.getUTCFullYear() === year && t.getUTCMonth() === month - 1 && t.getUTCDate() === day;
}

const MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** "ต.ค." */
export function formatThaiMonthShort(date: Date): string {
  return MONTHS[bangkokParts(date).month - 1] ?? "";
}

/** "15 ต.ค." */
export function formatThaiDayMonth(date: Date): string {
  const p = bangkokParts(date);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "15 ต.ค. 2569" or "15 ต.ค. 2569 14:30" (Buddhist year, Bangkok time). */
export function formatThaiDate(date: Date, withTime = false): string {
  const p = bangkokParts(date);
  const base = `${p.day} ${MONTHS[p.month - 1]} ${p.year + 543}`;
  if (!withTime) return base;
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${base} ${hh}:${mm}`;
}
