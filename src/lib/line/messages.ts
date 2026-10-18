import { REFERRAL_BONUS_REFEREE, REFERRAL_WINDOW_DAYS } from "@/lib/config";
import type { LineMessage } from "@/lib/types";

export function text(message: string): LineMessage {
  return { type: "text", text: message };
}

export const WELCOME_TEXT = [
  "สวัสดี! เราคือจดตังค์ ผู้ช่วยจดรายรับรายจ่ายของคุณ",
  "",
  "พิมพ์ได้เลย เช่น",
  "• กาแฟ 30",
  "• เงินเดือน 20000",
  "• +500 ขายของ",
  "• เมื่อวาน ข้าวมันไก่ 50",
  "• กาแฟ 30, ข้าว 50 (หลายรายการพร้อมกัน)",
  "",
  'พิมพ์ "ช่วยเหลือ" เมื่อไหร่ก็ได้นะ',
].join("\n");

export const HELP_TEXT = [
  "วิธีใช้จดตังค์",
  "",
  "จดรายการ",
  "• กาแฟ 30 · ข้าวมันไก่ 50.50 · เงินเดือน 20,000",
  "• +500 ขายของ (รายรับ) · -120 ค่าน้ำมัน (รายจ่าย)",
  "• ระบุวัน: เมื่อวาน กาแฟ 45 · 12/10 ค่าไฟ 1200",
  "• หลายรายการ: คั่นด้วยคอมมา หรือขึ้นบรรทัดใหม่",
  "",
  "คำสั่งสั้น",
  "• สรุปวันนี้ · สรุปเดือนนี้ · สรุปหมวด · ล่าสุด",
  "• สรุปปี · เทียบเดือน (Professional ขึ้นไป) · พยากรณ์ · วิเคราะห์ (Ultimate)",
  "• สรุป 1/10 ถึง 15/10 · ค้นหา กาแฟ (Professional ขึ้นไป)",
  "• กระเป๋า (ดูยอดแต่ละกระเป๋า) · จดลงกระเป๋า: กาแฟ 45 @บัตร",
  "• โอนระหว่างกระเป๋า (Professional ขึ้นไป): โอน 500 เงินสด>KTC",
  "• บัตร (วงเงิน/ยอดตามรอบบิลของบัตรเครดิต, Professional ขึ้นไป)",
  "• เงินต่างสกุล (Ultimate): ราเมน 1500 JPY · ตั๋ว 200 USD · ชา 80 เยน (แปลงเป็นบาทตามอัตราของวันนั้น)",
  "• หนี้ (Ultimate): ให้ยืม สมชาย 500 · ยืม แม่ 2000 คืน 25/10 · สมชายคืน 200 · คืนแม่ 1000",
  "• ลบล่าสุด · แก้ล่าสุด 45",
  "• ตังสะสม · รหัสชวน · ใช้รหัส ABCD1234",
].join("\n");

export const NOT_UNDERSTOOD_TEXT =
  'ยังไม่เข้าใจข้อความนี้ ลองพิมพ์ชื่อรายการแล้วตามด้วยจำนวนเงิน เช่น "กาแฟ 30" หรือพิมพ์ "ช่วยเหลือ" ดูวิธีใช้นะ';

export const NOT_A_SLIP_TEXT =
  "ดูเหมือนรูปนี้ไม่ใช่สลิปหรือใบเสร็จ ลองส่งรูปสลิปที่เห็นจำนวนเงินชัด ๆ อีกครั้งนะ";
export const SLIP_UNREADABLE_TEXT =
  'อ่านสลิปนี้ไม่ได้ ลองถ่ายใหม่ให้เห็นตัวเลขชัด ๆ ไม่เบลอ ไม่มีแสงสะท้อน หรือพิมพ์จดเองได้เลย เช่น "ค่าไฟ 1200"';
