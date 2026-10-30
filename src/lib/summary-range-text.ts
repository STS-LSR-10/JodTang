import type { DaySpec } from "@/lib/summary-range";
import { bangkokParts } from "@/lib/thai-date";

const MONTHS: [string, number][] = [
  // Thai, long then short (with and without dots)
  ["มกราคม", 1],
  ["กุมภาพันธ์", 2],
  ["มีนาคม", 3],
  ["เมษายน", 4],
  ["พฤษภาคม", 5],
  ["มิถุนายน", 6],
  ["กรกฎาคม", 7],
  ["สิงหาคม", 8],
  ["กันยายน", 9],
  ["ตุลาคม", 10],
  ["พฤศจิกายน", 11],
  ["ธันวาคม", 12],
  ["ม.ค.", 1],
  ["ก.พ.", 2],
  ["มี.ค.", 3],
  ["เม.ย.", 4],
  ["พ.ค.", 5],
  ["มิ.ย.", 6],
  ["ก.ค.", 7],
  ["ส.ค.", 8],
  ["ก.ย.", 9],
  ["ต.ค.", 10],
  ["พ.ย.", 11],
  ["ธ.ค.", 12],
  ["มค", 1],
  ["กพ", 2],
  ["มีค", 3],
  ["เมย", 4],
  ["พค", 5],
  ["มิย", 6],
  ["กค", 7],
  ["สค", 8],
  ["กย", 9],
  ["ตค", 10],
  ["พย", 11],
  ["ธค", 12],
  // English
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["may", 5],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sept", 9],
  ["sep", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
];
const escape = (s: string) => s.replace(/\./g, "\\.");
// longest names first, so "october" is not read as "oct" + "ober"
const MONTH_RE = [...MONTHS]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([n]) => escape(n))
  .join("|");
const monthOf = (name: string): number => {
  const n = name.toLowerCase();
  return MONTHS.find(([k]) => k === n)?.[1] ?? 0;
};

type Token = { kind: "date"; spec: DaySpec } | { kind: "day"; day: number } | { kind: "today" };

interface Found {
  token: Token;
  start: number;
  end: number;
}

const yearOf = (raw: string | undefined): number | null => (raw ? Number(raw) : null);

/** Every date-like piece of the text, left to right (each character belongs to at most one). */
function findTokens(text: string): Found[] {
  const re = new RegExp(
    [
      // 2026-10-20
      String.raw`(?<iy>\d{4})-(?<im>\d{1,2})-(?<id>\d{1,2})`,
      // 20/10, 20/10/2569, 20.10, 20.10.69
      String.raw`(?<sd>\d{1,2})[/.](?<sm>\d{1,2})(?:[/.](?<sy>\d{2,4}))?`,
      // 20oct, 20 ต.ค., 20 ตุลาคม 2569
      String.raw`(?<nd>\d{1,2})\s*(?<nm>${MONTH_RE})(?:\s*(?<ny>\d{4}))?(?![a-zก-๙])`,
      // oct 20, oct20, october 20 2026
      String.raw`(?<mm>${MONTH_RE})\s*(?<md>\d{1,2})(?:\s*,?\s*(?<my>\d{4}))?(?!\d)`,
      "(?<today>วันนี้)",
      // a bare day: only meaningful next to a date that names the month ("1-15 ต.ค.")
      String.raw`(?<bd>\d{1,2})(?!\d)`,
    ].join("|"),
    "g",
  );
  const out: Found[] = [];
  for (const m of text.matchAll(re)) {
    const g = m.groups ?? {};
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (g.iy) {
      out.push({
        token: {
          kind: "date",
          spec: { year: Number(g.iy), month: Number(g.im), day: Number(g.id) },
        },
        start,
        end,
      });
    } else if (g.sd) {
      out.push({
        token: {
          kind: "date",
          spec: { day: Number(g.sd), month: Number(g.sm), year: yearOf(g.sy) },
        },
        start,
        end,
      });
    } else if (g.nd) {
      out.push({
        token: {
          kind: "date",
          spec: { day: Number(g.nd), month: monthOf(g.nm ?? ""), year: yearOf(g.ny) },
        },
        start,
        end,
      });
    } else if (g.mm) {
      out.push({
        token: {
          kind: "date",
          spec: { day: Number(g.md), month: monthOf(g.mm), year: yearOf(g.my) },
        },
        start,
        end,
      });
    } else if (g.today) {
      out.push({ token: { kind: "today" }, start, end });
    } else if (g.bd) {
      out.push({ token: { kind: "day", day: Number(g.bd) }, start, end });
    }
  }
  return out;
}

