import type { ReceiptItem } from "@/lib/ocr/slip-schema";

export const REMAINDER_TITLE = "ส่วนต่างในใบเสร็จ";

export type SplitPlan =
  | {
      ok: true;
      /** Entries to create: every product line, then the remainder when the total is higher. */
      lines: ReceiptItem[];
      /** Satang between the lines and the receipt total (VAT, service charge...); 0 if none. */
      remainderSatang: number;
    }
  | { ok: false; reason: "too_few" | "over_total" };

/**
 * How a receipt becomes several entries. The entries always add up to the receipt total: when the
 * lines come to less (VAT, service charge, a line the reader missed) one extra line carries the
 * difference. When the lines come to MORE than the total (a discount on the whole bill) there is no
 * honest way to split, so the receipt stays as one entry.
 */
export function planReceiptSplit(totalSatang: number, items: ReceiptItem[]): SplitPlan {
  if (items.length < 2) return { ok: false, reason: "too_few" };
  const sum = items.reduce((acc, i) => acc + i.amountSatang, 0);
  if (sum > totalSatang) return { ok: false, reason: "over_total" };
  const remainderSatang = totalSatang - sum;
  const lines =
    remainderSatang > 0
      ? [...items, { name: REMAINDER_TITLE, amountSatang: remainderSatang }]
      : [...items];
  return { ok: true, lines, remainderSatang };
}
