import type { DaySpec } from "@/lib/summary-range";
import { parseDebtText, type DebtCommand } from "@/lib/debt";
import { parseBillText, type BillCommand } from "@/lib/bill";
import { parseGoalText, type GoalCommand } from "@/lib/goal";
import { parseTransferText } from "@/lib/transfer";
import { normalizeThaiDigits, parseAmountToSatang } from "@/lib/parse/thai-number";

export type Command =
  | { kind: "help" }
  | { kind: "summary-range"; start: DaySpec; end: DaySpec | "today" }
  | { kind: "summary-range-usage" }
  | { kind: "search"; term: string }
  | { kind: "search-usage" }
  | { kind: "recent" }
  | { kind: "category-spend" }
  | { kind: "year-summary"; year: number | "last" | null }
  | { kind: "compare-months" }
  | { kind: "forecast" }
  | { kind: "insight" }
  | { kind: "wallets" }
  | { kind: "cards"; name: string | null }
  | { kind: "debts" }
  | { kind: "daily-budget"; action: "show" | "set" | "clear" | "usage"; amountSatang?: number }
  | DebtCommand
  | GoalCommand
  | BillCommand
  | { kind: "wallet-join"; code: string | null }
  | { kind: "wallet-invite"; name: string }
  | { kind: "wallet-leave"; name: string }
  | { kind: "transfer"; amountSatang: number; from: string; to: string }
  | { kind: "summary"; scope: "today" | "month" }
  | { kind: "delete-latest" }
  | { kind: "edit-latest"; amountSatang: number }
  | { kind: "edit-latest-usage" }
  | { kind: "points" }
  | { kind: "my-code" }
  | { kind: "use-code"; code: string }
  | { kind: "use-code-usage" };

const DAY = String.raw`(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?`;
// "สรุป 1/10 ถึง 15/10", "สรุป 25/9 - 24/10/2569", "สรุปวันที่ 1/10 ถึงวันนี้"
const SUMMARY_RANGE_RE = new RegExp(
  `^สรุป(?:วันที่)?\\s+${DAY}\\s*(?:ถึงวันที่|ถึง|ไป|-|–|—)\\s*(?:${DAY}|วันนี้)$`,
);

function typedDay(d: string | undefined, m: string | undefined, y: string | undefined): DaySpec {
  return { day: Number(d), month: Number(m), year: y === undefined ? null : Number(y) };
}

