import type { Plan } from "@/lib/plan";

export type Period = "monthly" | "yearly";
export type PaidPlan = Exclude<Plan, "free">;

export interface PlanPrice {
  /** Whole baht. */
  monthly: number;
  yearly: number;
}

/** Display prices. The payment provider stays the source of truth for what is actually charged. */
export const PRICES: Record<PaidPlan, PlanPrice> = {
  plus: { monthly: 59, yearly: 299 },
  ultimate: { monthly: 139, yearly: 799 },
};

export const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, yearly: 12 };

/** Baht per day of the yearly plan, one decimal: 299 -> "0.8". */
export function yearlyPerDay(price: PlanPrice): string {
  return (price.yearly / 365).toFixed(1);
}

/** Whole-number percent saved by paying yearly instead of 12 monthly payments. */
export function yearlySavingPercent(price: PlanPrice): number {
  return Math.round((1 - price.yearly / (price.monthly * 12)) * 100);
}

/** A cell of the comparison table: included, not included, or a short text. */
export type Cell = boolean | string;

export interface FeatureRow {
  label: string;
  /** Free, Professional, Ultimate. */
  cells: [Cell, Cell, Cell];
  /** Not built yet: shown as "เร็วๆ นี้" instead of a tick. */
  soon?: boolean;
}

export interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "จด",
    rows: [
      { label: "จดด้วยข้อความ", cells: [true, true, true] },
      { label: "อ่านสลิปอัตโนมัติ", cells: [false, "5 ใบ/เดือน", "ไม่จำกัด"] },
      { label: "จดย้อนหลัง", cells: [false, true, true] },
      { label: "จดหลายรายการในข้อความเดียว", cells: [false, true, true] },
      { label: "ติดแท็ก #Tag", cells: [false, true, true] },
      { label: "แนบรูปประกอบรายการ", cells: [false, true, true] },
      {
        label: "กระเป๋าเงิน (เงินสด/บัญชี/บัตร/เงินเก็บ)",
        cells: ["1 ใบ", "สูงสุด 5 ใบ", "ไม่จำกัด"],
      },
      { label: "โอนระหว่างกระเป๋า", cells: [false, true, true] },
      { label: "แยกรายการจากใบเสร็จ", cells: [false, false, true] },
      { label: "พิมพ์ประโยคยาวๆ ให้ AI ช่วยอ่าน", cells: [false, false, true] },
      { label: "จดด้วยเสียง", cells: [false, false, true] },
      { label: "ตั้งรายการจดอัตโนมัติ", cells: [false, "20 รายการ", "20 รายการ"] },
      { label: "เตือนจดประจำวัน", cells: [false, true, true] },
    ],
  },
  {
    title: "หมวดและงบ",
    rows: [
      { label: "ตั้งหมวดและงบ", cells: [true, true, true] },
      { label: "สร้างหมวดของตัวเอง + เลือกอีโมจิ", cells: [false, true, true] },
      { label: "บอทจำร้านค้า → หมวด", cells: [false, true, true] },
    ],
  },
  {
    title: "รายงาน",
    rows: [
      { label: "สรุปวันนี้ / เดือนนี้", cells: [true, true, true] },
      { label: "สรุปช่วงวันเอง", cells: [false, true, true] },
      { label: "ค้นหาพร้อมยอดรวม", cells: [false, true, true] },
      { label: "สรุปรายปี", cells: [false, true, true] },
      { label: "พยากรณ์เงินปลายเดือน", cells: [false, false, true] },
      { label: "AI Insight วิเคราะห์การใช้จ่าย", cells: [false, false, true] },
      { label: "เทียบเดือนต่อเดือนรายหมวด", cells: [false, true, true] },
      { label: "หน้าวิเคราะห์ (กราฟแท่ง / โดนัท)", cells: [false, true, true] },
      { label: "ส่งออก CSV", cells: [false, true, true] },
      { label: "Excel พร้อมชีตสรุป", cells: [false, true, true] },
      { label: "กราฟเก็บออม", cells: [false, true, true] },
    ],
  },
  {
    title: "เร็วๆ นี้",
    rows: [
      { label: "จดในกลุ่ม", cells: [false, false, true], soon: true },
      { label: "จดด้วย PDF", cells: [false, false, true], soon: true },
      { label: "แนบสลิป ใบเสร็จ หลักฐาน", cells: [false, false, true], soon: true },
      { label: "รายการอัตโนมัติ 100 รายการ", cells: [false, false, true], soon: true },
    ],
  },
];

/** Short selling points shown on each plan card. */
export const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  free: ["จดด้วยข้อความ", "ตั้งหมวดและงบ"],
  plus: [
    "อ่านสลิป 5 ใบ/เดือน + จดย้อนหลัง",
    "รายการจดอัตโนมัติ + เตือนประจำวัน",
    "ส่งออก CSV/Excel + กราฟวิเคราะห์",
    "กราฟเก็บออม + สรุปในแชท",
  ],
  ultimate: [
    "ทุกอย่างใน Professional",
    "อ่านสลิปไม่จำกัด + แยกรายการจากใบเสร็จ",
    "พิมพ์ประโยคยาวๆ ให้ AI ช่วยอ่าน + จดด้วยเสียง",
    "หลายกระเป๋าไม่จำกัด · จดในกลุ่ม (เร็วๆ นี้)",
    "จดด้วย PDF + แนบหลักฐาน (เร็วๆ นี้)",
  ],
};

/** Free trial length (once per person and tier). */
export const TRIAL_DAYS = 7;

/** Stripe's smallest THB charge. */
export const MIN_CHARGE_BAHT = 10;

export interface UpgradeQuote {
  /** Whole baht to pay for the difference. */
  amountBaht: number;
  /** Days of prepaid time left that the upgrade covers. */
  days: number;
}

const TIER_RANK: Record<PaidPlan, number> = { plus: 1, ultimate: 2 };

/**
 * Price of moving prepaid (PromptPay) time to a higher tier, keeping the end date: the difference
 * in daily price between the two tiers (at the rate of the period that was bought) times the days
 * left. Rounded up to whole baht, at least Stripe's minimum and never above a full new period.
 * Null when `to` is not higher than `from`.
 */
export function prepaidUpgradeQuote(input: {
  from: PaidPlan;
  to: PaidPlan;
  /** Months of the prepaid purchase being upgraded (12 = yearly, otherwise monthly). */
  months: number;
  expiresAt: Date;
  now: Date;
}): UpgradeQuote | null {
  if (TIER_RANK[input.to] <= TIER_RANK[input.from]) return null;
  const period: Period = input.months >= 12 ? "yearly" : "monthly";
  const periodDays = period === "yearly" ? 365 : 30;
  const days = Math.max(
    1,
    Math.ceil((input.expiresAt.getTime() - input.now.getTime()) / 86_400_000),
  );
  // integer arithmetic first, so an exact result (e.g. 40) is not pushed up by float rounding
  const raw = Math.ceil(
    ((PRICES[input.to][period] - PRICES[input.from][period]) * days) / periodDays,
  );
  const amountBaht = Math.min(PRICES[input.to][period], Math.max(MIN_CHARGE_BAHT, raw));
  return { amountBaht, days };
}
