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
      { label: "อ่านสลิปอัตโนมัติ", cells: ["30 ใบ/เดือน", "ไม่จำกัด", "ไม่จำกัด"] },
      { label: "ตั้งรายการจดอัตโนมัติ", cells: [false, "20 รายการ", "20 รายการ"] },
      { label: "เตือนจดประจำวัน", cells: [false, true, true] },
    ],
  },
  {
    title: "หมวดและงบ",
    rows: [
      { label: "ตั้งหมวดและงบ", cells: [true, true, true] },
      { label: "บอทจำร้านค้า → หมวด", cells: [false, true, true] },
    ],
  },
  {
    title: "รายงาน",
    rows: [
      { label: "ส่งออก CSV", cells: [true, true, true] },
      { label: "Excel พร้อมชีตสรุป", cells: [false, true, true] },
      { label: "กราฟเก็บออม", cells: [false, true, true] },
    ],
  },
  {
    title: "เร็วๆ นี้",
    rows: [
      { label: "จดในกลุ่ม / หลายบัญชี", cells: [false, false, true], soon: true },
      { label: "จดด้วย PDF", cells: [false, false, true], soon: true },
      { label: "แนบสลิป ใบเสร็จ หลักฐาน", cells: [false, false, true], soon: true },
      { label: "รายการอัตโนมัติ 100 รายการ", cells: [false, false, true], soon: true },
    ],
  },
];

/** Short selling points shown on each plan card. */
export const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  free: ["จดด้วยข้อความ", "อ่านสลิป 30 ใบ/เดือน", "ตั้งหมวดและงบ"],
  plus: ["อ่านสลิปไม่จำกัด", "รายการจดอัตโนมัติ + เตือนประจำวัน", "Excel สรุป กราฟเก็บออม"],
  ultimate: [
    "ทุกอย่างใน Professional",
    "จดในกลุ่ม / หลายบัญชี (เร็วๆ นี้)",
    "จดด้วย PDF + แนบหลักฐาน (เร็วๆ นี้)",
  ],
};
