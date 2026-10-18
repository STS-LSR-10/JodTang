import type { GroupSummary } from "@/lib/group";
import { formatBaht } from "@/lib/money";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";

const baht = (satang: number) => `฿${formatBaht(satang)}`;

/** "สรุป": the group's total and what each member paid, with a bar of their share. */
export function buildGroupSummaryCard(input: {
  title: string;
  subtitle: string;
  summary: GroupSummary;
}): LineMessage {
  const { summary } = input;
  const rows = summary.payers.slice(0, 10).flatMap((p, i) => [
    {
      type: "box",
      layout: "horizontal",
      margin: i === 0 ? "md" : "lg",
      contents: [
        { type: "text", text: p.name, size: "sm", color: COLOR.text, wrap: true, flex: 5 },
        {
          type: "text",
          text: `${baht(p.totalSatang)} · ${p.percent}%`,
          size: "sm",
          weight: "bold",
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
      margin: "sm",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: `${Math.min(100, Math.max(p.percent > 0 ? 3 : 0, p.percent))}%`,
          height: "6px",
          cornerRadius: "3px",
          backgroundColor: COLOR.primary,
          contents: [],
        },
      ],
    },
  ]);
  return {
    type: "flex",
    altText: `${input.title}: รวม ${baht(summary.totalSatang)} (${summary.count} รายการ)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.primarySoft,
        paddingAll: "16px",
        contents: [
          { type: "text", text: input.title, weight: "bold", size: "lg", color: "#0B5D4F" },
          { type: "text", text: input.subtitle, size: "xs", color: "#3F6B63", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "รวมทั้งกลุ่ม", weight: "bold", size: "md", flex: 5 },
              {
                type: "text",
                text: baht(summary.totalSatang),
                weight: "bold",
                size: "md",
                color: COLOR.expense,
                align: "end",
                flex: 5,
              },
            ],
          },
          { type: "text", text: `${summary.count} รายการ`, size: "xs", color: COLOR.muted },
          { type: "separator", margin: "lg" },
          { type: "text", text: "ใครจ่ายไปเท่าไร", size: "xs", color: COLOR.muted, margin: "lg" },
          ...rows,
        ],
      },
    },
  };
}
