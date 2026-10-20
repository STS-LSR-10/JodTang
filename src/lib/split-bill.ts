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

export type PaidVia = "payer" | "slip" | "slip_unverified";

export interface BillMemberRow {
  lineUserId: string;
  shareSatang: number | null;
  paid: boolean;
  qrToken: string;
  /** "โอนแล้ว": said they paid, the payer has not confirmed yet. */
  claimed?: boolean;
  paidVia?: PaidVia | null;
}

export type BillCommand =
  | { kind: "bill-new"; title: string; amountSatang: number; names: string[] }
  | { kind: "bill-usage" }
  | { kind: "bill-chase" }
  | { kind: "bill-open" }
  | { kind: "bill-close" }
  | { kind: "bill-cancel" }
  | { kind: "bill-paid"; names: string[] }
  | { kind: "bill-unpaid"; names: string[] }
  | { kind: "bill-claim" };

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
  if (text === "โอนแล้ว") return { kind: "bill-claim" };
  const unpaidWords = /^ยังไม่ได้รับ\s+(.+)$/.exec(text);
  if (unpaidWords?.[1]) {
    const names = unpaidWords[1].split(/[\s,]+/).filter(Boolean);
    return names.length > 0 && names.length <= MAX_SPLIT_NAMES
      ? { kind: "bill-unpaid", names }
      : null;
  }
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

// ───────────── paying by slip ─────────────

/** What a person still owes on a bill, as the slip check sees it. */
export interface OpenShare {
  bill: BillRow;
  shareSatang: number;
}

/** Where the payer of a bill wants to be paid (only the digits matter here). */
export interface PayeeDigits {
  promptpayId: string | null;
  bankAccount: string | null;
}

/** The last four digits of every place the payer can be paid; the slip's receiver must be one of them. */
export function receiverLast4s(payee: PayeeDigits | null): string[] {
  if (!payee) return [];
  return [payee.promptpayId, payee.bankAccount]
    .map((v) => (v ?? "").replace(/\D/g, ""))
    .filter((d) => d.length >= 4)
    .map((d) => d.slice(-4));
}

export type SlipVerdict =
  | {
      kind: "paid";
      share: OpenShare;
      /** The receiver on the slip matched the payer's account; "unverified" = it could not be read or compared. */
      receiver: "verified" | "unverified";
      /** Satang sent over the share. */
      overSatang: number;
    }
  | { kind: "receiver_mismatch"; share: OpenShare }
  | { kind: "too_little"; amountSatang: number; smallestShareSatang: number }
  | { kind: "before_bill"; share: OpenShare };

/** A slip made before the bill was opened cannot pay it (a few minutes of clock difference are fine). */
const EARLY_SLACK_MS = 10 * 60_000;

/**
 * Does this slip pay one of the person's open shares? It must be for at least the share (more is fine and
 * is mentioned), made after the bill was opened (when the slip says when), and sent to the payer's
 * account when the slip shows enough of it to tell. When the receiver cannot be told the share is still
 * marked paid, flagged "unverified", and the payer can take it back.
 */
export function evaluateSlip(input: {
  open: OpenShare[];
  amountSatang: number;
  paidAt: Date | null;
  receiverLast4: string | null;
  payeeOf: (payerLineUserId: string) => PayeeDigits | null;
}): SlipVerdict | null {
  if (input.open.length === 0) return null;
  const enough = input.open.filter((s) => s.shareSatang <= input.amountSatang);
  if (enough.length === 0) {
    return {
      kind: "too_little",
      amountSatang: input.amountSatang,
      smallestShareSatang: Math.min(...input.open.map((s) => s.shareSatang)),
    };
  }
  // the share the slip is closest to; the older bill first when two are equal
  const chosen = [...enough].sort(
    (a, b) => b.shareSatang - a.shareSatang || a.bill.createdAt.localeCompare(b.bill.createdAt),
  )[0] as OpenShare;

  if (
    input.paidAt &&
    input.paidAt.getTime() < new Date(chosen.bill.createdAt).getTime() - EARLY_SLACK_MS
  ) {
    return { kind: "before_bill", share: chosen };
  }
  const accounts = receiverLast4s(input.payeeOf(chosen.bill.payerLineUserId));
  let receiver: "verified" | "unverified" = "unverified";
  if (input.receiverLast4 && accounts.length > 0) {
    if (!accounts.includes(input.receiverLast4))
      return { kind: "receiver_mismatch", share: chosen };
    receiver = "verified";
  }
  return {
    kind: "paid",
    share: chosen,
    receiver,
    overSatang: input.amountSatang - chosen.shareSatang,
  };
}
