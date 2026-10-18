import { describe, expect, it } from "vitest";
import {
  buildCategoryKeyboardList,
  buildComposeCard,
  buildConfirmMessage,
  buildTypeQuestion,
} from "./flex";
import { buildCategoryChooser, buildSlipCard } from "./slip-flex";

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
    expect(json).toContain("จดสำเร็จ");
    expect(json).toContain("อย่าลืมตรวจสอบรายการที่จดด้วยนะ");
    expect(json).toContain("a=del&id=" + base.txId);
    expect(json).toContain("a=edit&id=" + base.txId);
    expect(json).toContain("line.me/R/share");
    expect(json).toContain("฿30");
    expect(json).toContain("฿1,250");
    expect(msg.altText).toBeTypeOf("string");
  });

  it("income card is green with a plus sign and its own message", () => {
    const json = JSON.stringify(
      buildConfirmMessage({
        ...base,
        style: "full",
        type: "income",
        title: "เงินเดือนเข้า",
        categoryName: "เงินเดือน",
        amountSatang: 3_500_000,
        cycleTotalSatang: 3_500_000,
        cycleLabel: "รายเดือน (วันที่ 1)",
      }),
    );
    expect(json).toContain("รายรับ");
    expect(json).toContain("+฿35,000");
    expect(json).toContain("เย้! มีเงินเข้ากระเป๋าเพิ่มแล้วนะ");
    expect(json).toContain("รอบงบ: รายเดือน (วันที่ 1)");
    expect(json).toContain('"width":"100%"'); // the only entry fills the bar
  });

  it("adds the logo only when a URL is given", () => {
    const withLogo = JSON.stringify(
      buildConfirmMessage({ ...base, style: "full", logoUrl: "https://example.com/logo.png" }),
    );
    expect(withLogo).toContain("https://example.com/logo.png");
    expect(JSON.stringify(buildConfirmMessage({ ...base, style: "full" }))).not.toContain(
      '"type":"image"',
    );
  });

  it("shows #tags on the full and short cards, and nothing when there are none", () => {
    const tagged = { ...base, tags: ["ปาร์ตี้", "trip"] };
    expect(JSON.stringify(buildConfirmMessage({ ...tagged, style: "full" }))).toContain(
      "#ปาร์ตี้ #trip",
    );
    expect(buildConfirmMessage({ ...tagged, style: "short" })).toMatchObject({
      type: "text",
      text: "จดแล้ว: กาแฟ ฿30 · อาหาร #ปาร์ตี้ #trip",
    });
    expect(JSON.stringify(buildConfirmMessage({ ...base, style: "full" }))).not.toContain(
      '"text":"#',
    );
  });

  it("omits the cycle total when unknown", () => {
    const json = JSON.stringify(
      buildConfirmMessage({ ...base, style: "full", cycleTotalSatang: null }),
    );
    expect(json).not.toContain("รอบนี้รวม");
  });

  it("short style is a plain text message", () => {
    const msg = buildConfirmMessage({ ...base, style: "short" });
    expect(msg).toMatchObject({ type: "text", text: "จดแล้ว: กาแฟ ฿30 · อาหาร" });
  });

  it("slip card has confirm / edit / cancel and flags an unknown date", () => {
    const msg = buildSlipCard({
      txId: base.txId,
      title: "ร้านกาแฟ",
      payeeBank: "กสิกรไทย",
      payeeAccountLast4: "1234",
      amountSatang: 4500,
      occurredAt: base.occurredAt,
      dateKnown: false,
      categoryName: "อาหาร",
      reference: "20261014ABC123",
    });
    const json = JSON.stringify(msg);
    expect(json).toContain(`a=sc&id=${base.txId}`);
    expect(json).toContain(`a=se&id=${base.txId}`);
    expect(json).toContain(`a=sx&id=${base.txId}`);
    expect(json).toContain("••1234");
    expect(json).toContain("อ่านวันที่จากสลิปไม่ได้");
    // no long digit runs (account numbers) anywhere in the card, ignoring the transaction id
    expect(json.replaceAll(base.txId, "")).not.toMatch(/\d{9,}/);
  });

  it("category chooser respects LINE's limits", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      name: "หมวดที่มีชื่อยาวมากเกินกว่ายี่สิบตัวอักษรแน่นอน",
    }));
    const msg = buildCategoryChooser(base.txId, many);
    const items = (msg.quickReply as { items: { action: { label: string; data: string } }[] })
      .items;
    expect(items).toHaveLength(13);
    for (const i of items) {
      expect(i.action.label.length).toBeLessThanOrEqual(20);
      expect(i.action.data.length).toBeLessThan(300);
    }
  });

  it("type question has three quick replies with postback data under the 300 char limit", () => {
    const msg = buildTypeQuestion({ txId: base.txId, title: "ของขวัญ", amountSatang: 50_000 });
    const items = (msg.quickReply as { items: { action: { data: string; label: string } }[] })
      .items;
    expect(items.map((i) => i.action.label)).toEqual(["รายจ่าย", "รายรับ", "ยกเลิก"]);
    for (const i of items) expect(i.action.data.length).toBeLessThan(300);
  });
});

