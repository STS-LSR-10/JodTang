import type { LineMessage } from "@/lib/types";

/** The summaries offered when someone types just "สรุป" (each button sends its own command). */
export const SUMMARY_MENU_TEXT =
  "อยากดูสรุปแบบไหน? เลือกได้เลย หรือพิมพ์ช่วงเอง เช่น สรุป 20/10-30/10";

export const SUMMARY_MENU_ITEMS = [
  { label: "📅 วันนี้", text: "สรุปวันนี้" },
  { label: "🗓️ เมื่อวาน", text: "สรุปเมื่อวาน" },
  { label: "📆 สัปดาห์นี้", text: "สรุปสัปดาห์นี้" },
  { label: "📆 สัปดาห์ที่แล้ว", text: "สรุปสัปดาห์ที่แล้ว" },
  { label: "🗓️ เดือนนี้", text: "สรุปเดือนนี้" },
  { label: "🗓️ เดือนที่แล้ว", text: "สรุปเดือนที่แล้ว" },
  { label: "🏷️ ตามหมวด", text: "สรุปหมวด" },
  { label: "⚖️ เทียบเดือนก่อน", text: "เทียบเดือน" },
  { label: "📊 ปีนี้", text: "สรุปปีนี้" },
  { label: "📌 เลือกช่วงวันที่", text: "สรุปช่วง" },
] as const;

/** A question with the summaries as quick replies, and a last button that opens the summary page. */
export function buildSummaryMenu(pageUrl: string | undefined): LineMessage {
  return {
    type: "text",
    text: SUMMARY_MENU_TEXT,
    quickReply: {
      items: [
        ...SUMMARY_MENU_ITEMS.map((i) => ({
          type: "action",
          action: { type: "message", label: i.label, text: i.text },
        })),
        ...(pageUrl?.startsWith("https://")
          ? [{ type: "action", action: { type: "uri", label: "🖥️ เปิดหน้าสรุป", uri: pageUrl } }]
          : []),
      ],
    },
  };
}
