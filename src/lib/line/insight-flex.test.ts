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

describe("the look of the insight card", () => {
  const card = () =>
    JSON.stringify(
      buildInsightCard({
        insight: {
          lines: ["หมวดอาหารสูงสุด ฿3,691 ซึ่งเพิ่มจาก ฿2,000", "ช้อปปิ้ง ฿2,000"],
          tip: "ลองตั้งงบแต่ละหมวด",
          source: "ai",
        } as never,
        subtitle: "1 ต.ค. – 30 ต.ค.",
        moreUrl: "https://liff.line.me/1/analytics",
      }),
    );

  it("puts each observation in its own tinted box and picks the amounts out in bold", () => {
    const out = card();
    expect(out).toContain('"type":"span","text":"฿3,691","weight":"bold"');
    expect(out).toContain('"type":"span","text":"฿2,000","weight":"bold"');
    expect(out).toContain("#EDE5FB"); // the first box is lavender
    expect(out).toContain("#FDEBDD"); // the second is peach
  });

  it("shows the tip in a warm box under its own heading, and the title with its sparkle", () => {
    const out = card();
    expect(out).toContain("💡 คำแนะนำเพื่อคุณ");
    expect(out).toContain("AI Insight ✨");
    expect(out).toContain("ดูรายละเอียดในแอป ➡️");
  });
});
