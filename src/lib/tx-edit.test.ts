import { describe, expect, it } from "vitest";
import type { CategoryLite } from "@/lib/categorize/rules";
import { planBulkMove, planEdit, type ExistingTx } from "./tx-edit";

const NOW = new Date("2026-10-16T08:00:00Z");

const cat = (p: Partial<CategoryLite> & { id: string; name: string }): CategoryLite => ({
  user_id: null,
  type: "expense",
  keywords: [],
  sort_order: 0,
  is_hidden: false,
  ...p,
});

const categories: CategoryLite[] = [
  cat({ id: "food", name: "อาหาร", keywords: ["กาแฟ", "ข้าว"] }),
  cat({ id: "fuel", name: "เดินทาง", keywords: ["น้ำมัน"] }),
  cat({ id: "hidden", name: "ซ่อน", is_hidden: true }),
  cat({ id: "other", name: "อื่นๆ" }),
  cat({ id: "salary", name: "เงินเดือน", type: "income", keywords: ["เงินเดือน"] }),
  cat({ id: "income-other", name: "อื่นๆ", type: "income" }),
];

const existing: ExistingTx = { type: "expense", title: "กาแฟ", category_id: "food" };

function plan(edit: Parameters<typeof planEdit>[0]["edit"], ex: ExistingTx = existing) {
  return planEdit({ edit, existing: ex, categories, memory: [], now: NOW });
}

function ok(edit: Parameters<typeof planEdit>[0]["edit"], ex: ExistingTx = existing) {
  const r = plan(edit, ex);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r;
}

describe("planEdit: fields", () => {
  it("rejects an empty edit", () => {
    expect(plan({})).toEqual({ ok: false, error: "ไม่มีข้อมูลที่ต้องแก้" });
  });

  it("updates title and amount", () => {
    const r = ok({ title: "  ข้าวมันไก่ ", amount: "50.5" });
    expect(r.patch).toEqual({
      title: "ข้าวมันไก่",
      amount: "50.50",
      // the foreign amount it may have been converted from no longer applies
      orig_currency: null,
      orig_amount: null,
      fx_rate: null,
    });
    expect(r.categoryChanged).toBe(false);
  });

  it.each(["", "abc", "0", "0.00", "-5", "1,000", "10.123", "1234567890"])(
    "rejects amount %j",
    (amount) => {
      expect(plan({ amount }).ok).toBe(false);
    },
  );

  it("rejects an empty or too long title", () => {
    expect(plan({ title: "   " }).ok).toBe(false);
    expect(plan({ title: "ก".repeat(61) }).ok).toBe(false);
    expect(plan({ title: "ก".repeat(60) }).ok).toBe(true);
  });

  it("notes: trimmed, empty clears, long rejected", () => {
    expect(ok({ note: "  ซื้อให้แม่ " }).patch).toEqual({ note: "ซื้อให้แม่" });
    expect(ok({ note: "   " }).patch).toEqual({ note: null });
    expect(ok({ note: null }).patch).toEqual({ note: null });
    expect(plan({ note: "x".repeat(201) }).ok).toBe(false);
  });
});

describe("planEdit: date", () => {
  it("accepts a normal past date and stores UTC", () => {
    expect(ok({ occurredAt: "2026-10-10T09:30:00+07:00" }).patch).toEqual({
      occurred_at: "2026-10-10T02:30:00.000Z",
    });
  });

  it("allows a little clock skew but not the real future", () => {
    expect(plan({ occurredAt: "2026-10-17T00:00:00+07:00" }).ok).toBe(true); // < 24h ahead
    expect(plan({ occurredAt: "2026-12-25T00:00:00+07:00" }).ok).toBe(false);
  });

  it("rejects garbage and ancient dates", () => {
    expect(plan({ occurredAt: "yesterday" }).ok).toBe(false);
    expect(plan({ occurredAt: "2001-01-01T00:00:00Z" }).ok).toBe(false);
  });
});

describe("planEdit: category", () => {
  it("moves to another visible category of the same type", () => {
    const r = ok({ categoryId: "fuel" });
    expect(r.patch).toEqual({ category_id: "fuel" });
    expect(r.categoryChanged).toBe(true);
    expect(r.categoryId).toBe("fuel");
  });

  it("choosing the current category is not a change", () => {
    const r = ok({ categoryId: "food" });
    expect(r.categoryChanged).toBe(false);
    expect(r.patch).toEqual({});
  });

  it("can clear the category", () => {
    const r = ok({ categoryId: null });
    expect(r.patch).toEqual({ category_id: null });
    expect(r.categoryChanged).toBe(true);
  });

  it("rejects unknown, hidden and wrong-type categories", () => {
    expect(plan({ categoryId: "nope" }).ok).toBe(false);
    expect(plan({ categoryId: "hidden" }).ok).toBe(false);
    expect(plan({ categoryId: "salary" }).ok).toBe(false); // income category on an expense
  });

  it("changing the type re-guesses the category for the new type", () => {
    const r = ok({ type: "income", title: "เงินเดือน" });
    expect(r.patch).toMatchObject({ type: "income", title: "เงินเดือน", category_id: "salary" });
    expect(r.categoryChanged).toBe(true);
  });

  it("changing the type falls back to อื่นๆ of the new type", () => {
    const r = ok({ type: "income" });
    expect(r.categoryId).toBe("income-other");
  });

  it("changing the type with an explicit category must match the new type", () => {
    expect(plan({ type: "income", categoryId: "food" }).ok).toBe(false);
    expect(ok({ type: "income", categoryId: "salary" }).categoryId).toBe("salary");
  });

  it("flags a category change even when the title also changes", () => {
    const r = ok({ title: "น้ำมัน", categoryId: "fuel" });
    expect(r.categoryChanged).toBe(true);
  });
});

describe("planBulkMove", () => {
  it("moves only entries of the category's type and counts the rest", () => {
    const r = planBulkMove(
      [
        { id: "1", type: "expense" },
        { id: "2", type: "income" },
        { id: "3", type: "expense" },
      ],
      { type: "expense" },
    );
    expect(r).toEqual({ moveIds: ["1", "3"], skipped: 1 });
  });

  it("handles nothing matching and empty input", () => {
    expect(planBulkMove([{ id: "1", type: "income" }], { type: "expense" })).toEqual({
      moveIds: [],
      skipped: 1,
    });
    expect(planBulkMove([], { type: "expense" })).toEqual({ moveIds: [], skipped: 0 });
  });
});
