import type { CategorySlice } from "@/lib/category-spend";
import type { TxDto } from "@/lib/dto";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";

const footer = (label: string, uri: string | undefined) =>
  uri?.startsWith("https://")
    ? {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0F766E",
            height: "sm",
            action: { type: "uri", label, uri },
          },
        ],
      }
    : undefined;

const header = (title: string, subtitle: string) => ({
  type: "box",
  layout: "vertical",
  backgroundColor: "#CCFBF1",
  paddingAll: "16px",
  contents: [
    { type: "text", text: title, weight: "bold", size: "lg", color: "#0B5D4F" },
    { type: "text", text: subtitle, size: "xs", color: "#3F6B63", margin: "xs", wrap: true },
  ],
});

/** "ใช้จ่ายตามหมวด": each category with its amount, share and a bar. */
export function buildCategorySpendCard(input: {
  subtitle: string;
  slices: CategorySlice[];
  totalSatang: number;
  moreUrl?: string;
}): LineMessage {
  const body: unknown[] = [];
  for (const s of input.slices) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: s.name, size: "sm", color: COLOR.text, flex: 4, wrap: true },
            {
              type: "text",
              text: `฿${formatBaht(s.amountSatang)} · ${s.percent}%`,
              size: "sm",
              color: COLOR.muted,
              align: "end",
              flex: 5,
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          height: "6px",
          cornerRadius: "3px",
          backgroundColor: "#E5EAEE",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: `${Math.max(2, s.percent)}%`,
              height: "6px",
              cornerRadius: "3px",
              backgroundColor: s.other ? COLOR.muted : COLOR.expense,
              contents: [],
            },
          ],
        },
      ],
    });
  }
  body.push(
    { type: "separator", margin: "lg" },
    {
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        {
          type: "text",
          text: "รายจ่ายรวม",
          size: "sm",
          weight: "bold",
          color: COLOR.text,
          flex: 3,
        },
        {
          type: "text",
          text: `฿${formatBaht(input.totalSatang)}`,
          size: "md",
          weight: "bold",
          color: COLOR.expense,
          align: "end",
          flex: 5,
        },
      ],
    },
  );
  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: header("ใช้จ่ายตามหมวด", input.subtitle),
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents: body },
  };
  const f = footer("ดูกราฟในแอป", input.moreUrl);
  if (f) bubble.footer = f;
  return {
    type: "flex",
    altText: `ใช้จ่ายตามหมวด ${input.subtitle}: รวม ฿${formatBaht(input.totalSatang)}`,
    contents: bubble,
  };
}

/** "รายการล่าสุด": the newest entries, one line each. */
export function buildRecentCard(input: { items: TxDto[]; moreUrl?: string }): LineMessage {
  const body: unknown[] = [];
  input.items.forEach((tx, i) => {
    const income = tx.type === "income";
    body.push({
      type: "box",
      layout: "horizontal",
      margin: i === 0 ? "none" : "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          contents: [
            { type: "text", text: tx.title, size: "sm", color: COLOR.text, wrap: true },
            {
              type: "text",
              text: `${tx.categoryName ?? "ไม่ระบุหมวด"} · ${formatThaiDate(new Date(tx.occurredAt), true)}`,
              size: "xxs",
              color: COLOR.muted,
              wrap: true,
            },
          ],
        },
        {
          type: "text",
          text: `${income ? "+" : "-"}฿${formatBaht(tx.amountSatang)}`,
          size: "sm",
          weight: "bold",
          color: income ? COLOR.income : COLOR.expense,
          align: "end",
          flex: 3,
        },
      ],
    });
  });
  body.push({
    type: "text",
    text: "ลบล่าสุด · แก้ล่าสุด 45",
    size: "xs",
    color: COLOR.muted,
    margin: "lg",
  });
  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: header("รายการล่าสุด", `${input.items.length} รายการล่าสุดที่จดไว้`),
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents: body },
  };
  const f = footer("ดูทั้งหมดในแอป", input.moreUrl);
  if (f) bubble.footer = f;
  return {
    type: "flex",
    altText: `รายการล่าสุด ${input.items.length} รายการ`,
    contents: bubble,
  };
}
