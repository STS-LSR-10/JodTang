import type { TxType } from "@/lib/types";
import { extractDate } from "./date-parser";
import { normalizeThaiDigits, parseAmountToSatang } from "./thai-number";

export interface ParsedEntry {
  raw: string;
  type: TxType;
  title: string;
  /** Integer satang, always > 0. */
  amountSatang: number;
  occurredAt: Date;
  /** 0..1. Below CONFIRM_THRESHOLD the bot should ask before saving as confirmed. */
  confidence: number;
}

export interface ParseResult {
  entries: ParsedEntry[];
  /** Segments that did not contain a usable amount. */
  unparsed: string[];
}

export const CONFIRM_THRESHOLD = 0.7;
const MAX_TITLE_LENGTH = 60;
const MAX_INT_DIGITS = 9; // longer digit runs are phone numbers / ids, not money
const LARGE_AMOUNT_SATANG = 100_000_000; // 1,000,000 baht -> ask to confirm

export const INCOME_KEYWORDS = [
  "เงินเดือน",
  "โบนัส",
  "ขายของ",
  "ค่าคอม",
  "คอมมิชชั่น",
  "ปันผล",
  "ดอกเบี้ย",
  "รายได้",
  "ค่าจ้าง",
  // money received
  "รับเงิน",
  "ได้เงิน",
  "เงินเข้า",
  "เงินโอนเข้า",
  "โอนเข้า",
  "รับโอน",
  "ได้รับ",
  "รับค่า",
  "ค่าตอบแทน",
  "ขายได้",
  "กำไร",
  // windfalls and refunds
  "ถูกหวย",
  "ถูกรางวัล",
  "ถูกลอตเตอรี่",
  "ถูกลอตเตอรี",
  "รางวัลที่ 1",
  "ได้เงินคืน",
  "เงินคืน",
  "คืนเงิน",
];

const EXPENSE_OVERRIDES = [
  "ดอกเบี้ยจ่าย",
  "จ่ายดอกเบี้ย",
  "ไม่ได้รับ",
  "ซื้อหวย",
  "จ่ายคืน",
  "ขอคืนเงิน",
];

const AMOUNT_RE =
  /([+\-−–])?\s*(฿)?\s*(\d(?:[\d,]*\d)?(?:\.\d+)?)\s*(k(?![a-z])|พัน|หมื่น|แสน|ล้าน)?\s*(บาท|฿|บ\.|baht|thb)?/gi;

// Split on newline, ';' and ',' — but keep thousands separators like 20,000.
const SPLIT_RE = /\r?\n|;|，|,(?!\d{3}(?!\d))/;

interface AmountCandidate {
  index: number;
  length: number;
  sign: "+" | "-" | null;
  explicit: boolean;
  satang: number;
}

function findAmount(line: string): AmountCandidate | null {
  const candidates: AmountCandidate[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const numberText = m[3];
    if (!numberText) continue;
    const intDigits = numberText.replace(/,/g, "").split(".")[0] ?? "";
    if (intDigits.length > MAX_INT_DIGITS) continue;

    let sign: "+" | "-" | null = null;
    if (m[1]) {
      const before = line[m.index - 1];
      // A sign glued to a word ("7-11") is a hyphen, not a sign.
      if (before === undefined || /\s/.test(before)) sign = m[1] === "+" ? "+" : "-";
    }
    const satang = parseAmountToSatang(numberText, m[4]);
    if (satang <= 0) continue;

    candidates.push({
      index: m.index,
      length: m[0].length,
      sign,
      explicit: Boolean(sign || m[2] || m[4] || m[5]),
      satang,
    });
  }
  if (candidates.length === 0) return null;
  const explicit = candidates.filter((c) => c.explicit);
  return explicit.at(-1) ?? candidates.at(-1) ?? null;
}

function cleanTitle(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–:,.]+|[\s\-–:,.]+$/g, "")
    .trim();
}

function isIncomeTitle(title: string): boolean {
  if (EXPENSE_OVERRIDES.some((k) => title.includes(k))) return false;
  return INCOME_KEYWORDS.some((k) => title.includes(k));
}

// Links are never transactions (their digits would otherwise be read as amounts).
const URL_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|me|co|io|th)\b\/?/i;

function parseLine(segment: string, now: Date): ParsedEntry | null {
  const normalized = normalizeThaiDigits(segment).trim();
  if (!normalized) return null;
  if (URL_RE.test(normalized)) return null;

  const { text, date } = extractDate(normalized, now);
  const amount = findAmount(text);
  if (!amount) return null;

  const title = cleanTitle(
    text.slice(0, amount.index) + " " + text.slice(amount.index + amount.length),
  );
  if (title.length > MAX_TITLE_LENGTH) return null;

  let type: TxType;
  let confidence: number;
  if (amount.sign === "+") {
    type = "income";
    confidence = title ? 1 : 0.85;
  } else if (amount.sign === "-") {
    type = "expense";
    confidence = title ? 1 : 0.85;
  } else if (title && isIncomeTitle(title)) {
    type = "income";
    confidence = 0.95;
  } else {
    type = "expense";
    confidence = title ? 0.9 : 0.5;
  }
  if (amount.satang >= LARGE_AMOUNT_SATANG) confidence = Math.min(confidence, 0.6);

  const defaultTitle =
    !title && confidence >= CONFIRM_THRESHOLD
      ? type === "income"
        ? "รายรับ"
        : "รายจ่าย"
      : "รายการ";

  return {
    raw: segment.trim(),
    type,
    title: title || defaultTitle,
    amountSatang: amount.satang,
    occurredAt: date ?? now,
    confidence,
  };
}

/** Parse a chat message into zero or more transaction entries. */
export function parseMessage(input: string, now: Date = new Date()): ParseResult {
  const entries: ParsedEntry[] = [];
  const unparsed: string[] = [];
  for (const segment of input.split(SPLIT_RE)) {
    if (!segment.trim()) continue;
    const entry = parseLine(segment, now);
    if (entry) entries.push(entry);
    else unparsed.push(segment.trim());
  }
  return { entries, unparsed };
}
