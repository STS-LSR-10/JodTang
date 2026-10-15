import { bangkokParts, fromBangkok, isValidYmd } from "@/lib/thai-date";

export interface DateExtraction {
  /** The line with the date phrase removed. */
  text: string;
  /** Resolved moment, or null when the line has no (valid) date phrase. */
  date: Date | null;
}

const LEAD_WORD = /^(เมื่อวานซืน|เมื่อวาน|วันนี้)\s*/;
const TRAIL_WORD = /\s+(เมื่อวานซืน|เมื่อวาน|วันนี้)$/;
const LEAD_DMY = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)\s*/;
const TRAIL_DMY = /(?<=^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

const WORD_OFFSETS: Record<string, number> = { วันนี้: 0, เมื่อวาน: 1, เมื่อวานซืน: 2 };

function atDay(now: Date, year: number, month: number, day: number): Date {
  const today = bangkokParts(now);
  const isToday = today.year === year && today.month === month && today.day === day;
  // Today keeps the real time; other days are noon in Bangkok.
  return isToday ? now : fromBangkok(year, month, day, 12);
}

function resolveWord(word: string, now: Date): Date | null {
  const offset = WORD_OFFSETS[word];
  if (offset === undefined) return null;
  const today = bangkokParts(now);
  const moved = bangkokParts(fromBangkok(today.year, today.month, today.day - offset, 12));
  return atDay(now, moved.year, moved.month, moved.day);
}

function resolveDmy(dayStr: string, monthStr: string, yearStr: string | undefined, now: Date) {
  const day = Number(dayStr);
  const month = Number(monthStr);
  const today = bangkokParts(now);
  let year: number;
  if (yearStr === undefined) {
    year = today.year;
    // A day/month later than today means last year.
    if (month > today.month || (month === today.month && day > today.day)) year -= 1;
  } else {
    year = Number(yearStr);
    if (year >= 2400)
      year -= 543; // Buddhist era
    else if (year < 100) year += 2000;
  }
  if (!isValidYmd(year, month, day)) return null;
  return atDay(now, year, month, day);
}

/** Extract a leading/trailing date phrase: วันนี้, เมื่อวาน, เมื่อวานซืน, DD/MM, DD/MM/YY(YY, พ.ศ. ok). */
export function extractDate(line: string, now: Date): DateExtraction {
  const trimmed = line.trim();

  let m = LEAD_WORD.exec(trimmed);
  if (m?.[1]) {
    return { text: trimmed.slice(m[0].length).trim(), date: resolveWord(m[1], now) };
  }
  m = TRAIL_WORD.exec(trimmed);
  if (m?.[1]) {
    return { text: trimmed.slice(0, m.index).trim(), date: resolveWord(m[1], now) };
  }
  m = LEAD_DMY.exec(trimmed);
  if (m?.[1] && m[2]) {
    const date = resolveDmy(m[1], m[2], m[3], now);
    if (date) return { text: trimmed.slice(m[0].length).trim(), date };
  }
  m = TRAIL_DMY.exec(trimmed);
  if (m?.[1] && m[2]) {
    const date = resolveDmy(m[1], m[2], m[3], now);
    if (date) return { text: trimmed.slice(0, m.index).trim(), date };
  }
  return { text: trimmed, date: null };
}