export const IMAGE_ERROR_TEXT = "โหลดรูปไม่สำเร็จ ลองส่งรูปอีกครั้งนะ";
export const IMAGE_TOO_LARGE_TEXT = "รูปใหญ่เกินไป (เกิน 10 MB) ลองลดขนาดแล้วส่งใหม่นะ";
export const ALREADY_RECORDED_TEXT = "สลิปนี้เคยจดไว้แล้วนะ ไม่ได้จดซ้ำ";
export const SLIP_LOCKED_TEXT =
  'การอ่านสลิปเป็นฟีเจอร์ของแผน Professional ขึ้นไป (Professional อ่านได้ 5 ใบ/เดือน, Ultimate ไม่จำกัด) ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" ตอนนี้พิมพ์จดเองได้เลย เช่น "ค่าไฟ 1200" นะ';
export const SLIP_QUOTA_TEXT =
  'เดือนนี้อ่านสลิปครบ 5 ใบแล้ว (แผน Professional) พิมพ์จดเองได้ไม่จำกัด เช่น "ค่าไฟ 1200" อัปเกรดเป็น Ultimate เพื่ออ่านสลิปไม่จำกัด หรือรอโควตารีเซ็ตต้นเดือนหน้านะ';
export const SLIP_CANCELLED_TEXT = "ยกเลิกแล้ว ไม่ได้จดสลิปนี้";
export const PICK_CATEGORY_TEXT = "เลือกหมวดที่ถูกต้องนะ";
export const REFERRAL_BONUS_TEXT = `ได้โบนัสชวนเพื่อน +${REFERRAL_BONUS_REFEREE} ตังสะสมแล้ว! ตรวจดูได้ที่หน้าตั้งค่า`;
export const USE_CODE_USAGE_TEXT =
  'พิมพ์ "ใช้รหัส" ตามด้วยรหัสของเพื่อน เช่น "ใช้รหัส ABCD1234" เพื่อรับโบนัสทั้งสองฝ่ายนะ';
export const REFERRAL_OK_TEXT = `ใช้รหัสแล้ว! พอจดรายการแรกจะได้โบนัส ${REFERRAL_BONUS_REFEREE} ตังสะสม และเพื่อนก็ได้ด้วยนะ`;
export const REFERRAL_FAIL_TEXT = {
  invalid: "ไม่พบรหัสชวนเพื่อนนี้ ตรวจตัวอักษรอีกครั้งนะ",
  self: "ใช้รหัสของตัวเองไม่ได้นะ",
  already: "คุณใช้รหัสชวนเพื่อนไปแล้ว",
  expired: `ใช้รหัสได้ภายใน ${REFERRAL_WINDOW_DAYS} วันแรกหลังเริ่มใช้งานเท่านั้นนะ`,
} as const;

export function referralShareText(code: string): string {
  return [
    `รหัสชวนเพื่อนของคุณ: ${code}`,
    `ให้เพื่อนพิมพ์ "ใช้รหัส ${code}" ในแชทนี้ พอเพื่อนจดรายการแรก ทั้งคู่ได้โบนัสตังสะสม`,
  ].join("\n");
}

export const MEMORY_PLUS_HINT_TEXT =
  "จดหมวดนี้ให้แล้วนะ การจำผู้รับ → หมวดอัตโนมัติเป็นฟีเจอร์ของแผน Professional (แลกวัน Professional ด้วยตังสะสมได้ที่หน้าตั้งค่า)";

export const SLIP_SOON_TEXT =
  'ฟีเจอร์อ่านสลิปกำลังจะมาเร็ว ๆ นี้ ตอนนี้พิมพ์จดได้เลย เช่น "ค่าไฟ 1200" นะ';

export const TOO_MANY_MESSAGES_TEXT =
  "ส่งมาเร็วไปนิดนะ รอสักครู่แล้วค่อยส่งต่อ ข้อความช่วงนี้อาจไม่ได้ถูกจด";

export const ERROR_TEXT = "ขออภัย ระบบสะดุดชั่วคราว ลองส่งใหม่อีกครั้งในอีกสักครู่นะ";

export const NOTHING_TO_DELETE_TEXT = "ยังไม่มีรายการให้ลบนะ";
export const NOT_FOUND_TEXT = "ไม่พบรายการนี้แล้ว (อาจถูกลบหรือแก้ไขไปก่อนหน้า)";
export const EDIT_USAGE_TEXT =
  'พิมพ์ "แก้ล่าสุด" ตามด้วยจำนวนเงินใหม่ เช่น "แก้ล่าสุด 45" เพื่อแก้รายการล่าสุดนะ';
