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
  /** Short, one line. */
  label: string;
  /** Key of the icon the upgrade page draws beside it. */
  icon: FeatureIcon;
  /** Free, Professional, Ultimate. false = not included (shown as a dash). */
  cells: [Cell, Cell, Cell];
  /** The plan.ts feature this row describes; a test keeps the rows and the real gates in step. */
  feature?: Feature;
}

export type FeatureIcon =
  | "text"
  | "shapes"
  | "undo"
  | "slip"
  | "calendar"
  | "list"
  | "tag"
  | "image"
  | "receipt"
  | "sparkles"
  | "mic"
  | "globe"
  | "repeat"
  | "bell"
  | "bellring"
  | "store"
  | "wallet"
  | "transfer"
  | "card"
  | "users"
  | "debt"
  | "target"
  | "piggy"
  | "plane"
  | "group"
  | "chart"
  | "range"
  | "search"
  | "compare"
  | "dashboard"
  | "trend"
  | "mail"
  | "download"
  | "sheet"
  | "lock"
  | "palette"
  | "trash"
  | "gift";

export interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "จดรายการ",
    rows: [
      { label: "จดด้วยข้อความ", icon: "text", cells: [true, true, true] },
      { label: "บอทจัดหมวดให้อัตโนมัติ", icon: "shapes", cells: [true, true, true] },
      { label: "ลบ / แก้ล่าสุด", icon: "undo", cells: [true, true, true] },
      {
        label: "อ่านสลิปอัตโนมัติ",
        icon: "slip",
        cells: ["ลองฟรี 1 ใบ", "5 ใบ/เดือน", "ไม่จำกัด"],
      },
      { label: "จดย้อนหลัง", icon: "calendar", cells: [false, true, true], feature: "backdate" },
      {
        label: "จดหลายรายการในข้อความเดียว",
        icon: "list",
        cells: [false, true, true],
        feature: "multiEntry",
      },
      { label: "ติดแท็ก #Tag", icon: "tag", cells: [false, true, true], feature: "tags" },
      {
        label: "แนบรูปประกอบรายการ",
        icon: "image",
        cells: [false, true, true],
        feature: "entryPhoto",
      },
      { label: "แยกรายการจากใบเสร็จ", icon: "receipt", cells: [false, false, true] },
      {
        label: "ให้ AI อ่านประโยคยาวๆ",
        icon: "sparkles",
        cells: [false, false, true],
        feature: "smartParse",
      },
      { label: "จดด้วยเสียง", icon: "mic", cells: [false, false, true], feature: "voiceLog" },
      {
        label: "จดเงินต่างสกุล",
        icon: "globe",
        cells: [false, false, true],
        feature: "foreignCurrency",
      },
      {
        label: "ตั้งรายการจดอัตโนมัติ",
        icon: "repeat",
        cells: [false, "20 รายการ", "20 รายการ"],
        feature: "recurring",
      },
      {
        label: "เตือนจดประจำวัน",
        icon: "bell",
        cells: [false, true, true],
        feature: "dailyReminder",
      },
      {
        label: "บอทจำร้านค้า → หมวด",
        icon: "store",
        cells: [false, true, true],
        feature: "merchantMemory",
      },
      {
        label: "สร้างหมวดของตัวเอง",
        icon: "shapes",
        cells: [false, true, true],
        feature: "customCategory",
      },
    ],
  },
  {
    title: "กระเป๋าและหนี้",
    rows: [
      {
        label: "กระเป๋าเงินหลายใบ",
        icon: "wallet",
        cells: ["1 ใบ", "5 ใบ", "ไม่จำกัด"],
        feature: "multiAccount",
      },
      {
        label: "โอนระหว่างกระเป๋า",
        icon: "transfer",
        cells: [false, true, true],
        feature: "transfer",
      },
      {
        label: "บัตรเครดิต วงเงิน/ยอดตามรอบบิล",
        icon: "card",
        cells: [false, true, true],
        feature: "creditCard",
      },
      {
        label: "กระเป๋าร่วมแฟน/ครอบครัว",
        icon: "users",
        cells: [false, "2 คน", "10 คน"],
        feature: "sharedWallet",
      },
      { label: "จดหนี้ ให้ยืม/ยืม", icon: "debt", cells: [false, false, true], feature: "debts" },
      {
        label: "เตือนจ่ายบิล",
        icon: "bellring",
        cells: [false, false, true],
        feature: "billReminder",
      },
    ],
  },
  {
    title: "งบและเป้าหมาย",
    rows: [
      { label: "ตั้งงบรวม", icon: "target", cells: [true, true, true] },
      {
        label: "งบแยกตามหมวด",
        icon: "target",
        cells: [false, true, true],
        feature: "categoryBudget",
      },
      {
        label: "เตือนเมื่อใช้งบ 80% / 100%",
        icon: "bellring",
        cells: [false, true, true],
        feature: "budgetAlert",
      },
      {
        label: "งบรายวัน + เตือนทันที",
        icon: "calendar",
        cells: [false, true, true],
        feature: "dailyBudget",
      },
      {
        label: "เป้าหมายการออม",
        icon: "piggy",
        cells: [false, "5 ใบ", "20 ใบ"],
        feature: "savingsGoal",
      },
      { label: "หารค่าใช้จ่ายทริป", icon: "plane", cells: [false, false, true] },
      {
        label: "สมุดกลุ่ม LINE",
        icon: "group",
        cells: [false, false, true],
        feature: "groupLedger",
      },
    ],
  },
  {
    title: "รายงาน",
    rows: [
      { label: "สรุปวัน / เดือน / หมวด", icon: "chart", cells: [true, true, true] },
      {
        label: "สรุปช่วงวันเอง",
        icon: "range",
        cells: [false, true, true],
        feature: "customRange",
      },
      {
        label: "ค้นหาพร้อมยอดรวม",
        icon: "search",
        cells: [false, true, true],
        feature: "searchTotals",
      },
      { label: "สรุปรายปี", icon: "calendar", cells: [false, true, true], feature: "yearSummary" },
      {
        label: "เทียบเดือนต่อเดือน",
        icon: "compare",
        cells: [false, true, true],
        feature: "categoryCompare",
      },
      {
        label: "หน้าวิเคราะห์ กราฟแท่ง/โดนัท",
        icon: "dashboard",
        cells: [false, true, true],
        feature: "dashboard",
      },
      { label: "กราฟเก็บออม", icon: "trend", cells: [false, true, true], feature: "savingsChart" },
      {
        label: "สรุปส่งในแชทอัตโนมัติ",
        icon: "mail",
        cells: [false, true, true],
        feature: "autoSummary",
      },
      { label: "ส่งออก CSV", icon: "download", cells: [false, true, true], feature: "export" },
      {
        label: "ส่งออก Excel พร้อมชีตสรุป",
        icon: "sheet",
        cells: [false, true, true],
        feature: "advancedExport",
      },
      {
        label: "พยากรณ์เงินปลายเดือน",
        icon: "trend",
        cells: [false, false, true],
        feature: "forecast",
      },
      {
        label: "AI Insight วิเคราะห์การใช้จ่าย",
        icon: "sparkles",
        cells: [false, false, true],
        feature: "insight",
      },
    ],
  },
  {
    title: "ส่วนตัวและรางวัล",
    rows: [
      { label: "ล็อกด้วย PIN", icon: "lock", cells: [false, true, true], feature: "pinLock" },
      {
        label: "ธีมการ์ดและนิสัยบอท",
        icon: "palette",
        cells: [false, true, true],
        feature: "personalize",
      },
      { label: "ล้างข้อมูล / ลบบัญชี", icon: "trash", cells: [true, true, true] },
      { label: "ตังสะสมและชวนเพื่อน", icon: "gift", cells: [true, true, true] },
    ],
  },
];

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
