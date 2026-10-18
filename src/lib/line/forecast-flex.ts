import type { Forecast, Occurrence, Scenario } from "@/lib/forecast";
import { formatBaht } from "@/lib/money";
import { formatThaiDayMonth } from "@/lib/thai-date";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";

const DAY_MS = 86_400_000;
const MAX_LISTED = 4;

const money = (satang: number) => `${satang < 0 ? "-" : ""}฿${formatBaht(Math.abs(satang))}`;
const tone = (satang: number) => (satang < 0 ? COLOR.expense : COLOR.income);

const row = (label: string, value: string, color: string = COLOR.text) => ({
  type: "box",
  layout: "horizontal",
  margin: "sm",
  contents: [
    { type: "text", text: label, size: "sm", color: COLOR.muted, flex: 5, wrap: true },
    { type: "text", text: value, size: "sm", weight: "bold", color, align: "end", flex: 4 },
  ],
});

const note = (text: string, color: string = COLOR.muted) => ({
  type: "text",
  text,
  size: "xs",
  color,
  wrap: true,
  margin: "md",
});

/** "ประมาณ 28 ต.ค. (อีก 17 วัน)" for the first day the money runs out. */
function runOutText(date: Date, today: Date): string {
  const days = Math.round((date.getTime() - today.getTime()) / DAY_MS);
  return `${formatThaiDayMonth(date)} (${days <= 0 ? "วันนี้" : `อีก ${days} วัน`})`;
}

function scenarioLine(label: string, s: Scenario): string {
  return `${label}: ใช้วันละ ${money(s.dailyRateSatang)} → ${
    s.runsOutOn
      ? `เงินหมด ${formatThaiDayMonth(s.runsOutOn)}`
      : `เหลือ ${money(s.endBalanceSatang)}`
  }`;
}

function upcomingLines(items: Occurrence[], sign: "+" | "-") {
  return items
    .slice(0, MAX_LISTED)
    .map((o) =>
      row(
        `${formatThaiDayMonth(o.date)} ${o.title}`,
        `${sign}฿${formatBaht(o.amountSatang)}`,
        sign === "+" ? COLOR.income : COLOR.expense,
      ),
    );
}

/** "พยากรณ์เงินปลายรอบ": where this cycle's money is heading, and the day it could run out. */
export function buildForecastCard(input: {
  forecast: Forecast;
  today: Date;
  subtitle: string;
  moreUrl?: string;
}): LineMessage {
  const f = input.forecast;
  const body: unknown[] = [
    { type: "text", text: "คาดว่าสิ้นรอบจะเหลือ", size: "xs", color: COLOR.muted },
    {
      type: "text",
      text: money(f.endBalanceSatang),
      size: "xxl",
      weight: "bold",
      color: tone(f.endBalanceSatang),
    },
  ];

  if (f.alreadyNegative) {
    body.push(note("ตอนนี้รายจ่ายมากกว่ารายรับของรอบนี้แล้ว", COLOR.expense));
  } else if (f.runsOutOn) {
    body.push(note(`เงินจะหมดประมาณ ${runOutText(f.runsOutOn, input.today)}`, COLOR.expense));
  } else {
    body.push(note("เงินพอใช้ไปถึงสิ้นรอบ", COLOR.income));
  }

  body.push(
    { type: "separator", margin: "lg" },
    row("เหลือตอนนี้", money(f.netNowSatang), tone(f.netNowSatang)),
    row("ใช้จ่ายทั่วไปต่อวัน", money(f.dailyRateSatang)),
    row("เหลืออีก", `${f.remainingDays} วัน`),
  );

  if (f.upcomingIncomes.length > 0 || f.upcomingExpenses.length > 0) {
    body.push(
      { type: "text", text: "รายการประจำที่กำลังมา", size: "xs", color: COLOR.muted, margin: "lg" },
      ...upcomingLines(f.upcomingIncomes, "+"),
      ...upcomingLines(f.upcomingExpenses, "-"),
    );
    const hidden = f.upcomingIncomes.length + f.upcomingExpenses.length;
    const shown =
      Math.min(MAX_LISTED, f.upcomingIncomes.length) +
      Math.min(MAX_LISTED, f.upcomingExpenses.length);
    if (hidden > shown) body.push(note(`และอีก ${hidden - shown} รายการ`));
  }

  if (f.trend) {
    body.push(
      { type: "separator", margin: "lg" },
      note(scenarioLine("ถ้าใช้จ่ายเท่า 7 วันล่าสุด", f.trend)),
    );
  }

  if (f.budget) {
    const b = f.budget;
    const line = b.overNow
      ? `งบรวม ${money(b.limitSatang)}: ใช้เกินงบแล้ว`
      : b.exhaustedOn
        ? `งบรวม ${money(b.limitSatang)}: คาดว่าจะใช้ ${b.percent}% และงบหมดประมาณ ${runOutText(b.exhaustedOn, input.today)}`
        : `งบรวม ${money(b.limitSatang)}: คาดว่าจะใช้ ${b.percent}% ของงบ`;
    body.push(note(line, b.overNow || b.percent >= 100 ? COLOR.expense : COLOR.muted));
  }

  if (f.lowData) {
    body.push(
      note("ข้อมูลยังน้อย (ต่ำกว่า 5 วันหรือ 5 รายการ) ตัวเลขอาจคลาดเคลื่อนมาก", COLOR.expense),
    );
  }
  body.push(
    note(
      "เป็นการประมาณจากอัตราใช้จ่ายของรอบนี้ ไม่รวมรายรับที่ยังไม่เกิดและไม่ใช่รายการประจำ (เช่น โบนัส)",
    ),
  );

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#CCFBF1",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "พยากรณ์เงินปลายรอบ", weight: "bold", size: "lg", color: "#0B5D4F" },
        {
          type: "text",
          text: input.subtitle,
          size: "xs",
          color: "#3F6B63",
          margin: "xs",
          wrap: true,
        },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents: body },
  };
  if (input.moreUrl?.startsWith("https://")) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#0F766E",
          height: "sm",
          action: { type: "uri", label: "ดูสรุปในแอป", uri: input.moreUrl },
        },
      ],
    };
  }
  return {
    type: "flex",
    altText: `พยากรณ์: สิ้นรอบจะเหลือ ${money(f.endBalanceSatang)}${
      f.runsOutOn ? ` เงินหมดประมาณ ${formatThaiDayMonth(f.runsOutOn)}` : ""
    }`,
    contents: bubble,
  };
}
