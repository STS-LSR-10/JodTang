import type { Feature, Plan } from "@/lib/plan";

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
  /** Free, Professional, Ultimate. false = not included (the plan's list leaves it out). */
  cells: [Cell, Cell, Cell];
  /** The plan.ts feature this row describes; a test keeps the rows and the real gates in step. */
  feature?: Feature;
}

export interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "จดรายการ",
    rows: [
      {
        label: "จดรายรับรายจ่ายด้วยข้อความ (เช่น กาแฟ 30, +500 ขายของ)",
        cells: [true, true, true],
      },
      { label: "บอทจัดหมวดให้อัตโนมัติ ปรับหมวดหรือแก้ไขได้ทันที", cells: [true, true, true] },
      { label: "ลบล่าสุด / แก้ล่าสุด และดู แก้ไข ลบรายการในหน้าเว็บ", cells: [true, true, true] },
      { label: "การ์ดยืนยันหลังจด (เลือกแบบเต็ม แบบสั้น หรือปิดได้)", cells: [true, true, true] },
      { label: "อ่านสลิปอัตโนมัติ", cells: ["ลองฟรี 1 ใบ", "5 ใบ/เดือน", "ไม่จำกัด"] },
      {
        label: "จดย้อนหลัง (พิมพ์วันที่หรือเลือกจากปฏิทิน)",
        cells: [false, true, true],
        feature: "backdate",
      },
      {
        label: "จดหลายรายการในข้อความเดียว",
        cells: [false, true, true],
        feature: "multiEntry",
      },
      { label: "ติดแท็ก #Tag", cells: [false, true, true], feature: "tags" },
      { label: "แนบรูปประกอบรายการ", cells: [false, true, true], feature: "entryPhoto" },
      { label: "แยกรายการจากใบเสร็จ", cells: [false, false, true] },
      {
        label: "พิมพ์ประโยคยาวๆ ให้ AI ช่วยอ่าน",
        cells: [false, false, true],
        feature: "smartParse",
      },
      { label: "จดด้วยเสียง", cells: [false, false, true], feature: "voiceLog" },
      {
        label: "จดเงินต่างสกุล (แปลงเป็นบาทตามอัตราวันนั้น)",
        cells: [false, false, true],
        feature: "foreignCurrency",
      },
      {
        label: "ตั้งรายการจดอัตโนมัติ (ค่าเช่า สมัครสมาชิก)",
        cells: [false, "20 รายการ", "20 รายการ"],
        feature: "recurring",
      },
      { label: "เตือนจดประจำวัน", cells: [false, true, true], feature: "dailyReminder" },
      {
        label: "บอทจำร้านค้า → หมวด",
        cells: [false, true, true],
        feature: "merchantMemory",
      },
      {
        label: "สร้างหมวดของตัวเอง + เลือกอีโมจิ",
        cells: [false, true, true],
        feature: "customCategory",
      },
    ],
  },
  {
    title: "กระเป๋าเงินและหนี้",
    rows: [
      {
        label: "กระเป๋าเงิน (เงินสด/บัญชี/บัตร/เงินเก็บ) และจดลงกระเป๋าด้วย @ชื่อ",
        cells: ["1 ใบ", "สูงสุด 5 ใบ", "ไม่จำกัด"],
        feature: "multiAccount",
      },
      { label: "โอนระหว่างกระเป๋า", cells: [false, true, true], feature: "transfer" },
      {
        label: "วงเงินและยอดตามรอบบิลบัตรเครดิต",
        cells: [false, true, true],
        feature: "creditCard",
      },
      {
        label: "กระเป๋าร่วมกับแฟน/ครอบครัว (จดจากแชทตัวเอง ยอดเดียวกัน)",
        cells: [false, "2 คน", "สูงสุด 10 คน"],
        feature: "sharedWallet",
      },
      {
        label: "จดหนี้ ให้ยืม/ยืม (ตัดยอดกระเป๋า)",
        cells: [false, false, true],
        feature: "debts",
      },
      {
        label: "เตือนวันครบกำหนดจ่ายบิล (บัตรเครดิต ค่าไฟ ฯลฯ)",
        cells: [false, false, true],
        feature: "billReminder",
      },
    ],
  },
  {
    title: "งบและเป้าหมาย",
    rows: [
      { label: "ตั้งงบรวมต่อรอบ (รายเดือน/รายสัปดาห์)", cells: [true, true, true] },
      { label: "งบแยกตามหมวดหมู่", cells: [false, true, true], feature: "categoryBudget" },
      {
        label: "เตือนเมื่อใช้งบ 80% / 100%",
        cells: [false, true, true],
        feature: "budgetAlert",
      },
      {
        label: "งบรายวัน + บอทเตือนทันทีเมื่อใช้เกิน",
        cells: [false, true, true],
        feature: "dailyBudget",
      },
      {
        label: "เป้าหมายการออม (กระปุก + กราฟ)",
        cells: [false, "5 ใบ", "20 ใบ"],
        feature: "savingsGoal",
      },
      {
        label: "หารค่าใช้จ่ายทริป สรุปว่าใครโอนคืนใครกี่บาท",
        cells: [false, false, true],
      },
      {
        label: "สมุดกลุ่ม LINE: ดึงบอทเข้ากลุ่ม ช่วยกันจด แยกคนจ่าย",
        cells: [false, false, true],
        feature: "groupLedger",
      },
    ],
  },
  {
    title: "รายงานและส่งออก",
    rows: [
      { label: "สรุปวันนี้ / เดือนนี้ / รายหมวด / รายการล่าสุด", cells: [true, true, true] },
      { label: "สรุปช่วงวันเอง", cells: [false, true, true], feature: "customRange" },
      { label: "ค้นหาพร้อมยอดรวม", cells: [false, true, true], feature: "searchTotals" },
      { label: "สรุปรายปี", cells: [false, true, true], feature: "yearSummary" },
      {
        label: "เทียบเดือนต่อเดือนรายหมวด",
        cells: [false, true, true],
        feature: "categoryCompare",
      },
      {
        label: "หน้าวิเคราะห์ (กราฟแท่ง / โดนัท)",
        cells: [false, true, true],
        feature: "dashboard",
      },
      { label: "กราฟเก็บออม", cells: [false, true, true], feature: "savingsChart" },
      {
        label: "สรุปรายสัปดาห์ / รายเดือนส่งให้ในแชทอัตโนมัติ",
        cells: [false, true, true],
        feature: "autoSummary",
      },
      { label: "ส่งออก CSV", cells: [false, true, true], feature: "export" },
      { label: "Excel พร้อมชีตสรุป", cells: [false, true, true], feature: "advancedExport" },
      {
        label: "พยากรณ์เงินปลายเดือน",
        cells: [false, false, true],
        feature: "forecast",
      },
      {
        label: "AI Insight วิเคราะห์การใช้จ่าย",
        cells: [false, false, true],
        feature: "insight",
      },
    ],
  },
  {
    title: "ความปลอดภัยและส่วนตัว",
    rows: [
      {
        label: "ล้างข้อมูลเพื่อเริ่มต้นใหม่ / ลบบัญชีและข้อมูลทั้งหมด",
        cells: [true, true, true],
      },
      { label: "ล็อกหน้าเว็บด้วย PIN 4–6 หลัก", cells: [false, true, true], feature: "pinLock" },
      {
        label: "ธีมสีการ์ด 5 แบบ + นิสัยบอท 4 แบบ",
        cells: [false, true, true],
        feature: "personalize",
      },
    ],
  },
  {
    title: "ตังสะสมและชวนเพื่อน",
    rows: [
      { label: "ตังสะสมจากการจดต่อเนื่อง แลกเป็นวันใช้ Professional", cells: [true, true, true] },
      { label: "ชวนเพื่อนรับโบนัสตังสะสมทั้งสองฝ่าย", cells: [true, true, true] },
    ],
  },
];

/** The features a plan has, by group; what the plan does not include is left out. */
export function featuresForPlan(
  plan: Plan,
): { title: string; items: { label: string; detail: string | null }[] }[] {
  const column = plan === "free" ? 0 : plan === "plus" ? 1 : 2;
  return FEATURE_GROUPS.map((group) => ({
    title: group.title,
    items: group.rows
      .filter((row) => row.cells[column] !== false)
      .map((row) => {
        const cell = row.cells[column];
        return { label: row.label, detail: typeof cell === "string" ? cell : null };
      }),
  })).filter((group) => group.items.length > 0);
}

/** Short selling points shown on each plan card. */
export const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  free: ["จดด้วยข้อความ", "ตั้งหมวดและงบรวม"],
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
    "หลายกระเป๋าไม่จำกัด · สมุดกลุ่ม LINE แยกคนจ่าย",
    "พยากรณ์เงินปลายเดือน + AI Insight · กระเป๋าร่วมสูงสุด 10 คน",
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
