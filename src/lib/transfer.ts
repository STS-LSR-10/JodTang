import { parseAmountToSatang } from "@/lib/parse/thai-number";

export const MAX_TRANSFER_NOTE = 60;

/** A transfer as the web app receives it. */
export interface TransferDto {
  id: string;
  fromId: string | null;
  fromName: string;
  toId: string | null;
  toName: string;
  amountSatang: number;
  occurredAt: string;
  note: string | null;
}

export interface TransferText {
  amountSatang: number;
  from: string;
  to: string;
}

const AMOUNT_RE = /(\d(?:[\d,]*\d)?(?:\.\d+)?)\s*(k|พัน|หมื่น|แสน|ล้าน)?\s*(?:บาท)?/;
// ">" , "->", "→" may touch the names; the Thai words need spaces around them (names can contain "ไป")
const SEPARATOR_RE = /\s*(?:->|→|>)\s*|\s+(?:ไปที่|ไป|เข้า)\s+/;

/**
 * "โอน 500 เงินสด>KTC", "โอน 500 จาก เงินสด ไป KTC", "โอน เงินสด ไป KTC 500". Returns null when it
 * does not look like a transfer between two named places ("โอนค่าเช่า 5000" is an ordinary entry).
 * `text` is the message already trimmed, lowercased and with Thai digits turned into numbers.
 */
export function parseTransferText(text: string): TransferText | null {
  if (!text.startsWith("โอน")) return null;
  let rest = text
    .slice("โอน".length)
    .replace(/^เงิน(?=\s|\d)/, "")
    .trim();
  const amount = AMOUNT_RE.exec(rest);
  if (!amount?.[1]) return null;
  const satang = parseAmountToSatang(amount[1], amount[2]);
  if (satang <= 0) return null;
  rest = `${rest.slice(0, amount.index)} ${rest.slice(amount.index + amount[0].length)}`
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^จาก\s+/, "");
  const parts = rest.split(SEPARATOR_RE).map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { amountSatang: satang, from: parts[0], to: parts[1] };
}
