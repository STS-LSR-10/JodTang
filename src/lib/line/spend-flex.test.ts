import { describe, expect, it } from "vitest";
import { buildCategorySlices } from "@/lib/category-spend";
import { buildCategorySpendCard, buildRecentCard } from "./spend-flex";

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
