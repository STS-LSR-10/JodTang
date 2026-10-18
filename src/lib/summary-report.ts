import type { DateRange } from "@/lib/budget-cycle";
import { formatBaht } from "@/lib/money";
import { bangkokParts, formatThaiDayMonth, fromBangkok } from "@/lib/thai-date";
import type { BudgetCycle, LineMessage } from "@/lib/types";

/** Hour (Bangkok) from which the automatic summaries may be sent. */
export const SUMMARY_HOUR = 9;

export type SummaryKind = "weekly" | "monthly";

const DAY_MS = 86_400_000;
const two = (n: number) => String(n).padStart(2, "0");

/** "2026-10-19" for the Bangkok day containing `now` (matches the `date` columns). */
export function bangkokDay(now: Date): string {
  const p = bangkokParts(now);
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

/** Monday 09:00 or later, and not sent yet today. */
export function isWeeklySummaryDue(now: Date, lastSentOn: string | null): boolean {
  const p = bangkokParts(now);
  return p.weekday === 1 && p.hour >= SUMMARY_HOUR && lastSentOn !== bangkokDay(now);
}

/**
 * The monthly summary follows the person's budget cycle: it goes out on the cycle's start day
 * (day 1 for a weekly budget cycle, which has no start day) at 09:00 or later, once.
 */
export function monthlyStartDay(cycle: BudgetCycle, cycleStartDay: number): number {
  return cycle === "weekly" ? 1 : Math.min(Math.max(Math.trunc(cycleStartDay), 1), 28);
}

export function isMonthlySummaryDue(
  now: Date,
  cycle: BudgetCycle,
  cycleStartDay: number,
  lastSentOn: string | null,
): boolean {
  const p = bangkokParts(now);
  return (
    p.day === monthlyStartDay(cycle, cycleStartDay) &&
    p.hour >= SUMMARY_HOUR &&
    lastSentOn !== bangkokDay(now)
  );
}

/** The Monday-to-Sunday week that ended before the Monday of `now`. */
export function lastWeekRange(now: Date): DateRange {
  const p = bangkokParts(now);
  const sinceMonday = (p.weekday + 6) % 7;
  return {
    from: fromBangkok(p.year, p.month, p.day - sinceMonday - 7),
    to: fromBangkok(p.year, p.month, p.day - sinceMonday),
  };
}

/** The budget month that ended on the start day of the cycle containing `now`. */
export function lastMonthRange(now: Date, cycle: BudgetCycle, cycleStartDay: number): DateRange {
  const day = monthlyStartDay(cycle, cycleStartDay);
  const p = bangkokParts(now);
  const thisStart = p.day >= day ? p.month : p.month - 1;
  return {
    from: fromBangkok(p.year, thisStart - 1, day),
    to: fromBangkok(p.year, thisStart, day),
  };
}

/** The period right before `range`, of the same kind (a week before a week, a month before a month). */
export function previousRange(kind: SummaryKind, range: DateRange): DateRange {
  if (kind === "weekly")
    return { from: new Date(range.from.getTime() - 7 * DAY_MS), to: range.from };
  const p = bangkokParts(range.from);
  return { from: fromBangkok(p.year, p.month - 1, p.day), to: range.from };
}

export interface SummaryTx {
  occurredAt: Date;
  type: "income" | "expense";
  /** Integer satang. */
  amountSatang: number;
  categoryName: string | null;
}

export interface Totals {
  income: number;
  expense: number;
  count: number;
}

export interface CategoryShare {
  name: string;
  amountSatang: number;
  /** Whole percent of the period's expenses. */
  percent: number;
}

export interface SummaryData {
  current: Totals;
  previous: Totals;
  topExpenses: CategoryShare[];
}

export function summarize(txs: SummaryTx[], range: DateRange, previous: DateRange): SummaryData {
  const current: Totals = { income: 0, expense: 0, count: 0 };
  const before: Totals = { income: 0, expense: 0, count: 0 };
  const byCategory = new Map<string, number>();

  for (const tx of txs) {
    const t = tx.occurredAt.getTime();
    const bucket =
      t >= range.from.getTime() && t < range.to.getTime()
        ? current
        : t >= previous.from.getTime() && t < previous.to.getTime()
          ? before
          : null;
    if (!bucket) continue;
    bucket.count += 1;
    if (tx.type === "income") bucket.income += tx.amountSatang;
    else bucket.expense += tx.amountSatang;
    if (bucket === current && tx.type === "expense") {
      const name = tx.categoryName ?? "ไม่ระบุหมวด";
      byCategory.set(name, (byCategory.get(name) ?? 0) + tx.amountSatang);
    }
  }

  const topExpenses = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amountSatang]) => ({
      name,
      amountSatang,
      percent: current.expense > 0 ? Math.round((amountSatang * 100) / current.expense) : 0,
    }));
  return { current, previous: before, topExpenses };
}

