import type { Insight } from "@/lib/insight";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";

/** "AI Insight": a few observations about the spending, one tip, and where they came from. */
export function buildInsightCard(input: {
  insight: Insight;
  /** e.g. "1 ต.ค. – 17 ต.ค. เทียบ 1 ก.ย. – 17 ก.ย." */
  subtitle: string;
  moreUrl?: string;
}): LineMessage {
  const { insight } = input;
  const body: unknown[] = insight.lines.map((line, i) => ({
    type: "box",
    layout: "horizontal",
    margin: i === 0 ? "none" : "md",
    spacing: "sm",
    contents: [
      { type: "text", text: "•", size: "sm", color: COLOR.primary, flex: 0 },
      { type: "text", text: line, size: "sm", color: COLOR.text, wrap: true, flex: 1 },
    ],
  }));

  if (insight.tip) {
    body.push({
      type: "box",
      layout: "horizontal",
      margin: "lg",
      spacing: "sm",
      paddingAll: "10px",
      cornerRadius: "10px",
      backgroundColor: "#F0FDFA",
      contents: [
        { type: "text", text: "💡", size: "sm", flex: 0 },
        { type: "text", text: insight.tip, size: "sm", color: "#0B5D4F", wrap: true, flex: 1 },
      ],
    });
  }
  body.push({
    type: "text",
    text:
      insight.source === "ai"
        ? "สร้างโดย AI จากตัวเลขของคุณ เป็นข้อสังเกตและคำแนะนำทั่วไป ไม่ใช่คำแนะนำทางการเงินส่วนบุคคล"
        : "สรุปจากตัวเลขของคุณ เป็นข้อสังเกตทั่วไป ไม่ใช่คำแนะนำทางการเงินส่วนบุคคล",
    size: "xxs",
    color: COLOR.muted,
    wrap: true,
    margin: "lg",
  });

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#CCFBF1",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "AI Insight", weight: "bold", size: "lg", color: "#0B5D4F" },
        {
          type: "text",
          text: input.subtitle,
          size: "xs",
          color: "#3F6B63",
          margin: "xs",
          wrap: true,
        },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents: body },
  };
  if (input.moreUrl?.startsWith("https://")) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#0F766E",
          height: "sm",
          action: { type: "uri", label: "ดูรายละเอียดในแอป", uri: input.moreUrl },
        },
      ],
    };
  }
  return {
    type: "flex",
    altText: `AI Insight: ${insight.lines[0] ?? "วิเคราะห์การใช้จ่าย"}`,
    contents: bubble,
  };
}
