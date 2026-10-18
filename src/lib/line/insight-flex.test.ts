import { describe, expect, it } from "vitest";
import type { Insight } from "@/lib/insight";
import { buildInsightCard } from "./insight-flex";

const ai: Insight = {
  lines: ["ชานมใช้ไป ฿420 (6 ครั้ง) เพิ่มขึ้น 40% จากเดือนก่อน", "หมวดอาหารเพิ่มขึ้น 40%"],
  tip: "ลองตั้งงบเฉพาะหมวดอาหารรอบหน้า",
  source: "ai",
};

describe("buildInsightCard", () => {
  it("shows the observations, the tip, the period and says where it came from", () => {
    const json = JSON.stringify(
      buildInsightCard({
        insight: ai,
        subtitle: "รอบนี้ 1 ต.ค. – 17 ต.ค. เทียบ 1 ก.ย. – 17 ก.ย.",
        moreUrl: "https://liff.line.me/1/analytics",
      }),
    );
    expect(json).toContain("AI Insight");
    expect(json).toContain("ชานมใช้ไป ฿420");
    expect(json).toContain("💡");
    expect(json).toContain("ลองตั้งงบเฉพาะหมวดอาหาร");
    expect(json).toContain("เทียบ 1 ก.ย. – 17 ก.ย.");
    expect(json).toContain("สร้างโดย AI จากตัวเลขของคุณ");
    expect(json).toContain("ไม่ใช่คำแนะนำทางการเงินส่วนบุคคล");
    expect(json).toContain("ดูรายละเอียดในแอป");
  });

  it("observations written by plain code do not claim to be from an AI", () => {
    const json = JSON.stringify(
      buildInsightCard({ insight: { ...ai, source: "rules", tip: null }, subtitle: "x" }),
    );
    expect(json).not.toContain("สร้างโดย AI");
    expect(json).toContain("สรุปจากตัวเลขของคุณ");
    expect(json).not.toContain("💡");
    expect(json).not.toContain("ดูรายละเอียดในแอป");
  });

  it("the alt text starts with the first observation", () => {
    const msg = buildInsightCard({ insight: ai, subtitle: "x" }) as unknown as { altText: string };
    expect(msg.altText).toBe("AI Insight: " + ai.lines[0]);
  });
});
