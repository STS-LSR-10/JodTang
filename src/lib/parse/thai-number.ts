import { toSatang } from "@/lib/money";

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Replace Thai digits (๐-๙) with ASCII digits. */
export function normalizeThaiDigits(text: string): string {
  return text.replace(/[๐-๙]/g, (ch) => String(THAI_DIGITS.indexOf(ch)));
}

const UNIT_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  พัน: 1_000,
  หมื่น: 10_000,
  แสน: 100_000,
  ล้าน: 1_000_000,
};

/** "1,200.50" + optional unit ("k", "พัน", ...) -> integer satang. */
export function parseAmountToSatang(numberText: string, unit?: string): number {
  const base = toSatang(numberText.replace(/,/g, ""));
  const multiplier = unit ? (UNIT_MULTIPLIERS[unit.toLowerCase()] ?? 1) : 1;
  return base * multiplier;
}
