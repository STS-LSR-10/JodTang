import { describe, expect, it } from "vitest";
import { buildCategorySlices } from "@/lib/category-spend";
import { buildCompareRows } from "@/lib/period-compare";
import {
  buildCategorySpendCard,
  buildCompareCard,
  buildRecentCard,
  buildYearCard,
  changeLabel,
} from "./spend-flex";

const item = (title: string, amountSatang: number, type: "expense" | "income" = "expense") => ({
  id: title,
  type,
  title,
  amountSatang,
  occurredAt: "2026-10-10T05:00:00Z",
  source: "text",
  categoryId: null,
  categoryName: "อาหาร",
  categoryIcon: null,
  categoryColor: null,
  hasPhoto: false,
  hasSlip: false,
  note: null,
  tags: [],
});

describe("buildCategorySpendCard", () => {
  const slices = buildCategorySlices([
    { name: "อาหาร", amountSatang: 30_000 },
    { name: "เดินทาง", amountSatang: 10_000 },
  ]);

  it("shows each category with its amount and share, and the total", () => {
    const json = JSON.stringify(
      buildCategorySpendCard({
        subtitle: "1 ต.ค. 2569 – 31 ต.ค. 2569",
        slices,
        totalSatang: 40_000,
        moreUrl: "https://liff.line.me/1/analytics",
      }),
    );
    expect(json).toContain("ใช้จ่ายตามหมวด");
    expect(json).toContain("อาหาร");
    expect(json).toContain("฿300 · 75%");
    expect(json).toContain("฿100 · 25%");
    expect(json).toContain("฿400");
    expect(json).toContain("ดูกราฟในแอป");
    expect(json).toContain('"width":"75%"');
  });

  it("no button without an https link, and a very small share still gets a visible bar", () => {
    const tiny = buildCategorySlices([
      { name: "ก", amountSatang: 100_000 },
      { name: "ข", amountSatang: 1 },
    ]);
    const json = JSON.stringify(
      buildCategorySpendCard({
        subtitle: "x",
        slices: tiny,
        totalSatang: 100_001,
        moreUrl: "http://x",
      }),
    );
    expect(json).not.toContain("ดูกราฟในแอป");
    expect(json).toContain('"width":"2%"');
  });
});

describe("buildRecentCard", () => {
  it("lists the entries with sign, category and date, and points at the next commands", () => {
    const json = JSON.stringify(
      buildRecentCard({
        items: [item("กาแฟ", 4500), item("เงินเดือน", 2_500_000, "income")],
        moreUrl: "https://liff.line.me/1/transactions",
      }),
    );
    expect(json).toContain("รายการล่าสุด");
    expect(json).toContain("-฿45");
    expect(json).toContain("+฿25,000");
    expect(json).toContain("อาหาร · 10 ต.ค. 2569");
    expect(json).toContain("ลบล่าสุด · แก้ล่าสุด 45");
    expect(json).toContain("ดูทั้งหมดในแอป");
  });

  it("an entry without a category says so", () => {
    const json = JSON.stringify(
      buildRecentCard({ items: [{ ...item("x", 100), categoryName: null }] }),
    );
    expect(json).toContain("ไม่ระบุหมวด");
    expect(json).not.toContain("ดูทั้งหมดในแอป");
  });
});

describe("changeLabel", () => {
  it("names each kind of change and colours increases red, decreases green", () => {
    expect(changeLabel("up", 25)).toMatchObject({ text: "▲ 25%" });
    expect(changeLabel("down", -10)).toMatchObject({ text: "▼ 10%" });
    expect(changeLabel("gone", -100)).toMatchObject({ text: "▼ 100%" });
    expect(changeLabel("new", null)).toMatchObject({ text: "ใหม่" });
    expect(changeLabel("same", 0)).toMatchObject({ text: "เท่าเดิม" });
    expect(changeLabel("up", 5).color).not.toBe(changeLabel("down", -5).color);
  });
});

describe("buildCompareCard", () => {
  const rows = buildCompareRows(
    [
      { name: "อาหาร", amountSatang: 15_000 },
      { name: "บันเทิง", amountSatang: 5000 },
    ],
    [
      { name: "อาหาร", amountSatang: 10_000 },
      { name: "สุขภาพ", amountSatang: 3000 },
    ],
  );
  const card = (over = {}) =>
    JSON.stringify(
      buildCompareCard({
        currentLabel: "1 ต.ค. – 17 ต.ค.",
        previousLabel: "1 ก.ย. – 17 ก.ย.",
        rows,
        currentSatang: 20_000,
        previousSatang: 13_000,
        totalChange: { kind: "up", changePercent: 54 },
        moreUrl: "https://liff.line.me/1/analytics",
        ...over,
      }),
    );

  it("names both spans and shows total and per-category changes", () => {
    const json = card();
    expect(json).toContain("เทียบรายจ่ายรายหมวด");
    expect(json).toContain("1 ต.ค. – 17 ต.ค.");
    expect(json).toContain("1 ก.ย. – 17 ก.ย.");
    expect(json).toContain("▲ 54%"); // total
    expect(json).toContain("▲ 50%"); // อาหาร
    expect(json).toContain("ใหม่"); // บันเทิง
    expect(json).toContain("▼ 100%"); // สุขภาพ
    expect(json).toContain("ก่อนหน้า ฿100");
    expect(json).toContain("ดูกราฟในแอป");
  });

  it("has no button without an https link", () => {
    expect(card({ moreUrl: undefined })).not.toContain("ดูกราฟในแอป");
  });
});

describe("buildYearCard", () => {
  const months = [
    { month: new Date("2025-12-31T17:00:00Z"), expenseSatang: 40_000 },
    { month: new Date("2026-01-31T17:00:00Z"), expenseSatang: 0 },
    { month: new Date("2026-02-28T17:00:00Z"), expenseSatang: 20_000 },
  ];
  const card = (over = {}) =>
    JSON.stringify(
      buildYearCard({
        yearBE: 2569,
        subtitle: "1 ม.ค. 2569 – 17 มี.ค. 2569",
        income: 100_000,
        expense: 60_000,
        changePercent: 25,
        topExpenses: [{ name: "อาหาร", amountSatang: 30_000, percent: 50 }],
        months,
        moreUrl: "https://liff.line.me/1/analytics",
        ...over,
      }),
    );

  it("shows the totals, the change against last year, the top categories and the months", () => {
    const json = card();
    expect(json).toContain("สรุปรายปี 2569");
    expect(json).toContain("+฿1,000");
    expect(json).toContain("-฿600");
    expect(json).toContain("฿400"); // net
    expect(json).toContain("เพิ่มขึ้น 25% จากปีก่อน");
    expect(json).toContain("อาหาร");
    expect(json).toContain("ม.ค.");
    expect(json).toContain("ก.พ.");
    expect(json).toContain("มี.ค.");
    expect(json).toContain('"width":"100%"'); // the biggest month
    expect(json).toContain('"width":"50%"');
  });

  it("leaves out the comparison without a baseline, and the bar of a month with no spending", () => {
    const json = card({ changePercent: null });
    expect(json).not.toContain("จากปีก่อน");
    const empty = card({ months: [{ month: months[0]!.month, expenseSatang: 0 }] });
    expect(empty).not.toContain('"width":"');
  });

  it("says when it is level with last year", () => {
    expect(card({ changePercent: 0 })).toContain("รายจ่ายเท่ากับปีก่อน");
  });
});
