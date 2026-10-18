import { bangkokParts, fromBangkok, isValidYmd } from "@/lib/thai-date";

export interface DateExtraction {
  /** The line with the date phrase removed. */
  text: string;
  /** Resolved moment, or null when the line has no (valid) date phrase. */
  date: Date | null;
}

// A day word anywhere in the line ("จ่ายค่าทุเรียน เมื่อวาน 300", "ซื้อของวันนี้ 80"). Longest first,
// so "เมื่อวานซืน" and "เมื่อวานนี้" are not read as "เมื่อวาน" plus leftovers.
const DAY_WORD = /(เมื่อวานซืน|เมื่อวานนี้|เมื่อวาน|วันนี้)/;
const LEAD_DMY = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)\s*/;
const TRAIL_DMY = /(?<=^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

const WORD_OFFSETS: Record<string, number> = {
  วันนี้: 0,
  เมื่อวาน: 1,
  เมื่อวานนี้: 1,
  เมื่อวานซืน: 2,
};

// A DD/MM in the middle of a line, set apart by spaces.
const MID_DMY = /(?<=^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)/g;

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

/** Cut `length` characters at `index` out of a line and close the gap with one space. */
function cutOut(line: string, index: number, length: number): string {
  return `${line.slice(0, index)} ${line.slice(index + length)}`.replace(/\s+/g, " ").trim();
}

/**
 * Mid-line "1/2" is far more likely a fraction ("ข้าว 1/2 จาน 50") than a date, so there only a
 * DD/MM that cannot be one counts: it names a year, or its day is above 12, or its month is above 8
 * ("12/10", "25/3"; not "1/2", "3/4", "5/6"). At the start or end of the line any DD/MM counts.
 */
function plausibleMidDate(day: number, month: number, hasYear: boolean): boolean {
  return hasYear || day > 12 || month > 8;
}

/**
 * Extract a date phrase from anywhere in the line: วันนี้, เมื่อวาน, เมื่อวานนี้, เมื่อวานซืน,
 * DD/MM, DD/MM/YY(YY, พ.ศ. ok). The phrase is cut out of the returned text.
 */
export function extractDate(line: string, now: Date): DateExtraction {
  const trimmed = line.trim();

  const word = DAY_WORD.exec(trimmed);
  if (word?.[1]) {
    return {
      text: cutOut(trimmed, word.index, word[0].length),
      date: resolveWord(word[1], now),
    };
  }
  let m = LEAD_DMY.exec(trimmed);
  if (m?.[1] && m[2]) {
    const date = resolveDmy(m[1], m[2], m[3], now);
    if (date) return { text: trimmed.slice(m[0].length).trim(), date };
  }
  m = TRAIL_DMY.exec(trimmed);
  if (m?.[1] && m[2]) {
    const date = resolveDmy(m[1], m[2], m[3], now);
    if (date) return { text: trimmed.slice(0, m.index).trim(), date };
  }
  for (const mid of trimmed.matchAll(MID_DMY)) {
    const [whole, d, mo, y] = mid;
    if (!d || !mo || !whole) continue;
    if (!plausibleMidDate(Number(d), Number(mo), y !== undefined)) continue;
    const date = resolveDmy(d, mo, y, now);
    if (date) return { text: cutOut(trimmed, mid.index, whole.length), date };
  }
  return { text: trimmed, date: null };
}