export const EDIT_HINT_TEXT =
  'ถ้าเป็นรายการล่าสุด พิมพ์ "แก้ล่าสุด 45" เพื่อเปลี่ยนจำนวนเงินได้เลย (การแก้รายการอื่นจะทำได้ในหน้ารายการเร็ว ๆ นี้)';

export const BACKDATE_LOCKED_TEXT =
  'การจดย้อนหลัง (เช่น "เมื่อวาน กาแฟ 60") เป็นฟีเจอร์ของแผน Professional ขึ้นไป ยังไม่ได้จดรายการนี้นะ ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" หรือพิมพ์จดเป็นวันนี้ได้เลย';

export const MULTI_ENTRY_LOCKED_TEXT =
  'การจดหลายรายการในข้อความเดียว (เช่น "ข้าวเช้า 50 / กาแฟ 45") เป็นฟีเจอร์ของแผน Professional ขึ้นไป ยังไม่ได้จดข้อความนี้นะ ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" หรือส่งทีละรายการได้เลย';

export const TAGS_LOCKED_TEXT =
  'การติดแท็ก (เช่น "หมูกระทะ 500 #ปาร์ตี้") เป็นฟีเจอร์ของแผน Professional ขึ้นไป ยังไม่ได้จดรายการนี้นะ ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" หรือพิมพ์จดโดยไม่ใส่แท็กได้เลย';

// ───── yearly summary and month-by-month comparison ─────
export const YEAR_LOCKED_TEXT =
  'การสรุปรายปีเป็นฟีเจอร์ของแผน Professional ขึ้นไป ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ ตอนนี้พิมพ์ "สรุปเดือนนี้" ได้เลย';
export const YEAR_BAD_TEXT =
  "ระบุปีไม่ถูกต้อง ใส่ปี พ.ศ. หรือ ค.ศ. ที่ไม่เกินปีนี้และย้อนหลังไม่เกิน 10 ปี เช่น สรุปปี 2568";
export const yearEmptyText = (yearBE: number) => `สรุปรายปี ${yearBE}\nยังไม่มีรายการในปีนี้`;
export const COMPARE_LOCKED_TEXT =
  'การเทียบเดือนต่อเดือนรายหมวดเป็นฟีเจอร์ของแผน Professional ขึ้นไป ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ';
export const COMPARE_EMPTY_TEXT = "ยังไม่มีรายจ่ายทั้งสองช่วงให้เทียบ ลองจดรายการเพิ่มก่อนนะ";

// ───── AI insight ─────
export const INSIGHT_LOCKED_TEXT =
  'AI Insight (วิเคราะห์การใช้จ่ายด้วย AI) เป็นฟีเจอร์เฉพาะแผน Ultimate ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ ตอนนี้ดูได้ด้วย "เทียบเดือน" หรือ "สรุปหมวด"';
export const INSIGHT_LIMIT_TEXT = "วันนี้ขอวิเคราะห์ครบจำนวนแล้ว พรุ่งนี้ลองใหม่ได้นะ";
export const INSIGHT_EMPTY_TEXT =
  "ยังไม่มีรายจ่ายในรอบนี้ให้วิเคราะห์ ลองจดรายการสักพักแล้วถามใหม่นะ";

// ───── forecast ─────
export const FORECAST_LOCKED_TEXT =
  'การพยากรณ์เงินปลายเดือนเป็นฟีเจอร์เฉพาะแผน Ultimate ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ ตอนนี้ดูสรุปได้ด้วย "สรุปเดือนนี้" หรือ "เทียบเดือน"';
export const FORECAST_EMPTY_TEXT =
  "ยังไม่มีข้อมูลในรอบนี้พอให้พยากรณ์ ลองจดรายการสักพักแล้วถามใหม่นะ";

// ───── recent entries ─────
export const RECENT_EMPTY_TEXT = "ยังไม่มีรายการเลย ลองพิมพ์ เช่น กาแฟ 30 ดูนะ";

