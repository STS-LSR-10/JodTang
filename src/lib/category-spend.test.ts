import { describe, expect, it } from "vitest";
import { buildCategorySlices, MAX_SLICES, wholePercents } from "./category-spend";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("wholePercents", () => {
  it("always adds up to exactly 100", () => {
    expect(sum(wholePercents([1, 1, 1]))).toBe(100); // 33.3 x 3 would be 99
    expect(sum(wholePercents([2, 1]))).toBe(100);
    expect(sum(wholePercents([50, 50, 50, 50, 50, 50, 50]))).toBe(100);
    expect(sum(wholePercents([12_345, 6_789, 1_111, 999]))).toBe(100);
  });

  it("gives the extra points to the biggest remainders", () => {
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([2, 1])).toEqual([67, 33]);
  });

  it("is all zero for nothing", () => {
    expect(wholePercents([0, 0])).toEqual([0, 0]);
    expect(wholePercents([])).toEqual([]);
  });

  it("an exact split stays exact", () => {
    expect(wholePercents([50, 30, 20])).toEqual([50, 30, 20]);
  });
});

describe("buildCategorySlices", () => {
  const row = (name: string, baht: number) => ({ name, amountSatang: baht * 100 });

  it("sorts biggest first and drops categories that spent nothing", () => {
    const out = buildCategorySlices([row("ก", 10), row("ข", 30), row("ค", 0), row("ง", 60)]);
    expect(out.map((s) => s.name)).toEqual(["ง", "ข", "ก"]);
    expect(out.map((s) => s.percent)).toEqual([60, 30, 10]);
  });

  it("keeps the first eight and gathers the rest into one line", () => {
    const rows = Array.from({ length: 11 }, (_, i) => row(`หมวด${i}`, 100 - i));
    const out = buildCategorySlices(rows);
    expect(out).toHaveLength(MAX_SLICES + 1);
    const other = out.at(-1)!;
    expect(other.other).toBe(true);
    expect(other.name).toBe("อื่นๆ (3 หมวด)");
    expect(other.amountSatang).toBe((92 + 91 + 90) * 100);
    expect(sum(out.map((s) => s.percent))).toBe(100);
  });

  it("no 'other' line when everything fits", () => {
    const out = buildCategorySlices([row("ก", 10), row("ข", 20)]);
    expect(out.some((s) => s.other)).toBe(false);
  });

  it("keeps each category's icon, and the 'other' line has none", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      name: `หมวด${i}`,
      amountSatang: (100 - i) * 100,
      icon: i === 0 ? "🐱" : null,
    }));
    const out = buildCategorySlices(rows);
    expect(out[0]?.icon).toBe("🐱");
    expect(out.at(-1)?.other).toBe(true);
    expect(out.at(-1)?.icon).toBeUndefined();
  });

  it("nothing spent gives no slices", () => {
    expect(buildCategorySlices([])).toEqual([]);
    expect(buildCategorySlices([row("ก", 0)])).toEqual([]);
  });
});
