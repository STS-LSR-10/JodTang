import { describe, expect, it } from "vitest";
import {
  allowedNumbers,
  buildInsightFacts,
  buildTitleRows,
  chooseInsight,
  hasSomethingToSay,
  ruleInsights,
  sanitizeInsightOutput,
  usesOnlyKnownNumbers,
  type InsightFacts,
} from "./insight";
import { buildCompareRows } from "./period-compare";

const b = (n: number) => n * 100;
const cat = (name: string, baht: number) => ({ name, amountSatang: b(baht) });
const title = (name: string, baht: number, count: number) => ({
  name,
  amountSatang: b(baht),
  count,
});

function facts(over: Partial<Parameters<typeof buildInsightFacts>[0]> = {}): InsightFacts {
  return buildInsightFacts({
    periodLabel: "1 ต.ค. – 31 ต.ค.",
    previousLabel: "เดือนก่อน",
    expenseSatang: b(10_000),
    previousExpenseSatang: b(8000),
    incomeSatang: b(30_000),
    categories: buildCompareRows(
      [cat("อาหาร", 4200), cat("เดินทาง", 1500), cat("บันเทิง", 800)],
      [cat("อาหาร", 3000), cat("เดินทาง", 2000), cat("บันเทิง", 800)],
    ),
    titles: buildTitleRows(
      [title("ชานม", 420, 6), title("grab", 900, 9)],
      [title("ชานม", 300, 4), title("grab", 1100, 11)],
    ),
    ...over,
  });
}

describe("buildTitleRows", () => {
  it("joins the two periods by name and works out the change", () => {
    const rows = buildTitleRows(
      [title("ชานม", 420, 6)],
      [title("ชานม", 300, 4), title("เก่า", 50, 1)],
    );
    expect(rows).toEqual([
      {
        name: "ชานม",
        currentSatang: b(420),
        previousSatang: b(300),
        currentCount: 6,
        previousCount: 4,
        changePercent: 40,
      },
    ]); // "เก่า" was only in the earlier period: nothing to say about it now
  });

  it("a name that is new has no percent, the list is biggest first and capped", () => {
    const many = Array.from({ length: 9 }, (_, i) => title(`รายการ${i}`, 100 - i, 1));
    const rows = buildTitleRows(many, []);
    expect(rows).toHaveLength(6);
    expect(rows[0]?.name).toBe("รายการ0");
    expect(rows.every((r) => r.changePercent === null)).toBe(true);
  });

  it("cuts a very long name", () => {
    expect(buildTitleRows([title("ก".repeat(100), 10, 1)], [])[0]?.name).toHaveLength(40);
  });
});

describe("ruleInsights", () => {
  it("describes the total change, the biggest rise, the biggest named rise and a fall", () => {
    const r = ruleInsights(facts());
    expect(r.source).toBe("rules");
    expect(r.lines[0]).toBe("รายจ่ายรวม ฿10,000 เพิ่มขึ้น 25% จากเดือนก่อน");
    expect(r.lines).toContain("หมวดอาหารเพิ่มขึ้น 40% (฿3,000 → ฿4,200)");
    expect(r.lines).toContain("ชานม ใช้ไป ฿420 (6 ครั้ง) เพิ่มขึ้น 40% จากเดือนก่อน");
    expect(r.lines.some((l) => l.includes("หมวดเดินทางลดลง 25%"))).toBe(true);
    expect(r.lines.length).toBeLessThanOrEqual(4);
  });

  it("the tip points at the biggest rise", () => {
    expect(ruleInsights(facts()).tip).toContain("หมวดอาหาร");
  });

  it("without a baseline it says so instead of inventing a change", () => {
    const f = facts({
      previousExpenseSatang: 0,
      categories: buildCompareRows([cat("อาหาร", 4200)], []),
      titles: buildTitleRows([title("ชานม", 420, 6)], []),
    });
    const r = ruleInsights(f);
    expect(r.lines[0]).toContain("ยังไม่มีข้อมูลเดือนก่อนให้เทียบ");
    expect(r.lines.join(" ")).not.toMatch(/เพิ่มขึ้น|ลดลง/);
    expect(r.tip).toContain("จดรายการ");
  });

  it("a rise under ten percent is not worth a line", () => {
    const f = facts({
      categories: buildCompareRows([cat("อาหาร", 3100)], [cat("อาหาร", 3000)]),
      titles: [],
    });
    expect(ruleInsights(f).lines.join(" ")).not.toContain("เพิ่มขึ้น 3%");
  });

  it("level spending is called level", () => {
    const f = facts({ expenseSatang: b(8000) });
    expect(ruleInsights(f).lines[0]).toContain("เท่ากับเดือนก่อน");
  });
});

describe("hasSomethingToSay", () => {
  it("needs some spending", () => {
    expect(hasSomethingToSay(facts())).toBe(true);
    expect(hasSomethingToSay(facts({ expenseSatang: 0 }))).toBe(false);
  });
});