describe("compose card", () => {
  it("shows the two examples and a button that opens the keyboard without prefilled text", () => {
    const msg = buildComposeCard();
    const json = JSON.stringify(msg);
    expect(msg.type).toBe("flex");
    expect(json).toContain("ข้าวมันไก่ 50");
    expect(json).toContain("เงินเดือน 20000");
    expect(json).toContain("ระบบจะช่วยจดและแยกหมวดหมู่อัตโนมัติทันทีครับ");
    expect(json).toContain('"inputOption":"openKeyboard"');
    expect(json).not.toContain("fillInText");
    expect(msg.altText).toBeTypeOf("string");
  });
});

describe("the แนบรูป button", () => {
  it("is on the full card as a postback for that entry", () => {
    const json = JSON.stringify(buildConfirmMessage({ ...base, style: "full" }));
    expect(json).toContain(`"data":"a=ph&id=${base.txId}"`);
  });

  it("is a quick reply under the short card", () => {
    const msg = buildConfirmMessage({ ...base, style: "short" }) as unknown as {
      quickReply: { items: { action: { data: string } }[] };
    };
    expect(msg.quickReply.items[0]?.action.data).toBe(`a=ph&id=${base.txId}`);
  });
});

describe("compose quick replies", () => {
  type Item = {
    action: { label: string; data: string; fillInText?: string; inputOption?: string };
  };
  const items = (m: Record<string, unknown>) => (m.quickReply as { items: Item[] }).items;
  const cat = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    type: "expense" as const,
    sort_order: 0,
    is_hidden: false,
    ...over,
  });

  it("the compose card offers expense and income category lists", () => {
    const card = buildComposeCard();
    expect(items(card).map((i) => i.action.data)).toEqual(["a=cp&t=expense", "a=cp&t=income"]);
  });

  it("each category button opens the keyboard with its name already typed", () => {
    const m = buildCategoryKeyboardList("expense", [
      cat("อาหาร"),
      cat("เดินทาง", { sort_order: 1 }),
    ]);
    expect(items(m).map((i) => i.action.fillInText)).toEqual(["อาหาร ", "เดินทาง "]);
    expect(items(m).every((i) => i.action.inputOption === "openKeyboard")).toBe(true);
  });

  it("lists only the chosen type, skips hidden and the shared อื่นๆ, and follows sort order", () => {
    const m = buildCategoryKeyboardList("income", [
      cat("ขายของ", { type: "income", sort_order: 5 }),
      cat("เงินเดือน", { type: "income", sort_order: 1 }),
      cat("งานพิเศษ", { type: "income", sort_order: 3, is_hidden: true }),
      cat("อื่นๆ", { type: "income", sort_order: 99 }),
      cat("อาหาร"),
    ]);
    expect(items(m).map((i) => i.action.label)).toEqual(["เงินเดือน", "ขายของ"]);
  });

  it("never offers more than 13 buttons (LINE limit) and cuts long labels to 20", () => {
    const many = Array.from({ length: 20 }, (_, i) => cat(`หมวด${i}`, { sort_order: i }));
    expect(items(buildCategoryKeyboardList("expense", many))).toHaveLength(13);
    const long = buildCategoryKeyboardList("expense", [cat("ก".repeat(40))]);
    expect(items(long)[0]?.action.label).toHaveLength(20);
  });

  it("falls back to a plain message when there is nothing to pick", () => {
    const m = buildCategoryKeyboardList("expense", []);
    expect(m.type).toBe("text");
    expect(m.quickReply).toBeUndefined();
  });
});
