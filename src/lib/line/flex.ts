import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import type { ConfirmStyle, LineMessage, TxType } from "@/lib/types";

// Design tokens (see docs/design-tokens.md)
export const COLOR = {
  primary: "#0F766E",
  primarySoft: "#CCFBF1",
  expense: "#E11D48",
  income: "#059669",
  text: "#0F172A",
  muted: "#64748B",
  surface: "#FFFFFF",
} as const;

export interface ConfirmCardInput {
  style: Exclude<ConfirmStyle, "off">;
  txId: string;
  type: TxType;
  title: string;
  categoryName: string | null;
  amountSatang: number;
  occurredAt: Date;
  /** Total of this category in the current budget cycle, including this entry. */
  cycleTotalSatang: number | null;
}

const TYPE_LABEL: Record<TxType, string> = { expense: "รายจ่าย", income: "รายรับ" };

export function row(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: COLOR.muted, flex: 2 },
      {
        type: "text",
        text: value,
        size: "sm",
        color: COLOR.text,
        flex: 5,
        wrap: true,
        align: "end",
      },
    ],
  };
}

export function shareText(input: ConfirmCardInput): string {
  const sign = input.type === "income" ? "+" : "-";
  return `${input.title} ${sign}฿${formatBaht(input.amountSatang)} (${formatThaiDate(input.occurredAt)}) · จดด้วยจดตังค์`;
}

export function buildConfirmMessage(input: ConfirmCardInput): LineMessage {
  const amountText = `฿${formatBaht(input.amountSatang)}`;
  const category = input.categoryName ?? "ไม่ระบุหมวด";

  if (input.style === "short") {
    return {
      type: "text",
      text: `จดแล้ว: ${input.title} ${amountText} · ${category}`,
    };
  }

  const amountColor = input.type === "income" ? COLOR.income : COLOR.expense;
  const body: unknown[] = [
    { type: "text", text: input.title, weight: "bold", size: "lg", wrap: true, color: COLOR.text },
    { type: "text", text: amountText, weight: "bold", size: "xxl", color: amountColor },
    row("ประเภท", TYPE_LABEL[input.type]),
    row("หมวด", category),
    row("วันเวลา", formatThaiDate(input.occurredAt, true)),
  ];
  if (input.cycleTotalSatang !== null) {
    body.push(
      { type: "separator", margin: "md" },
      {
        type: "text",
        text: `หมวดนี้ในรอบนี้รวม ฿${formatBaht(input.cycleTotalSatang)}`,
        size: "xs",
        color: COLOR.muted,
        wrap: true,
        margin: "md",
      },
    );
  }

  return {
    type: "flex",
    altText: `จดแล้ว: ${input.title} ${amountText}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.primarySoft,
        paddingAll: "14px",
        contents: [{ type: "text", text: "จดแล้ว", weight: "bold", color: COLOR.primary }],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.surface,
        paddingAll: "16px",
        spacing: "sm",
        contents: body,
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.surface,
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: COLOR.primary,
            height: "sm",
            action: {
              type: "postback",
              label: "แก้ไข",
              data: `a=edit&id=${input.txId}`,
              displayText: "แก้ไข",
            },
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              {
                type: "button",
                style: "secondary",
                height: "sm",
                action: {
                  type: "postback",
                  label: "ลบ",
                  data: `a=del&id=${input.txId}`,
                  displayText: "ลบรายการ",
                },
              },
              {
                type: "button",
                style: "link",
                height: "sm",
                action: {
                  type: "uri",
                  label: "ส่งต่อ",
                  uri: `https://line.me/R/share?text=${encodeURIComponent(shareText(input))}`,
                },
              },
            ],
          },
        ],
      },
    },
  };
}

/** Ask whether an ambiguous entry is income or expense (Quick Reply). */
export function buildTypeQuestion(input: {
  txId: string;
  title: string;
  amountSatang: number;
}): LineMessage {
  const action = (label: string, t: string) => ({
    type: "action",
    action: {
      type: "postback",
      label,
      data: `a=pt&id=${input.txId}&t=${t}`,
      displayText: label,
    },
  });
  return {
    type: "text",
    text: `${input.title} ฿${formatBaht(input.amountSatang)} เป็นรายรับหรือรายจ่ายนะ?`,
    quickReply: {
      items: [action("รายจ่าย", "expense"), action("รายรับ", "income"), action("ยกเลิก", "cancel")],
    },
  };
}

/**
 * Card shown when the Rich Menu "จดตังค์" tile is tapped: how to type an entry, plus a button that
 * opens the keyboard (no text is prefilled, so nothing can be sent by accident).
 */
export function buildComposeCard(): LineMessage {
  const bullet = (t: string) => ({
    type: "box",
    layout: "baseline",
    spacing: "md",
    contents: [
      { type: "text", text: "●", size: "xxs", color: "#1ABC9C", flex: 0 },
      { type: "text", text: t, size: "lg", weight: "bold", color: "#334155", flex: 1 },
    ],
  });
  return {
    type: "flex",
    altText: "พิมพ์บอกจดตังค์ได้เลย เช่น ข้าวมันไก่ 50 · เงินเดือน 20000",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        paddingAll: "20px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            alignItems: "center",
            contents: [
              {
                type: "box",
                layout: "vertical",
                width: "44px",
                height: "44px",
                cornerRadius: "22px",
                backgroundColor: COLOR.primarySoft,
                justifyContent: "center",
                alignItems: "center",
                flex: 0,
                contents: [{ type: "text", text: "✒️", size: "lg", align: "center" }],
              },
              {
                type: "text",
                text: "พิมพ์บอกจดตังค์ได้เลย เช่น",
                weight: "bold",
                size: "md",
                color: "#334155",
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "md",
            backgroundColor: "#F6F9F8",
            cornerRadius: "14px",
            paddingAll: "16px",
            contents: [bullet("ข้าวมันไก่ 50"), bullet("เงินเดือน 20000")],
          },
          {
            type: "text",
            text: "ระบบจะช่วยจดและแยกหมวดหมู่อัตโนมัติทันทีครับ ✨",
            size: "sm",
            color: COLOR.primary,
            wrap: true,
          },
          {
            type: "button",
            style: "primary",
            color: "#1ABC9C",
            height: "md",
            action: {
              type: "postback",
              label: "จดเลย",
              data: "a=compose-go",
              inputOption: "openKeyboard",
            },
          },
        ],
      },
    },
  };
}
