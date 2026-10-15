import { describe, expect, it } from "vitest";
import { buildConfirmMessage, buildTypeQuestion } from "./flex";

const base = {
  txId: "11111111-1111-1111-1111-111111111111",
  type: "expense" as const,
  title: "กาแฟ",
  categoryName: "อาหาร",
  amountSatang: 3000,
  occurredAt: new Date("2026-10-15T08:00:00Z"),
  cycleTotalSatang: 125_000,
};

describe("flex", () => {
  it("builds a full card with brand colors and three actions", () => {
    const msg = buildConfirmMessage({ ...base, style: "full" });
    expect(msg.type).toBe("flex");
    const json = JSON.stringify(msg);
    expect(json).toContain("#CCFBF1"); // primary-soft header
    expect(json).toContain("#0F766E"); // primary button
    expect(json).toContain("a=del&id=" + base.txId);
    expect(json).toContain("a=edit&id=" + base.txId);
    expect(json).toContain("line.me/R/share");
    expect(json).toContain("฿30");
    expect(json).toContain("฿1,250");
    expect(msg.altText).toBeTypeOf("string");
  });

  it("omits the cycle total when unknown", () => {
    const json = JSON.stringify(
      buildConfirmMessage({ ...base, style: "full", cycleTotalSatang: null }),
    );
    expect(json).not.toContain("รอบนี้รวม");
  });

  it("short style is a plain text message", () => {
    const msg = buildConfirmMessage({ ...base, style: "short" });
    expect(msg).toEqual({ type: "text", text: "จดแล้ว: กาแฟ ฿30 · อาหาร" });
  });

  it("type question has three quick replies with postback data under the 300 char limit", () => {
    const msg = buildTypeQuestion({ txId: base.txId, title: "ของขวัญ", amountSatang: 50_000 });
    const items = (msg.quickReply as { items: { action: { data: string; label: string } }[] })
      .items;
    expect(items.map((i) => i.action.label)).toEqual(["รายจ่าย", "รายรับ", "ยกเลิก"]);
    for (const i of items) expect(i.action.data.length).toBeLessThan(300);
  });
});