/** Recognize the short commands. Returns null for anything that should be parsed as a transaction. */
export function parseCommand(input: string): Command | null {
  const text = normalizeThaiDigits(input).trim().replace(/\s+/g, " ").toLowerCase();

  if (["ช่วยเหลือ", "วิธีใช้", "help", "?", "เมนู"].includes(text)) return { kind: "help" };
  if (text === "สรุปวันนี้") return { kind: "summary", scope: "today" };
  if (text === "สรุปเดือนนี้") return { kind: "summary", scope: "month" };
  if (["ล่าสุด", "รายการล่าสุด", "5 รายการล่าสุด"].includes(text)) return { kind: "recent" };
  if (["สรุปหมวด", "สรุปตามหมวด", "สรุปหมวดหมู่"].includes(text)) return { kind: "category-spend" };
  if (["เทียบเดือน", "เทียบเดือนก่อน", "เปรียบเทียบเดือน"].includes(text)) {
    return { kind: "compare-months" };
  }
  if (["วิเคราะห์", "วิเคราะห์การใช้จ่าย", "ai insight", "insight"].includes(text)) {
    return { kind: "insight" };
  }
  if (["กระเป๋า", "กระเป๋าเงิน", "ยอดเงิน", "ยอดคงเหลือ", "wallet", "wallets"].includes(text)) {
    return { kind: "wallets" };
  }
  // "บัตร" / "บัตรเครดิต" / "บัตร ktc" (a name has no digits: "บัตร 500" is an ordinary entry)
  const cards = /^(?:บัตรเครดิต|บัตร)(?:\s+([^\d]+))?$/.exec(text);
  if (cards) return { kind: "cards", name: cards[1]?.trim() || null };
  // "งบวัน" shows, "งบวัน 500" sets, "งบวัน ปิด" clears the daily limit
  const daily = /^(?:งบรายวัน|งบวัน)(?:\s+(.+))?$/.exec(text);
  if (daily) {
    const arg = daily[1]?.trim();
    if (!arg) return { kind: "daily-budget", action: "show" };
    if (["ปิด", "ล้าง", "ยกเลิก", "off"].includes(arg))
      return { kind: "daily-budget", action: "clear" };
    const m = /^(\d(?:[\d,]*\d)?(?:\.\d+)?)\s*(k|พัน|หมื่น|แสน|ล้าน)?\s*(?:บาท)?$/.exec(arg);
    const satang = m?.[1] ? parseAmountToSatang(m[1], m[2]) : 0;
    return satang > 0
      ? { kind: "daily-budget", action: "set", amountSatang: satang }
      : { kind: "daily-budget", action: "usage" };
  }
  if (["หนี้", "หนี้สิน", "ลูกหนี้", "เจ้าหนี้", "debts"].includes(text)) return { kind: "debts" };
  const transfer = parseTransferText(text);
  if (transfer) return { kind: "transfer", ...transfer };
  // names keep their case, so the debt phrases read the original text
  // shared wallets: "ร่วมกระเป๋า 482913" · "เชิญ กองกลาง" · "ออกจากกระเป๋า กองกลาง"
  const join = /^ร่วมกระเป๋า(?:\s+(.+))?$/.exec(
    normalizeThaiDigits(input).trim().replace(/\s+/g, " "),
  );
  if (join)
    return { kind: "wallet-join", code: /^\d{6}$/.test(join[1] ?? "") ? (join[1] ?? null) : null };
  const invite = /^เชิญ(?:เข้ากระเป๋า)?\s+([^\d]+)$/.exec(input.trim().replace(/\s+/g, " "));
  if (invite?.[1]) return { kind: "wallet-invite", name: invite[1].trim() };
  const leave = /^ออกจากกระเป๋า\s+(.+)$/.exec(input.trim().replace(/\s+/g, " "));
  if (leave?.[1]) return { kind: "wallet-leave", name: leave[1].trim() };
  const bill = parseBillText(normalizeThaiDigits(input).trim().replace(/\s+/g, " "));
  if (bill) return bill;
  const goal = parseGoalText(normalizeThaiDigits(input).trim().replace(/\s+/g, " "));
  if (goal) return goal;
  const debt = parseDebtText(normalizeThaiDigits(input).trim().replace(/\s+/g, " "));
  if (debt) return debt;
  if (["พยากรณ์", "พยากรณ์เงิน", "พยากรณ์ปลายเดือน", "พยากรณ์ปลายรอบ"].includes(text)) {
    return { kind: "forecast" };
  }
  if (["สรุปปี", "สรุปรายปี", "สรุปปีนี้"].includes(text))
    return { kind: "year-summary", year: null };
  if (["สรุปปีที่แล้ว", "สรุปปีก่อน"].includes(text)) return { kind: "year-summary", year: "last" };
  const yearMatch = /^(?:สรุปปี|สรุปรายปี)\s+(\d{4})$/.exec(text);
  if (yearMatch?.[1]) return { kind: "year-summary", year: Number(yearMatch[1]) };
  const range = SUMMARY_RANGE_RE.exec(text);
  if (range) {
    return {
      kind: "summary-range",
      start: typedDay(range[1], range[2], range[3]),
      end: range[4] === undefined ? "today" : typedDay(range[4], range[5], range[6]),
    };
  }
  // "สรุป" followed by a date that is not a full range: show how to write one
  if (/^สรุป(?:วันที่)?\s+\d{1,2}\/\d{1,2}/.test(text)) return { kind: "summary-range-usage" };
  // "ค้นหา กาแฟ" / "ค้นหา #ปาร์ตี้": the term is taken from the original text so it keeps its case
  if (text === "ค้นหา") return { kind: "search-usage" };
  if (text.startsWith("ค้นหา ")) {
    const term = input.trim().replace(/\s+/g, " ").slice("ค้นหา ".length).trim();
    return term ? { kind: "search", term } : { kind: "search-usage" };
  }
  if (text === "ลบล่าสุด") return { kind: "delete-latest" };
  if (["ตังสะสม", "แต้ม", "แต้มสะสม", "points"].includes(text)) return { kind: "points" };
  if (["รหัสชวน", "รหัสชวนเพื่อน", "รหัสของฉัน"].includes(text)) return { kind: "my-code" };

  if (text.startsWith("ใช้รหัส")) {
    const code = /^ใช้รหัส\s+([a-z0-9]{4,16})$/.exec(text)?.[1];
    return code ? { kind: "use-code", code: code.toUpperCase() } : { kind: "use-code-usage" };
  }

  if (text.startsWith("แก้ล่าสุด")) {
    const rest = text.slice("แก้ล่าสุด".length).trim();
    const m = /^(\d(?:[\d,]*\d)?(?:\.\d+)?)\s*(k|พัน|หมื่น|แสน|ล้าน)?\s*(?:บาท)?$/.exec(rest);
    if (m?.[1]) {
      const satang = parseAmountToSatang(m[1], m[2]);
      if (satang > 0) return { kind: "edit-latest", amountSatang: satang };
    }
    return { kind: "edit-latest-usage" };
  }
  return null;
}
