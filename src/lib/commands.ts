import { normalizeThaiDigits, parseAmountToSatang } from "@/lib/parse/thai-number";

export type Command =
  | { kind: "help" }
  | { kind: "summary"; scope: "today" | "month" }
  | { kind: "delete-latest" }
  | { kind: "edit-latest"; amountSatang: number }
  | { kind: "edit-latest-usage" }
  | { kind: "points" }
  | { kind: "my-code" }
  | { kind: "use-code"; code: string }
  | { kind: "use-code-usage" };

/** Recognize the short commands. Returns null for anything that should be parsed as a transaction. */
export function parseCommand(input: string): Command | null {
  const text = normalizeThaiDigits(input).trim().replace(/\s+/g, " ").toLowerCase();

  if (["ช่วยเหลือ", "วิธีใช้", "help", "?", "เมนู"].includes(text)) return { kind: "help" };
  if (text === "สรุปวันนี้") return { kind: "summary", scope: "today" };
  if (text === "สรุปเดือนนี้") return { kind: "summary", scope: "month" };
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