describe("the number check", () => {
  const f = facts();
  const allowed = allowedNumbers(f);

  it("knows the amounts, differences, percents and counts of the facts", () => {
    for (const n of [
      "10000",
      "8000",
      "2000",
      "25",
      "4200",
      "3000",
      "1200",
      "40",
      "420",
      "300",
      "120",
      "6",
      "4",
    ]) {
      expect(allowed.has(n)).toBe(true);
    }
  });

  it("accepts text that only uses those numbers, with commas and Thai digits", () => {
    expect(usesOnlyKnownNumbers("ชานม ฿420 เพิ่ม 40% จาก ฿300 (6 ครั้ง)", allowed)).toBe(true);
    expect(usesOnlyKnownNumbers("รายจ่ายรวม ฿10,000", allowed)).toBe(true);
    expect(usesOnlyKnownNumbers("เพิ่มขึ้น ๔๐%", allowed)).toBe(true);
    expect(usesOnlyKnownNumbers("ไม่มีตัวเลขเลย", allowed)).toBe(true);
  });

  it("rejects a number that is not in the facts", () => {
    expect(usesOnlyKnownNumbers("ชานมเพิ่มขึ้น 55%", allowed)).toBe(false);
    expect(usesOnlyKnownNumbers("ใช้ไป ฿999", allowed)).toBe(false);
  });
});

describe("sanitizeInsightOutput", () => {
  const f = facts();
  const good = {
    insights: [
      "ชานมใช้ไป ฿420 (6 ครั้ง) เพิ่มขึ้น 40% จากเดือนก่อน",
      "หมวดอาหารเพิ่มขึ้น 40% จาก ฿3,000 เป็น ฿4,200",
      "ค่าเดินทางลดลง 25% ทำได้ดีมาก",
    ],
    tip: "ลองตั้งงบเฉพาะหมวดอาหารรอบหน้า",
  };

  it("keeps good lines and a good tip", () => {
    const r = sanitizeInsightOutput(good, f)!;
    expect(r.source).toBe("ai");
    expect(r.lines).toHaveLength(3);
    expect(r.tip).toBe("ลองตั้งงบเฉพาะหมวดอาหารรอบหน้า");
  });

  it("drops a line with an invented number and keeps the rest", () => {
    const r = sanitizeInsightOutput(
      { ...good, insights: [...good.insights, "ชานมเพิ่มขึ้น 77% เลยนะ"] },
      f,
    )!;
    expect(r.lines).toHaveLength(3);
    expect(r.lines.join(" ")).not.toContain("77");
  });

  it("drops a tip with an invented number, but keeps the lines", () => {
    const r = sanitizeInsightOutput({ ...good, tip: "ลดให้ได้ 90% ภายในเดือนหน้า" }, f)!;
    expect(r.tip).toBeNull();
    expect(r.lines).toHaveLength(3);
  });

  it("drops investment advice", () => {
    const r = sanitizeInsightOutput(
      { ...good, insights: [...good.insights, "ควรนำเงินที่เหลือไปลงทุนในหุ้น"] },
      f,
    )!;
    expect(r.lines.join(" ")).not.toContain("ลงทุน");
    expect(
      sanitizeInsightOutput({ insights: ["แนะนำให้ซื้อกองทุนรวมเพิ่ม", "แนะนำลงทุนคริปโต"] }, f),
    ).toBeNull();
  });

  it("trims long lines and keeps at most four", () => {
    const long = "ข้อสังเกต " + "ก".repeat(400);
    const r = sanitizeInsightOutput(
      { insights: [long, long, long, long, long, long], tip: null },
      f,
    )!;
    expect(r.lines).toHaveLength(4);
    expect(r.lines.every((l) => l.length <= 160)).toBe(true);
  });

  it("is null when fewer than two lines survive, or the shape is wrong", () => {
    expect(
      sanitizeInsightOutput({ insights: ["ชานมเพิ่ม 77%", "ok ไม่มีเลข"], tip: null }, f),
    ).toBeNull();
    expect(sanitizeInsightOutput({ insights: "nope" }, f)).toBeNull();
    expect(sanitizeInsightOutput(null, f)).toBeNull();
    expect(sanitizeInsightOutput({}, f)).toBeNull();
  });
});

describe("chooseInsight", () => {
  const f = facts();
  it("uses the AI when it passes, the plain observations when it does not or is missing", () => {
    const ai = {
      insights: ["ชานมใช้ไป ฿420 (6 ครั้ง) เพิ่มขึ้น 40% จากเดือนก่อน", "หมวดอาหารเพิ่มขึ้น 40%"],
      tip: null,
    };
    expect(chooseInsight(f, ai).source).toBe("ai");
    expect(chooseInsight(f, { insights: ["เพิ่ม 99%", "เพิ่ม 98%"] }).source).toBe("rules");
    expect(chooseInsight(f, null).source).toBe("rules");
  });
});