/** What may stand before the first date ("ตั้งแต่", "จาก"…): and whether it means "from there to today". */
const LEADING = /^(?:ช่วง)?(?:(ตั้งแต่|จาก|from|since)\s*)?(?:วันที่\s*)?(?:ของ)?$/;
const BETWEEN =
  /^\s*(?:ถึงวันที่|ไปจนถึง|จนถึง|ถึง|ไป|to|until|through|thru|[-–—~])\s*(?:วันที่\s*)?$/;

export type RangeText = { start: DaySpec; end: DaySpec | "today" };

/**
 * A range of days typed in many ways: "20/10-30/10", "20oct-30oct", "20 ต.ค. ถึง 30 ต.ค.", "1-15 ต.ค.",
 * "oct 20 to oct 30", "2026-10-20 to 2026-10-30", "20.10-30.10", "ตั้งแต่ 20/10 ถึง วันนี้"… (what stands
 * after the word "สรุป"). A bare day ("1-15 ต.ค.") takes the month and year of the date next to it; one
 * date after "ตั้งแต่" / "จาก" runs to today. Null when it is not a whole range.
 */
export function parseRangeText(raw: string): RangeText | null {
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const found = findTokens(text);
  const first = found[0];
  if (!first) return null;
  const lead = LEADING.exec(text.slice(0, first.start).trim());
  if (!lead) return null;

  const second = found[1];
  if (!second) {
    // a single date: only "from … on" has an end (today)
    if (!lead[1] || text.slice(first.end).trim() !== "") return null;
    return first.token.kind === "date" ? { start: first.token.spec, end: "today" } : null;
  }
  if (found.length > 2) return null;
  if (!BETWEEN.test(text.slice(first.end, second.start))) return null;
  if (text.slice(second.end).trim() !== "") return null;

  const a = first.token;
  const b = second.token;
  if (a.kind === "today") return null;
  // fill a bare day from the date beside it
  let start: DaySpec;
  let end: DaySpec | "today";
  if (a.kind === "day") {
    if (b.kind !== "date") return null;
    start = { day: a.day, month: b.spec.month, year: b.spec.year };
    end = b.spec;
  } else {
    start = a.spec;
    if (b.kind === "today") end = "today";
    else if (b.kind === "day") end = { day: b.day, month: a.spec.month, year: a.spec.year };
    else end = b.spec;
  }
  return { start, end };
}

/** Does the text hold a date at all? (Then a failed range deserves the "how to write one" help.) */
export function hasDateToken(raw: string): boolean {
  return findTokens(raw.toLowerCase()).some((f) => f.token.kind === "date");
}

export type SummaryPreset = "yesterday" | "this-week" | "last-week" | "last-month";

export const PRESET_TITLE: Record<SummaryPreset, string> = {
  yesterday: "สรุปเมื่อวาน",
  "this-week": "สรุปสัปดาห์นี้",
  "last-week": "สรุปสัปดาห์ที่แล้ว",
  "last-month": "สรุปเดือนที่แล้ว",
};

const dayOf = (year: number, month: number, day: number): DaySpec => {
  // Date.UTC normalises overflow ("day 0" is the last day of the month before)
  const t = new Date(Date.UTC(year, month - 1, day));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};

/** The days of a ready-made summary, in Bangkok time. `end` null means "up to today". */
export function presetRange(
  preset: SummaryPreset,
  now: Date,
): { start: DaySpec; end: DaySpec | null } {
  const p = bangkokParts(now);
  const sinceMonday = (p.weekday + 6) % 7;
  switch (preset) {
    case "yesterday": {
      const d = dayOf(p.year, p.month, p.day - 1);
      return { start: d, end: d };
    }
    case "this-week":
      return { start: dayOf(p.year, p.month, p.day - sinceMonday), end: null };
    case "last-week":
      return {
        start: dayOf(p.year, p.month, p.day - sinceMonday - 7),
        end: dayOf(p.year, p.month, p.day - sinceMonday - 1),
      };
    case "last-month":
      return { start: dayOf(p.year, p.month - 1, 1), end: dayOf(p.year, p.month, 0) };
  }
}
