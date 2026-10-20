import { toSatang } from "@/lib/money";
import { normalizeThaiDigits } from "@/lib/parse/thai-number";
import { MAX_SPLIT_NAMES, splitAmount } from "@/lib/trip";

export const MAX_BILL_TITLE = 40;
export const MAX_BILL_MEMBERS = 30;
export const MAX_OPEN_BILLS = 10;
/** A bill is at most ฿1,000,000 (the database says the same). */
export const MAX_BILL_SATANG = 100_000_000;
/** Buttons "ได้รับจาก …" on the collecting card: more people than this use the typed command. */
export const MAX_PAID_BUTTONS = 8;

export type BillStatus = "joining" | "collecting" | "settled" | "cancelled";

export interface BillRow {
  id: string;
  groupId: string;
  payerLineUserId: string;
  title: string;
  amountSatang: number;
  status: BillStatus;
  createdAt: string;
}

export interface BillMemberRow {
  lineUserId: string;
  shareSatang: number | null;
  paid: boolean;
  qrToken: string;
}

export type BillCommand =
  | { kind: "bill-new"; title: string; amountSatang: number; names: string[] }
  | { kind: "bill-usage" }
  | { kind: "bill-chase" }
  | { kind: "bill-open" }
  | { kind: "bill-close" }
  | { kind: "bill-cancel" }
  | { kind: "bill-paid"; names: string[] };

const AMOUNT_RE = /\d[\d,]*(?:\.\d{1,2})?/;

/**
 * "หารบิล หมูกระทะ 1200" · "หารบิล หมูกระทะ 1200 แอน บ๊อบ" (those two are added straight away) ·
 * "หารบิล 1200 หมูกระทะ" (the amount first: the rest is the name). Also "ตามเงิน", "บิลค้าง",
 * "ปิดรายชื่อ", "ยกเลิกบิล" and "ได้รับแล้ว แอน".
 */
export function parseBillCommand(input: string): BillCommand | null {
  const text = normalizeThaiDigits(input).trim().replace(/\s+/g, " ");
  if (text === "ตามเงิน") return { kind: "bill-chase" };
  if (text === "บิลค้าง") return { kind: "bill-open" };
  if (text === "ปิดรายชื่อ") return { kind: "bill-close" };
  if (text === "ยกเลิกบิล") return { kind: "bill-cancel" };
  const paid = /^ได้รับ(?:แล้ว)?\s+(.+)$/.exec(text);
  if (paid?.[1]) {
    const names = paid[1].split(/[\s,]+/).filter(Boolean);
    return names.length > 0 && names.length <= MAX_SPLIT_NAMES
      ? { kind: "bill-paid", names }
      : null;
  }

  if (text === "หารบิล") return { kind: "bill-usage" };
  const m = /^หารบิล\s+(.+)$/.exec(text);
  if (!m?.[1]) return null;
  const body = m[1];
  const found = AMOUNT_RE.exec(body);
  if (!found) return { kind: "bill-usage" };
  let amountSatang: number;
  try {
    amountSatang = toSatang(found[0]);
  } catch {
    return { kind: "bill-usage" };
  }
  if (amountSatang <= 0 || amountSatang > MAX_BILL_SATANG) return { kind: "bill-usage" };
  const before = body.slice(0, found.index).trim();
  const after = body.slice(found.index + found[0].length).trim();
  if (before === "") {
    // amount first: what follows is the name of the bill
    const title = after || "บิล";
    return title.length <= MAX_BILL_TITLE
      ? { kind: "bill-new", title, amountSatang, names: [] }
      : { kind: "bill-usage" };
  }
  const names = after.split(/[\s,]+/).filter(Boolean);
  if (before.length > MAX_BILL_TITLE || names.length > MAX_SPLIT_NAMES)
    return { kind: "bill-usage" };
  return { kind: "bill-new", title: before, amountSatang, names };
}

export interface BillShare {
  lineUserId: string;
  shareSatang: number;
  /** The payer's own share counts as paid. */
  paid: boolean;
}

/**
 * Everyone's share of a bill, equal, in whole satang that add up to the bill exactly. The payer is
 * always one of the people sharing it (the leftover satang go to them first).
 */
export function billShares(amountSatang: number, people: string[], payer: string): BillShare[] {
  const everyone = people.includes(payer) ? people : [payer, ...people];
  return [...splitAmount(amountSatang, everyone, payer)].map(([lineUserId, shareSatang]) => ({
    lineUserId,
    shareSatang,
    paid: lineUserId === payer,
  }));
}

/** Who still owes: not paid yet, the payer excluded. */
export function unpaid(members: BillMemberRow[], payer: string): BillMemberRow[] {
  return members.filter((m) => !m.paid && m.lineUserId !== payer);
}

export function totalOwed(members: BillMemberRow[], payer: string): number {
  return unpaid(members, payer).reduce((s, m) => s + (m.shareSatang ?? 0), 0);
}