// ───── search with totals ─────
export const SEARCH_LOCKED_TEXT =
  'การค้นหาพร้อมยอดรวมเป็นฟีเจอร์ของแผน Professional ขึ้นไป ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ ตอนนี้ค้นหาในหน้ารายการของแอปได้เลย';
export const SEARCH_USAGE_TEXT = [
  "พิมพ์คำที่ต้องการค้นหาต่อท้าย เช่น",
  "• ค้นหา กาแฟ",
  "• ค้นหา #ปาร์ตี้บริษัท",
].join("\n");
export const searchEmptyText = (term: string) => `ค้นหา "${term}"\nไม่พบรายการที่ตรงกันเลย`;

// ───── custom date range summary ─────
export const SUMMARY_RANGE_LOCKED_TEXT =
  'การสรุปช่วงวันเองเป็นฟีเจอร์ของแผน Professional ขึ้นไป ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ ตอนนี้พิมพ์ "สรุปเดือนนี้" ได้เลย';
export const SUMMARY_RANGE_USAGE_TEXT = [
  "ระบุช่วงวันที่ให้ครบทั้งวันเริ่มและวันสิ้นสุด เช่น",
  "• สรุป 1/10 ถึง 15/10",
  "• สรุป 25/9 - 24/10",
  "• สรุป 1/1/2569 ถึง วันนี้",
  'หรือกดปุ่ม "📆 ช่วงวันเอง" ใต้การ์ดสรุปแล้วเลือกจากปฏิทิน',
].join("\n");
export const SUMMARY_RANGE_BAD_DATE_TEXT = "วันที่ไม่ถูกต้อง ลองใหม่ เช่น สรุป 1/10 ถึง 15/10 นะ";
export const SUMMARY_RANGE_ORDER_TEXT =
  "วันเริ่มต้องไม่อยู่หลังวันสิ้นสุด ลองสลับวันที่แล้วส่งใหม่นะ";
export const SUMMARY_RANGE_TOO_LONG_TEXT =
  "เลือกช่วงได้ไม่เกิน 366 วัน ลองย่อช่วงวันที่ลงแล้วส่งใหม่นะ";

// ───── backdating with the date picker ─────
export const BACKDATE_PICKER_LOCKED_TEXT =
  'การจดย้อนหลังเป็นฟีเจอร์ของแผน Professional ขึ้นไป ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ ตอนนี้พิมพ์จดเป็นวันนี้ได้เลย';
export const BACKDATE_BAD_DATE_TEXT =
  'วันที่ที่เลือกใช้ไม่ได้ (ต้องไม่เกินวันนี้) ลองกด "จดย้อนหลัง" แล้วเลือกใหม่ได้เลยนะ';

// ───── AI-assisted reading of long sentences ─────
export const SMART_PREFACE_TEXT = "ให้ AI ช่วยอ่านข้อความนี้แล้ว ตรวจก่อนจดนะ";
export const SMART_CANCELLED_TEXT = "ยกเลิกแล้ว ไม่ได้จดรายการนี้ ลองพิมพ์ใหม่ได้เลย";

// ───── receipt split ─────
export const SPLIT_LOCKED_TEXT =
  'การแยกรายการจากใบเสร็จเป็นฟีเจอร์เฉพาะแผน Ultimate กด "ยืนยัน" เพื่อจดเป็นยอดรวมใบเดียวได้เลยนะ';
export const SPLIT_UNAVAILABLE_TEXT =
  'ใบนี้แยกรายการไม่ได้ (อ่านรายการได้ไม่พอ หรือยอดรายการเกินยอดรวม) กด "ยืนยัน" เพื่อจดเป็นยอดรวมใบเดียวนะ';
export const splitDoneText = (lines: { title: string; amountBaht: string }[], totalBaht: string) =>
  [
    `แยกเป็น ${lines.length} รายการแล้ว (รวม ฿${totalBaht})`,
    ...lines.slice(0, 12).map((l) => `• ${l.title} ฿${l.amountBaht}`),
    ...(lines.length > 12 ? [`และอีก ${lines.length - 12} รายการ`] : []),
  ].join("\n");

