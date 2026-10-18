import { describe, expect, it } from "vitest";
import { planReceiptSplit, REMAINDER_TITLE } from "./receipt-split";

const item = (name: string, baht: number) => ({ name, amountSatang: baht * 100 });

describe("planReceiptSplit", () => {
  it("splits into the lines when they add up to the total", () => {
    const plan = planReceiptSplit(10_000, [item("นม", 30), item("ขนมปัง", 70)]);
    expect(plan).toEqual({
      ok: true,
      lines: [item("นม", 30), item("ขนมปัง", 70)],
      remainderSatang: 0,
    });
  });

  it("adds a remainder line when the total is higher (VAT, service charge)", () => {
    const plan = planReceiptSplit(11_000, [item("นม", 30), item("ขนมปัง", 70)]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.remainderSatang).toBe(1000);
    expect(plan.lines.at(-1)).toEqual({ name: REMAINDER_TITLE, amountSatang: 1000 });
    expect(plan.lines.reduce((s, l) => s + l.amountSatang, 0)).toBe(11_000);
  });

  it("refuses when the lines come to more than the total (a bill-level discount)", () => {
    expect(planReceiptSplit(9_000, [item("นม", 30), item("ขนมปัง", 70)])).toEqual({
      ok: false,
      reason: "over_total",
    });
  });

  it("needs at least two lines", () => {
    expect(planReceiptSplit(5000, [item("นม", 50)])).toEqual({ ok: false, reason: "too_few" });
    expect(planReceiptSplit(5000, [])).toEqual({ ok: false, reason: "too_few" });
  });

  it("is exact in satang (no floating point drift)", () => {
    const plan = planReceiptSplit(3000, [
      { name: "a", amountSatang: 1010 },
      { name: "b", amountSatang: 1010 },
      { name: "c", amountSatang: 980 },
    ]);
    expect(plan.ok && plan.remainderSatang).toBe(0);
  });
});
