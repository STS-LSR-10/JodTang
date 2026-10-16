import { REMINDER_GRACE_HOURS } from "@/lib/config";
import { bangkokDateKey } from "@/lib/points";
import { bangkokParts } from "@/lib/thai-date";

/** "20:30" or "20:30:00" -> minutes after midnight, or null when malformed. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((value ?? "").trim());
  if (!m?.[1] || !m[2]) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "20:30" for storing in a `time` column / showing in the UI. */
export function normalizeTime(value: string): string | null {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Is it time to nudge this user? Sends once per Bangkok day, from the chosen time until a few
 * hours later (a delayed cron still delivers, a very late one does not wake people at night).
 */
export function isReminderDue(input: {
  now: Date;
  time: string | null;
  lastRemindedOn: string | null;
}): boolean {
  const target = parseTimeToMinutes(input.time);
  if (target === null) return false;
  if (input.lastRemindedOn === bangkokDateKey(input.now)) return false;

  const p = bangkokParts(input.now);
  const nowMinutes = p.hour * 60 + p.minute;
  return nowMinutes >= target && nowMinutes < target + REMINDER_GRACE_HOURS * 60;
}

const VARIANTS = [
  'วันนี้ยังไม่ได้จดเลยนะ ลองพิมพ์ เช่น "กาแฟ 30" หรือส่งรูปสลิปมาได้เลย',
  'สวัสดี! วันนี้ใช้จ่ายอะไรไปบ้าง พิมพ์จดสั้น ๆ ได้เลย เช่น "ข้าว 60"',
  "แวะมาเตือนเบา ๆ ว่าวันนี้ยังไม่มีรายการนะ จดตอนนี้ไม่กี่วินาทีเสร็จ",
];

/** Reminder text; the variant rotates by day so it does not feel copy-pasted. */
export function reminderText(now: Date, streak: number): string {
  const day = bangkokParts(now).day;
  const base = VARIANTS[day % VARIANTS.length] ?? VARIANTS[0] ?? "";
  return streak >= 2 ? `${base}\nตอนนี้จดต่อเนื่อง ${streak} วันแล้ว อย่าให้ขาดนะ` : base;
}