// ───── photos attached to entries ─────
export const PHOTO_LOCKED_TEXT =
  'การแนบรูปประกอบรายการเป็นฟีเจอร์ของแผน Professional ขึ้นไป ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ';
export const PHOTO_ASK_TEXT =
  "ส่งรูปที่ต้องการแนบมาได้เลย (ภายใน 10 นาที) ถ้าส่งรูปอื่นภายหลัง ระบบจะอ่านเป็นสลิปตามปกติ";
export const PHOTO_ASK_REPLACE_TEXT =
  "รายการนี้มีรูปแนบอยู่แล้ว ส่งรูปใหม่มาได้เลย (ภายใน 10 นาที) รูปใหม่จะมาแทนรูปเดิมนะ";
export const PHOTO_LIMIT_TEXT =
  "เดือนนี้แนบรูปครบจำนวนแล้ว ไว้เดือนหน้าแนบเพิ่มได้ใหม่นะ ตอนนี้จดรายการได้ตามปกติ";
export const PHOTO_ATTACHED_TEXT = (title: string) => `แนบรูปกับ "${title}" แล้ว`;
export const PHOTO_EXPIRED_TEXT =
  'หมดเวลารอรูปของรายการนี้แล้ว กดปุ่ม "แนบรูป" ที่การ์ดรายการอีกครั้งได้เลยนะ';

// ───── voice messages ─────
export const VOICE_LOCKED_TEXT =
  'จดด้วยเสียงเป็นฟีเจอร์เฉพาะแผน Ultimate ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ (ตอนนี้พิมพ์จดได้เลย เช่น "กาแฟ 30")';
export const VOICE_UNAVAILABLE_TEXT = "ตอนนี้ยังไม่เปิดให้จดด้วยเสียง พิมพ์จดแทนได้เลยนะ";
export const VOICE_TOO_LONG_TEXT =
  "ข้อความเสียงยาวเกินไป (สูงสุด 30 วินาที) ลองพูดสั้น ๆ ครั้งละไม่กี่รายการนะ";
export const VOICE_DAY_LIMIT_TEXT =
  "วันนี้จดด้วยเสียงครบจำนวนแล้ว พิมพ์จดแทนได้เลย พรุ่งนี้ใช้ได้ใหม่นะ";
export const VOICE_FAILED_TEXT = "ถอดเสียงไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์จดแทนได้นะ";
export const VOICE_EMPTY_TEXT = "ไม่ได้ยินเสียงพูดชัด ๆ ลองพูดใหม่ให้ใกล้ไมค์อีกนิดนะ";
export const VOICE_CANCELLED_TEXT = "ยกเลิกแล้ว ไม่ได้จดรายการนี้ ลองพูดใหม่ได้เลย";
export const voiceHeardText = (heard: string) => `ได้ยินว่า: "${heard}"`;
export const voiceNoAmountText = (heard: string) =>
  `ได้ยินว่า "${heard}" แต่ไม่เจอจำนวนเงิน ลองพูดใหม่ เช่น "กาแฟ สามสิบบาท" หรือพิมพ์จดแทนได้นะ`;

export const WALLET_NOT_FOUND_TEXT = (hint: string, names: string[]) =>
  `ไม่พบกระเป๋า "${hint}" เลยยังไม่ได้จดรายการนี้\nกระเป๋าที่มี: ${names.join(" · ")}\nพิมพ์ชื่อใหม่อีกครั้ง หรือไม่ใส่ @ เพื่อจดลงกระเป๋าหลักนะ`;
export const WALLET_AMBIGUOUS_TEXT = (hint: string, names: string[]) =>
  `"${hint}" ตรงกับหลายกระเป๋า (${names.join(" · ")}) เลยยังไม่ได้จดรายการนี้\nพิมพ์ชื่อให้ชัดขึ้นอีกนิดนะ`;
export const WALLET_MOVED_TEXT = (title: string, wallet: string) =>
  `ย้าย "${title}" ไปที่ ${wallet} แล้ว`;
export const WALLET_MOVE_ASK_TEXT = "ย้ายรายการนี้ไปกระเป๋าไหนดี?";
export const TRANSFER_LOCKED_TEXT =
  'การโอนระหว่างกระเป๋าเป็นฟีเจอร์ของแผน Professional ขึ้นไป (มีกระเป๋าได้ถึง 5 ใบ) ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ';