/** Whole-percent change of the expenses against the previous period; null without a baseline. */
export function expenseChangePercent(data: SummaryData): number | null {
  if (data.previous.expense <= 0) return null;
  return Math.round(((data.current.expense - data.previous.expense) * 100) / data.previous.expense);
}

/** "13 – 19 ต.ค." style label for a range (the end day is the day before `to`). */
export function rangeLabel(range: DateRange): string {
  return `${formatThaiDayMonth(range.from)} – ${formatThaiDayMonth(new Date(range.to.getTime() - DAY_MS))}`;
}

const COLOR = { text: "#0F172A", muted: "#64748B", income: "#047857", expense: "#E11D48" };

const row = (label: string, value: string, color: string) => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: label, size: "sm", color: COLOR.muted, flex: 3 },
    { type: "text", text: value, size: "md", weight: "bold", color, align: "end", flex: 5 },
  ],
});

/** The summary card pushed to the chat. `liffUrl` opens the analytics page (omitted when unknown). */
export function buildSummaryMessage(input: {
  kind: SummaryKind;
  range: DateRange;
  data: SummaryData;
  liffUrl?: string;
}): LineMessage {
  return buildSummaryCard({
    title: input.kind === "weekly" ? "สรุปรายสัปดาห์" : "สรุปรายเดือน",
    range: input.range,
    data: input.data,
    against: input.kind === "weekly" ? "สัปดาห์ก่อน" : "เดือนก่อน",
    liffUrl: input.liffUrl,
  });
}

/**
 * The one summary card: totals, the top expense categories and, when `against` names a previous
 * period, the change of the expenses against it. Used by the automatic pushes and the chat commands.
 */
export function buildSummaryCard(input: {
  title: string;
  range: DateRange;
  data: SummaryData;
  /** Name of the previous period ("เดือนก่อน"); omit for no comparison line. */
  against?: string;
  /** Replaces the range under the title (e.g. a single dated day). */
  subtitle?: string;
  liffUrl?: string;
}): LineMessage {
  const { title, range, data, against } = input;
  const subtitle = input.subtitle ?? rangeLabel(range);
  const net = data.current.income - data.current.expense;
  const change = against ? expenseChangePercent(data) : null;

  const body: unknown[] = [
    row("รายรับ", `+฿${formatBaht(data.current.income)}`, COLOR.income),
    row("รายจ่าย", `-฿${formatBaht(data.current.expense)}`, COLOR.expense),
    row(
      "เหลือ",
      `${net < 0 ? "-" : ""}฿${formatBaht(Math.abs(net))}`,
      net < 0 ? COLOR.expense : COLOR.income,
    ),
  ];

  if (data.topExpenses.length > 0) {
    body.push(
      { type: "separator", margin: "lg" },
      { type: "text", text: "ใช้จ่ายเยอะสุด", size: "xs", color: COLOR.muted, margin: "lg" },
    );
    for (const c of data.topExpenses) {
      body.push({
        type: "box",
        layout: "horizontal",
        margin: "sm",
        contents: [
          { type: "text", text: c.name, size: "sm", color: COLOR.text, flex: 4, wrap: true },
          {
            type: "text",
            text: `฿${formatBaht(c.amountSatang)} · ${c.percent}%`,
            size: "sm",
            color: COLOR.muted,
            align: "end",
            flex: 5,
          },
        ],
      });
    }
  }

  if (change !== null) {
    const up = change > 0;
    body.push({
      type: "text",
      text:
        change === 0
          ? `รายจ่ายเท่ากับ${against}`
          : `รายจ่าย${up ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(change)}% จาก${against}`,
      size: "xs",
      color: up ? COLOR.expense : COLOR.income,
      wrap: true,
      margin: "lg",
    });
  }
  body.push({
    type: "text",
    text: `จดไว้ ${data.current.count} รายการ`,
    size: "xs",
    color: COLOR.muted,
    margin: "sm",
  });

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#CCFBF1",
      paddingAll: "16px",
      contents: [
        { type: "text", text: title, weight: "bold", size: "lg", color: "#0B5D4F" },
        { type: "text", text: subtitle, size: "xs", color: "#3F6B63", margin: "xs" },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm", contents: body },
  };
  if (input.liffUrl?.startsWith("https://")) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#0F766E",
          height: "sm",
          action: { type: "uri", label: "ดูรายละเอียด", uri: input.liffUrl },
        },
      ],
    };
  }
  return {
    type: "flex",
    altText: `${title} ${subtitle}: รายรับ ฿${formatBaht(data.current.income)} รายจ่าย ฿${formatBaht(data.current.expense)}`,
    contents: bubble,
  };
}
