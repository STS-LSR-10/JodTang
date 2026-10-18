import { z } from "zod";
import { toSatang } from "@/lib/money";

/** What the model is asked to return. Validated with Zod; never trusted as-is. */
export const rawSlipSchema = z.object({
  is_slip: z.boolean(),
  kind: z.enum(["transfer", "receipt", "other"]).optional().nullable(),
  amount: z.union([z.number(), z.string()]).nullable().optional(),
  paid_at: z.string().nullable().optional(),
  payee_name: z.string().nullable().optional(),
  payee_bank: z.string().nullable().optional(),
  payee_account: z.string().nullable().optional(),
  payer_bank: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  /** Receipt lines (only asked for Ultimate users). */
  items: z
    .array(
      z.object({
        name: z.string().nullable().optional(),
        amount: z.union([z.number(), z.string()]).nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

/** JSON Schema twin of `rawSlipSchema`, for providers with structured output / tool use. */
export const SLIP_JSON_SCHEMA = {
  type: "object",
  properties: {
    is_slip: {
      type: "boolean",
      description: "true only if the image is a payment slip, transfer slip or receipt",
    },
    kind: { type: "string", enum: ["transfer", "receipt", "other"] },
    amount: { type: ["number", "null"], description: "Total amount in THB, e.g. 1250.50" },
    paid_at: {
      type: ["string", "null"],
      description: "ISO 8601 with +07:00, Gregorian year (convert Buddhist era). null if unknown",
    },
    payee_name: { type: ["string", "null"], description: "Recipient or shop name" },
    payee_bank: { type: ["string", "null"], description: "Recipient bank / wallet" },
    payee_account: {
      type: ["string", "null"],
      description: "Recipient account number as printed (may be masked)",
    },
    payer_bank: { type: ["string", "null"] },
    reference: { type: ["string", "null"], description: "Transaction / reference number" },
    memo: { type: ["string", "null"], description: "Note written by the sender" },
    items: {
      type: ["array", "null"],
      description: "Receipt lines, one per product, in printed order (receipts only)",
      items: {
        type: "object",
        properties: {
          name: { type: ["string", "null"], description: "Product name as printed" },
          amount: {
            type: ["number", "null"],
            description: "Price of that line in THB (quantity already multiplied)",
          },
        },
      },
    },
  },
  required: ["is_slip"],
} as const;

/** One product line of a receipt. */
export interface ReceiptItem {
  name: string;
  /** Integer satang, always > 0. */
  amountSatang: number;
}

export const MAX_RECEIPT_ITEMS = 30;
const MAX_ITEM_NAME = 60;

export interface SlipData {
  kind: "transfer" | "receipt" | "other";
  /** Integer satang, always > 0. */
  amountSatang: number;
  /** null when missing, unparsable or implausible (future / very old). */
  paidAt: Date | null;
  payeeName: string | null;
  payeeBank: string | null;
  /** Only the last 4 digits are ever kept. */
  payeeAccountLast4: string | null;
  payerBank: string | null;
  reference: string | null;
  memo: string | null;
  /** Product lines (empty unless the reader was asked for them and found some). */
  items: ReceiptItem[];
}

export type SlipRejection = "not_slip" | "unreadable" | "invalid_amount";

export type SlipResult = { ok: true; data: SlipData } | { ok: false; reason: SlipRejection };

const MAX_FUTURE_MS = 24 * 60 * 60 * 1000; // tolerate clock skew
const MAX_AGE_DAYS = 365 * 5;
const MAX_SATANG = 100_000_000_00; // 100 million baht

function clean(value: string | null | undefined, max: number): string | null {
  const s = (value ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function parseAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text =
    typeof value === "number"
      ? value.toFixed(2)
      : value.replace(/[,฿\s]/g, "").replace(/(บาท|thb)$/i, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const satang = toSatang(text);
  return satang > 0 && satang < MAX_SATANG ? satang : null;
}

function parsePaidAt(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null;
  // Buddhist-era years (e.g. 2569-10-15) -> Gregorian
  const normalized = value.replace(/^(\d{4})/, (y) =>
    Number(y) >= 2400 ? String(Number(y) - 543) : y,
  );
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() > now.getTime() + MAX_FUTURE_MS) return null;
  if (date.getTime() < now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
  return date;
}

/**
 * Validate and minimise a model response. Account numbers are cut down to their last 4
 * digits here, so nothing sensitive can reach the database or logs.
 */
export function sanitizeSlip(raw: unknown, now: Date = new Date()): SlipResult {
  const parsed = rawSlipSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "unreadable" };
  const r = parsed.data;
  if (!r.is_slip) return { ok: false, reason: "not_slip" };

  const amountSatang = parseAmount(r.amount);
  if (amountSatang === null) return { ok: false, reason: "invalid_amount" };

  const digits = (r.payee_account ?? "").replace(/\D/g, "");
  const reference = clean(r.reference, 40)?.replace(/[^A-Za-z0-9]/g, "") || null;

  return {
    ok: true,
    data: {
      kind: r.kind ?? "other",
      amountSatang,
      paidAt: parsePaidAt(r.paid_at, now),
      payeeName: clean(r.payee_name, 60),
      payeeBank: clean(r.payee_bank, 40),
      payeeAccountLast4: digits.length >= 4 ? digits.slice(-4) : null,
      payerBank: clean(r.payer_bank, 40),
      reference,
      memo: clean(r.memo, 60),
      items: sanitizeItems(r.items),
    },
  };
}

/** Keep readable lines only (a name and a positive amount), at most MAX_RECEIPT_ITEMS. */
export function sanitizeItems(
  raw: { name?: string | null; amount?: number | string | null }[] | null | undefined,
): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  for (const line of raw ?? []) {
    const name = clean(line.name, MAX_ITEM_NAME);
    const amountSatang = parseAmount(line.amount);
    if (name && amountSatang !== null) items.push({ name, amountSatang });
    if (items.length >= MAX_RECEIPT_ITEMS) break;
  }
  return items;
}

/** Product lines as saved in `slips.ocr_json.items` ({ name, amount: "12.50" }). */
export function parseStoredItems(ocrJson: unknown): ReceiptItem[] {
  const parsed = z
    .object({ items: z.array(z.object({ name: z.string(), amount: z.string() })).optional() })
    .safeParse(ocrJson);
  if (!parsed.success) return [];
  return sanitizeItems(parsed.data.items);
}
