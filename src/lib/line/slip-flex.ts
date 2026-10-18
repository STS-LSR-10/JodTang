import { categoryLabel } from "@/lib/category-emoji";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import type { LineMessage } from "@/lib/types";
import type { ReceiptItem } from "@/lib/ocr/slip-schema";
import { planReceiptSplit } from "@/lib/receipt-split";
import { COLOR, row } from "./flex";
import { PICK_CATEGORY_TEXT } from "./messages";

export interface SlipCardInput {
  txId: string;
  title: string;
  payeeBank: string | null;
  payeeAccountLast4: string | null;
  amountSatang: number;
  occurredAt: Date;
  /** false when the slip had no readable date and "now" was used. */
  dateKnown: boolean;
  categoryName: string | null;
  reference: string | null;
  /** Receipt product lines (Ultimate only; empty for everyone else). */
  items?: ReceiptItem[];
}

const MAX_SHOWN_ITEMS = 8;

/** Review card for a slip that still needs the user's confirmation (confirm / edit / cancel). */
export function buildSlipCard(input: SlipCardInput): LineMessage {
  const amountText = `฿${formatBaht(input.amountSatang)}`;
  const bank = [input.payeeBank, input.payeeAccountLast4 ? `••${input.payeeAccountLast4}` : null]
    .filter(Boolean)
    .join(" ");

  const body: unknown[] = [
    { type: "text", text: input.title, weight: "bold", size: "lg", wrap: true, color: COLOR.text },
    { type: "text", text: amountText, weight: "bold", size: "xxl", color: COLOR.expense },
  ];
  if (bank) body.push(row("ธนาคาร", bank));
  body.push(
    row("หมวด (เดา)", input.categoryName ?? "ไม่ระบุหมวด"),
    row(
      input.dateKnown ? "วันเวลา" : "วันเวลา*",
      formatThaiDate(input.occurredAt, input.dateKnown),
    ),
  );
  if (input.reference) body.push(row("อ้างอิง", input.reference.slice(-10)));
  if (!input.dateKnown) {
    body.push({
      type: "text",
      text: "* อ่านวันที่จากสลิปไม่ได้ ใช้วันนี้แทน",
      size: "xs",
      color: COLOR.muted,
      wrap: true,
    });
  }

  const items = input.items ?? [];
  const split = planReceiptSplit(input.amountSatang, items);
  if (items.length > 0) {
    body.push({ type: "separator", margin: "md" });
    body.push({
      type: "text",
      text: "รายการในใบเสร็จ",
      size: "sm",
      weight: "bold",
      color: COLOR.text,
    });
    for (const item of items.slice(0, MAX_SHOWN_ITEMS)) {
      body.push(row(item.name, `฿${formatBaht(item.amountSatang)}`));
    }
    if (items.length > MAX_SHOWN_ITEMS) {
      body.push({
        type: "text",
        text: `และอีก ${items.length - MAX_SHOWN_ITEMS} รายการ`,
        size: "xs",
        color: COLOR.muted,
      });
    }
    if (!split.ok && split.reason === "over_total") {
      body.push({
        type: "text",
        text: "ยอดรายการรวมเกินยอดรวมของใบ (อาจมีส่วนลดท้ายบิล) จดเป็นยอดรวมใบเดียวนะ",
        size: "xs",
        color: COLOR.muted,
        wrap: true,
      });
    }
  }

  const button = (
    label: string,
    action: string,
    style: "primary" | "secondary" | "link",
    color?: string,
  ) => ({
    type: "button",
    style,
    height: "sm",
    ...(color ? { color } : {}),
    action: {
      type: "postback",
      label,
      data: `a=${action}&id=${input.txId}`,
      displayText: label,
    },
  });

  return {
    type: "flex",
    altText: `ตรวจสลิป: ${input.title} ${amountText}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.primarySoft,
        paddingAll: "14px",
        contents: [
          { type: "text", text: "ตรวจสลิป — ยังไม่ได้จด", weight: "bold", color: COLOR.primary },
        ],
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
          button("ยืนยัน", "sc", "primary", COLOR.primary),
          ...(split.ok ? [button(`แยก ${items.length} รายการ`, "sp", "secondary")] : []),
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [button("แก้ไขหมวด", "se", "secondary"), button("ยกเลิก", "sx", "link")],
          },
        ],
      },
    },
  };
}

export interface CategoryChoice {
  id: string;
  name: string;
  icon?: string | null;
}

const MAX_QUICK_REPLIES = 13; // LINE limit
const MAX_LABEL = 20; // LINE limit

/** Quick Reply list for picking the right category of a pending slip. */
export function buildCategoryChooser(txId: string, categories: CategoryChoice[]): LineMessage {
  return {
    type: "text",
    text: PICK_CATEGORY_TEXT,
    quickReply: {
      items: categories.slice(0, MAX_QUICK_REPLIES).map((c) => ({
        type: "action",
        action: {
          type: "postback",
          label: categoryLabel(c.name, c.icon).slice(0, MAX_LABEL),
          data: `a=sk&id=${txId}&c=${c.id}`,
          displayText: c.name.slice(0, MAX_LABEL),
        },
      })),
    },
  };
}
