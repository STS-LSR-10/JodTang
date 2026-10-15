import { describe, expect, it } from "vitest";
import { categorizeByRules, type CategoryLite } from "./rules";

function cat(p: Partial<CategoryLite> & { id: string; name: string }): CategoryLite {
  return {
    user_id: null,
    type: "expense",
    keywords: [],
    sort_order: 0,
    is_hidden: false,
    ...p,
  };
}

const categories: CategoryLite[] = [
  cat({ id: "food", name: "อาหาร", keywords: ["กาแฟ", "ข้าว", "น้ำ"] }),
  cat({ id: "water", name: "ค่าน้ำ-ไฟ", keywords: ["ค่าน้ำ", "ค่าไฟ"] }),
  cat({ id: "fuel", name: "เดินทาง", keywords: ["น้ำมัน", "bts"] }),
  cat({ id: "other", name: "อื่นๆ" }),
  cat({ id: "salary", name: "เงินเดือน", type: "income", keywords: ["เงินเดือน"] }),
  cat({ id: "income-other", name: "อื่นๆ", type: "income" }),
];

describe("categorizeByRules", () => {
  it("matches a keyword", () => {
    expect(categorizeByRules({ title: "กาแฟ", type: "expense", categories, memory: [] })).toEqual({
      categoryId: "food",
      via: "keyword",
    });
  });

  it("the longest keyword wins", () => {
    const r = categorizeByRules({ title: "ค่าน้ำ", type: "expense", categories, memory: [] });
    expect(r.categoryId).toBe("water");
    const fuel = categorizeByRules({ title: "น้ำมัน", type: "expense", categories, memory: [] });
    expect(fuel.categoryId).toBe("fuel");
  });

  it("is case-insensitive", () => {
    expect(
      categorizeByRules({ title: "BTS", type: "expense", categories, memory: [] }).categoryId,
    ).toBe("fuel");
  });

  it("only considers categories of the same type", () => {
    const r = categorizeByRules({ title: "เงินเดือน", type: "expense", categories, memory: [] });
    expect(r.categoryId).toBe("other");
    expect(r.via).toBe("fallback");
  });

  it("falls back to อื่นๆ", () => {
    expect(
      categorizeByRules({ title: "อะไรสักอย่าง", type: "income", categories, memory: [] }),
    ).toEqual({
      categoryId: "income-other",
      via: "fallback",
    });
  });

  it("memory beats keywords", () => {
    const r = categorizeByRules({
      title: "กาแฟ ร้านลุงหนวด",
      type: "expense",
      categories,
      memory: [{ match_text: "ลุงหนวด", category_id: "other" }],
    });
    expect(r).toEqual({ categoryId: "other", via: "memory" });
  });

  it("ignores memory that points at a hidden or wrong-type category", () => {
    const r = categorizeByRules({
      title: "กาแฟ ลุงหนวด",
      type: "expense",
      categories,
      memory: [{ match_text: "ลุงหนวด", category_id: "salary" }],
    });
    expect(r.via).toBe("keyword");
  });

  it("the user's own category beats a system one on equal keyword length", () => {
    const withOwn = [
      ...categories,
      cat({ id: "mine", user_id: "u1", name: "คาเฟ่", keywords: ["กาแฟ"] }),
    ];
    expect(
      categorizeByRules({ title: "กาแฟ", type: "expense", categories: withOwn, memory: [] })
        .categoryId,
    ).toBe("mine");
  });

  it("skips hidden categories", () => {
    const hidden = categories.map((c) => (c.id === "food" ? { ...c, is_hidden: true } : c));
    expect(
      categorizeByRules({ title: "กาแฟ", type: "expense", categories: hidden, memory: [] })
        .categoryId,
    ).toBe("other");
  });

  it("returns none when there is no fallback category", () => {
    expect(categorizeByRules({ title: "x", type: "expense", categories: [], memory: [] })).toEqual({
      categoryId: null,
      via: "none",
    });
  });
});
