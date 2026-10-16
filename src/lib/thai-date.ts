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

const two = (n: number) => String(n).padStart(2, "0");

/** Value for `<input type="datetime-local">`: "2026-10-15T14:30" in Bangkok time. */
export function toBangkokInputValue(date: Date): string {
  const p = bangkokParts(date);
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}

/** Inverse of `toBangkokInputValue`; null when malformed or not a real date/time. */
export function fromBangkokInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (!isValidYmd(year, month, day) || hour > 23 || minute > 59) return null;
  return fromBangkok(year, month, day, hour, minute);
}

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
