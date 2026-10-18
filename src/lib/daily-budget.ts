import { formatBaht } from "@/lib/money";

/** The playful scolds sent the first time a day's spending goes over the daily limit. */
const SCOLDS: ((v: { spent: string; limit: string; over: string }) => string)[] = [
  (v) => `เกินงบวันนี้แล้วนะ! ใช้ไป ฿${v.spent} จาก ฿${v.limit} (เกิน ฿${v.over})`,
  (v) => `เบรกหน่อยนะ กระเป๋าสั่นแล้ว 😅 วันนี้ใช้ไป ฿${v.spent} เกินงบ ฿${v.over}`,
  (v) =>
    `ว้าย! วันนี้รูดเกินงบ ฿${v.over} แล้ว (฿${v.spent} จาก ฿${v.limit}) พรุ่งนี้มาตั้งหลักกันใหม่นะ`,
  (v) => `ใจเย็น ๆ ก่อนนะ งบวันนี้ ฿${v.limit} หมดไปแล้ว ตอนนี้เกินมา ฿${v.over}`,
  (v) => `ติ๊ด ติ๊ด! เกินงบประจำวัน ฿${v.over} (ใช้ไป ฿${v.spent}) ขอกอดกระเป๋าตังค์หน่อย 🫶`,
];

export const SCOLD_COUNT = SCOLDS.length;

/**
 * The warning after spending that took the day's total from `beforeSatang` to `afterSatang` against
 * a daily limit. Going over the limit for the first time gives a full playful scold (the one picked
 * by `pick`, 0..1); more spending while already over gives one short line; anything else, null.
 */
export function dailyBudgetAlert(input: {
  beforeSatang: number;
  afterSatang: number;
  limitSatang: number;
  pick?: number;
}): string | null {
  const { beforeSatang, afterSatang, limitSatang } = input;
  if (limitSatang <= 0 || afterSatang <= beforeSatang || afterSatang <= limitSatang) return null;
  const over = formatBaht(afterSatang - limitSatang);
  if (beforeSatang > limitSatang) return `ยังเกินงบวันนี้อยู่ ฿${over}`;
  const i = Math.min(SCOLDS.length - 1, Math.floor((input.pick ?? Math.random()) * SCOLDS.length));
  const scold = SCOLDS[i];
  return scold
    ? scold({ spent: formatBaht(afterSatang), limit: formatBaht(limitSatang), over })
    : null;
}

/** "วันนี้ใช้ไป ฿320 จาก ฿500 (64%) · เหลือ ฿180" for the status command. */
export function dailyBudgetStatus(spentSatang: number, limitSatang: number): string {
  const percent = Math.floor((spentSatang * 100) / limitSatang);
  const left = limitSatang - spentSatang;
  return [
    `งบวันนี้ ฿${formatBaht(limitSatang)}`,
    `ใช้ไป ฿${formatBaht(spentSatang)} (${percent}%)`,
    left >= 0 ? `เหลือ ฿${formatBaht(left)}` : `เกินมา ฿${formatBaht(-left)}`,
  ].join(" · ");
}