export const TRANSFER_SAME_TEXT = "โอนไปกระเป๋าเดียวกันไม่ได้ ลองระบุสองกระเป๋าที่ต่างกันนะ";
export const TRANSFER_USAGE_TEXT =
  'โอนระหว่างกระเป๋าพิมพ์ เช่น "โอน 500 เงินสด>KTC" หรือ "โอน 500 จาก เงินสด ไป KTC" การโอนไม่นับเป็นรายรับหรือรายจ่ายนะ';
export const TRANSFER_CANCELLED_TEXT = "ยกเลิกการโอนแล้ว ยอดสองกระเป๋ากลับเป็นเหมือนเดิม";
export const CARD_LOCKED_TEXT =
  'วงเงินและยอดตามรอบบิลของบัตรเครดิตเป็นฟีเจอร์ของแผน Professional ขึ้นไป ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ';
export const CARD_NONE_TEXT =
  'ยังไม่มีกระเป๋าบัตรเครดิต เพิ่มได้ที่หน้ากระเป๋า (เลือกชนิด "บัตรเครดิต" แล้วใส่วงเงินกับวันตัดรอบ) แล้วจดด้วย "กาแฟ 45 @ชื่อบัตร" นะ';
export const CARD_NO_DETAIL_TEXT =
  "บัตรนี้ยังไม่ได้ตั้งวงเงินหรือวันตัดรอบ ตั้งได้ที่หน้ากระเป๋านะ";
export const DEBT_LOCKED_TEXT =
  'การจดหนี้สิน (ให้ยืม/ยืม) เป็นฟีเจอร์ของแผน Ultimate ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ';
export const DEBT_EMPTY_TEXT =
  'ยังไม่มีหนี้ค้าง ลองพิมพ์ "ให้ยืม สมชาย 500" หรือ "ยืม แม่ 2000 คืน 25/10" (ใส่ @กระเป๋า ท้ายข้อความได้ เช่น "ให้ยืม สมชาย 500 @เงินสด") และ "สมชายคืน 200" เมื่อได้เงินคืนนะ';
export const DEBT_TOO_MANY_TEXT = "คนเดียวกันมีหนี้ค้างได้ไม่เกิน 200 ก้อน";
export const DEBT_BAD_DUE_TEXT =
  "วันครบกำหนดไม่ถูกต้อง ลองใช้รูปแบบ 25/10 หรือ พรุ่งนี้ หรือ ภายใน 7 วัน นะ";
export const DEBT_CANCELLED_TEXT = "ยกเลิกแล้ว ยอดกระเป๋ากลับเป็นเหมือนเดิม";
export const debtOverpayText = (person: string, leftBaht: string) =>
  `ชำระเกินยอดที่เหลือไม่ได้ ${person} เหลือ ฿${leftBaht} ลองพิมพ์ยอดที่ไม่เกินนี้นะ`;
export const FX_LOCKED_TEXT =
  'การจดเงินต่างสกุล (เช่น 1500 JPY) แปลงเป็นบาทให้อัตโนมัติ เป็นฟีเจอร์ของแผน Ultimate ลองทดลองใช้ฟรี 7 วันได้ที่เมนู "อัปเกรด" นะ ตอนนี้พิมพ์ยอดเป็นบาทได้เลย';
export const fxUnsupportedText = (code: string) =>
  `ยังไม่รองรับสกุล ${code} (แหล่งอัตราแลกเปลี่ยนไม่มี) ลองพิมพ์ยอดเป็นบาทแทนนะ`;
export const FX_FAILED_TEXT =
  "ดึงอัตราแลกเปลี่ยนไม่ได้ในตอนนี้ เลยยังไม่ได้จดรายการนี้ ลองใหม่อีกครั้งในสักครู่ หรือพิมพ์ยอดเป็นบาทได้เลยนะ";
export const FX_TOO_SMALL_TEXT =
  "ยอดนี้แปลงเป็นบาทแล้วน้อยกว่า 1 สตางค์ ลองตรวจจำนวนเงินอีกครั้งนะ";
