import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_ITEMS, parseStoredItems, sanitizeSlip } from "./slip-schema";

const NOW = new Date("2026-10-15T08:00:00Z");

const valid = {
  is_slip: true,
  kind: "transfer",
  amount: 1250.5,
  paid_at: "2026-10-14T09:30:00+07:00",
  payee_name: "นาย สมชาย ใจดี",
  payee_bank: "กสิกรไทย",
  payee_account: "123-4-56789-0",
  payer_bank: "ไทยพาณิชย์",
  reference: "2026 1014-ABC 123",
  memo: "ค่าข้าว",
};

function ok(raw: unknown) {
  const r = sanitizeSlip(raw, NOW);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.data;
}

describe("sanitizeSlip", () => {
  it("accepts a normal transfer slip", () => {
    const d = ok(valid);
    expect(d.amountSatang).toBe(125_050);
    expect(d.payeeName).toBe("นาย สมชาย ใจดี");
    expect(d.paidAt?.toISOString()).toBe("2026-10-14T02:30:00.000Z");
    expect(d.reference).toBe("20261014ABC123");
  });

  it("keeps only the last 4 digits of the account number", () => {
    const d = ok({ ...valid, payee_account: "1234567890" });
    expect(d.payeeAccountLast4).toBe("7890");
    expect(JSON.stringify(d)).not.toContain("123456");
  });

  it("drops an account number with fewer than 4 digits", () => {
    expect(ok({ ...valid, payee_account: "xx" }).payeeAccountLast4).toBeNull();
  });

  it("parses string amounts with commas and currency", () => {
    expect(ok({ ...valid, amount: "1,200.00 บาท" }).amountSatang).toBe(120_000);
    expect(ok({ ...valid, amount: "฿45" }).amountSatang).toBe(4500);
  });

  it("converts a Buddhist-era date", () => {
    const d = ok({ ...valid, paid_at: "2569-10-14T09:30:00+07:00" });
    expect(d.paidAt?.toISOString()).toBe("2026-10-14T02:30:00.000Z");
  });

  it("ignores a date in the future", () => {
    expect(ok({ ...valid, paid_at: "2026-12-25T10:00:00+07:00" }).paidAt).toBeNull();
  });

  it("ignores a very old or unparsable date", () => {
    expect(ok({ ...valid, paid_at: "2010-01-01T00:00:00+07:00" }).paidAt).toBeNull();
    expect(ok({ ...valid, paid_at: "yesterday" }).paidAt).toBeNull();
    expect(ok({ ...valid, paid_at: null }).paidAt).toBeNull();
  });

  it.each([[0], [-5], [null], ["abc"], [1e12]])("rejects amount %j", (amount) => {
    expect(sanitizeSlip({ ...valid, amount }, NOW)).toEqual({
      ok: false,
      reason: "invalid_amount",
    });
  });

  it("rejects non-slip images", () => {
    expect(sanitizeSlip({ is_slip: false }, NOW)).toEqual({ ok: false, reason: "not_slip" });
  });

  it("rejects garbage", () => {
    expect(sanitizeSlip("hello", NOW)).toEqual({ ok: false, reason: "unreadable" });
    expect(sanitizeSlip(null, NOW)).toEqual({ ok: false, reason: "unreadable" });
    expect(sanitizeSlip({ amount: 10 }, NOW)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("trims and bounds free text", () => {
    const d = ok({ ...valid, payee_name: "  " + "ก".repeat(200) + "  ", memo: "   " });
    expect(d.payeeName).toHaveLength(60);
    expect(d.memo).toBeNull();
  });
});

describe("receipt items", () => {
  const receipt = { ...valid, kind: "receipt", amount: 100 };

  it("keeps readable lines and drops the rest", () => {
    const d = ok({
      ...receipt,
      items: [
        { name: "นมสด", amount: 25.5 },
        { name: "  ขนมปัง  ", amount: "30" },
        { name: "ไม่มีราคา", amount: null },
        { name: "", amount: 10 },
        { name: "ติดลบ", amount: -5 },
        { amount: 12 },
      ],
    });
    expect(d.items).toEqual([
      { name: "นมสด", amountSatang: 2550 },
      { name: "ขนมปัง", amountSatang: 3000 },
    ]);
  });

  it("is empty when the reader gave none", () => {
    expect(ok(receipt).items).toEqual([]);
    expect(ok({ ...receipt, items: null }).items).toEqual([]);
  });

  it("is capped", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `สินค้า ${i}`, amount: 1 }));
    expect(ok({ ...receipt, items: many }).items).toHaveLength(MAX_RECEIPT_ITEMS);
  });

  it("reads back what was stored in ocr_json", () => {
    expect(
      parseStoredItems({
        items: [
          { name: "นม", amount: "25.50" },
          { name: "x", amount: "0" },
        ],
      }),
    ).toEqual([{ name: "นม", amountSatang: 2550 }]);
    expect(parseStoredItems({ kind: "receipt" })).toEqual([]);
    expect(parseStoredItems(null)).toEqual([]);
    expect(parseStoredItems({ items: "nope" })).toEqual([]);
  });
});
