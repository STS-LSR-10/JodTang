import { describe, expect, it } from "vitest";
import { forecastCycle, type ForecastInput, type Occurrence } from "@/lib/forecast";
import { fromBangkok } from "@/lib/thai-date";
import { buildForecastCard } from "./forecast-flex";

const baht = (n: number) => n * 100;
const day = (d: number) => fromBangkok(2026, 10, d);
const cycle = { from: day(1), to: fromBangkok(2026, 11, 1) };
const TODAY = day(11);

function card(over: Partial<ForecastInput> = {}, moreUrl?: string) {
  const forecast = forecastCycle({
    now: new Date(TODAY.getTime() + 8 * 3600_000),
    cycle,
    incomeSatang: baht(30_000),
    expenseSatang: baht(11_000),
    recurringExpenseSatang: 0,
    entryCount: 20,
    last7VariableSatang: null,
    upcoming: [],
    budgetSatang: null,
    ...over,
  });
  return JSON.stringify(
    buildForecastCard({ forecast, today: TODAY, subtitle: "1 ต.ค. 2569 – 31 ต.ค. 2569", moreUrl }),
  );
}
const occ = (d: number, type: "income" | "expense", amount: number, title: string): Occurrence => ({
  date: day(d),
  type,
  amountSatang: baht(amount),
  title,
});

describe("buildForecastCard", () => {
  it("shows the end balance big, the date the money runs out, and the pace", () => {
    const json = card();
    expect(json).toContain("พยากรณ์เงินปลายรอบ");
    expect(json).toContain("คาดว่าสิ้นรอบจะเหลือ");
    expect(json).toContain("-฿1,000"); // 19,000 - 20 x 1,000
    expect(json).toContain("เงินจะหมดประมาณ 31 ต.ค. (อีก 20 วัน)");
    expect(json).toContain("฿19,000"); // now
    expect(json).toContain("ใช้จ่ายทั่วไปต่อวัน");
  });

  it("says the money lasts when it does", () => {
    expect(card({ incomeSatang: baht(60_000) })).toContain("เงินพอใช้ไปถึงสิ้นรอบ");
  });

  it("says plainly when the cycle is already below zero", () => {
    const json = card({ incomeSatang: baht(5000) });
    expect(json).toContain("ตอนนี้รายจ่ายมากกว่ารายรับของรอบนี้แล้ว");
    expect(json).not.toContain("เงินจะหมดประมาณ");
  });

  it("lists the recurring salary and bills still to come, with the day", () => {
    const json = card({
      upcoming: [occ(25, "income", 30_000, "เงินเดือน"), occ(28, "expense", 5000, "ผ่อน")],
    });
    expect(json).toContain("รายการประจำที่กำลังมา");
    expect(json).toContain("25 ต.ค. เงินเดือน");
    expect(json).toContain("+฿30,000");
    expect(json).toContain("28 ต.ค. ผ่อน");
    expect(json).toContain("-฿5,000");
  });

  it("says how many more there are when the list is cut", () => {
    const many = Array.from({ length: 7 }, (_, i) => occ(12 + i, "expense", 100, `บิล${i}`));
    expect(card({ upcoming: many })).toContain("และอีก 3 รายการ");
  });

  it("shows the last-seven-days scenario and the budget line when they exist", () => {
    const json = card({ last7VariableSatang: baht(3500), budgetSatang: baht(20_000) });
    expect(json).toContain("ถ้าใช้จ่ายเท่า 7 วันล่าสุด");
    expect(json).toContain("งบรวม ฿20,000");
    expect(json).toContain("155%");
  });

  it("warns when there is little data, and always states what it leaves out", () => {
    const json = card({ entryCount: 2 });
    expect(json).toContain("ข้อมูลยังน้อย");
    expect(json).toContain("ไม่รวมรายรับที่ยังไม่เกิดและไม่ใช่รายการประจำ");
    expect(card()).not.toContain("ข้อมูลยังน้อย");
  });

  it("has a button only with an https link", () => {
    expect(card({}, "https://liff.line.me/1/summary")).toContain("ดูสรุปในแอป");
    expect(card({}, "http://localhost/x")).not.toContain("ดูสรุปในแอป");
  });
});

describe("the look of the forecast card", () => {
  it("says all is well in a green pill with its tick and thumb, and the piggy bank on the header", () => {
    const out = card({ expenseSatang: baht(1_000) }, "https://liff.line.me/1/summary");
    expect(out).toContain("✅ เงินพอใช้ไปถึงสิ้นรอบ 👍");
    expect(out).toContain("#2F9E5B");
    expect(out).toContain("🐷");
    expect(out).toContain("ดูสรุปในแอป 📈");
  });

  it("a short supply is a red pill", () => {
    const out = card();
    expect(out).toContain("⚠️ เงินจะหมดประมาณ");
    expect(out).not.toContain("#2F9E5B");
  });

  it("the days left carry a calendar emoji", () => {
    expect(card()).toContain("📆");
  });
});
