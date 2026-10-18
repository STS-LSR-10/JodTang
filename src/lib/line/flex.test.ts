import { describe, expect, it } from "vitest";
import {
  backdatePrefix,
  BACKDATE_MAX_DAYS,
  buildBackdatePrompt,
  buildCategoryKeyboardList,
  buildDatePicker,
  buildRangeEndPicker,
  buildRangeStartPicker,
  withSummaryShortcuts,
  buildComposeCard,
  buildConfirmMessage,
  buildTypeQuestion,
} from "./flex";
import { buildCategoryChooser, buildSlipCard } from "./slip-flex";
import { buildSearchCard } from "./search-flex";

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

  it("the compose card offers expense and income category lists, then backdating", () => {
    const card = buildComposeCard();
    expect(items(card).map((i) => i.action.data)).toEqual([
      "a=cp&t=expense",
      "a=cp&t=income",
      "a=bd",
    ]);
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

describe("receipt card with product lines", () => {
  const card = (items: { name: string; amountSatang: number }[], amountSatang = 10_000) =>
    JSON.stringify(
      buildSlipCard({
        txId: base.txId,
        title: "เซเว่น",
        payeeBank: null,
        payeeAccountLast4: null,
        amountSatang,
        occurredAt: new Date("2026-10-15T08:00:00Z"),
        dateKnown: true,
        categoryName: "อาหาร",
        reference: null,
        items,
      }),
    );
  const two = [
    { name: "นมสด", amountSatang: 3000 },
    { name: "ขนมปัง", amountSatang: 7000 },
  ];

  it("lists the lines and offers to split them", () => {
    const json = card(two);
    expect(json).toContain("รายการในใบเสร็จ");
    expect(json).toContain("นมสด");
    expect(json).toContain(`"data":"a=sp&id=${base.txId}"`);
    expect(json).toContain("แยก 2 รายการ");
  });

  it("shows at most 8 lines and says how many more", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `สินค้า${i}`, amountSatang: 100 }));
    const json = card(many, 5000);
    expect(json).toContain("และอีก 3 รายการ");
    expect(json).not.toContain("สินค้า9");
  });

  it("has no split button when the lines exceed the total, and says why", () => {
    const json = card(two, 9000);
    expect(json).not.toContain("a=sp");
    expect(json).toContain("เกินยอดรวม");
  });

  it("is the old card when there are no lines", () => {
    const json = card([]);
    expect(json).not.toContain("รายการในใบเสร็จ");
    expect(json).not.toContain("a=sp");
  });
});

describe("backdating with the date picker", () => {
  type PickerItem = {
    action: {
      type: string;
      data: string;
      mode?: string;
      initial?: string;
      max?: string;
      min?: string;
      fillInText?: string;
      inputOption?: string;
    };
  };
  const items = (m: Record<string, unknown>) => (m.quickReply as { items: PickerItem[] }).items;
  const NOW = new Date("2026-10-17T08:00:00Z"); // 15:00 on 17 Oct in Bangkok

  it("the calendar is a date-only picker up to today, a year back, starting on yesterday", () => {
    const a = items(buildDatePicker(NOW))[0]!.action;
    expect(a).toMatchObject({
      type: "datetimepicker",
      data: "a=bdp",
      mode: "date",
      initial: "2026-10-16",
      max: "2026-10-17",
    });
    const days = (Date.parse(a.max!) - Date.parse(a.min!)) / 86_400_000;
    expect(days).toBe(BACKDATE_MAX_DAYS);
  });

  it("near midnight in Bangkok the dates follow Bangkok, not UTC", () => {
    // 2026-10-17 18:30 UTC is already 18 Oct 01:30 in Bangkok
    const a = items(buildDatePicker(new Date("2026-10-17T18:30:00Z")))[0]!.action;
    expect(a.max).toBe("2026-10-18");
    expect(a.initial).toBe("2026-10-17");
  });

  it("the prompt opens the keyboard with the chosen day already typed", () => {
    const a = items(buildBackdatePrompt("2026-10-12", "12 ต.ค. 2569"))[0]!.action;
    expect(a.inputOption).toBe("openKeyboard");
    expect(a.fillInText).toBe("12/10/2026 ");
  });

  it("backdatePrefix writes DD/MM/YYYY with a trailing space", () => {
    expect(backdatePrefix("2026-01-05")).toBe("05/01/2026 ");
  });
});

describe("custom range pickers", () => {
  type A = { action: Record<string, string> };
  const first = (m: Record<string, unknown>) => (m.quickReply as { items: A[] }).items[0]!.action;
  const NOW = new Date("2026-10-17T08:00:00Z");

  it("the shortcuts keep the card and add the range, category and latest buttons", () => {
    const card = { type: "flex", altText: "x", contents: { type: "bubble" } };
    const out = withSummaryShortcuts(card);
    expect(out.contents).toEqual(card.contents);
    const items = (out.quickReply as { items: A[] }).items.map((i) => i.action);
    expect(items[0]).toMatchObject({ type: "postback", data: "a=sr" });
    expect(items[1]).toMatchObject({ type: "message", text: "สรุปหมวด" });
    expect(items[2]).toMatchObject({ type: "message", text: "ล่าสุด" });
    expect(items[3]).toMatchObject({ type: "message", text: "เทียบเดือน" });
    expect(items[4]).toMatchObject({ type: "message", text: "สรุปปี" });
    expect(items[5]).toMatchObject({ type: "message", text: "พยากรณ์" });
    expect(items[6]).toMatchObject({ type: "message", text: "วิเคราะห์" });
    expect(items).toHaveLength(7);
    expect(items.every((a) => (a.label ?? "").length <= 20)).toBe(true);
  });

  it("the first-day picker reaches back about three years and stops at today", () => {
    const a = first(buildRangeStartPicker(NOW));
    expect(a).toMatchObject({
      type: "datetimepicker",
      data: "a=sr1",
      mode: "date",
      max: "2026-10-17",
    });
    expect(a.min! < a.initial!).toBe(true);
    expect(a.initial! <= a.max!).toBe(true);
  });

  it("the last-day picker starts at the first day, keeps it in data, and stops at today", () => {
    const a = first(buildRangeEndPicker("2026-10-01", "1 ต.ค. 2569", NOW));
    expect(a).toMatchObject({
      data: "a=sr2&f=2026-10-01",
      min: "2026-10-01",
      max: "2026-10-17",
      initial: "2026-10-17",
    });
  });
});

describe("search result card", () => {
  const item = (title: string, amountSatang: number, type: "expense" | "income" = "expense") => ({
    id: title,
    type,
    title,
    amountSatang,
    occurredAt: "2026-10-10T05:00:00Z",
    source: "text",
    categoryId: null,
    categoryName: null,
    categoryIcon: null,
    categoryColor: null,
    hasPhoto: false,
    hasSlip: false,
    note: null,
    tags: [],
    accountId: null,
    origCurrency: null,
    origAmountMinor: null,
    fxRate: null,
    accountName: null,
  });
  const totals = { incomeSatang: 10_000, expenseSatang: 10_550, count: 3 };

  it("shows the term, the totals, the newest matches and the link", () => {
    const json = JSON.stringify(
      buildSearchCard({
        term: "กาแฟ",
        totals,
        items: [item("กาแฟเย็น", 6000), item("ขายกาแฟ", 10_000, "income")],
        moreUrl: "https://liff.line.me/123/transactions?q=%E0%B8%81",
      }),
    );
    expect(json).toContain("ผลการค้นหา");
    expect(json).toContain("กาแฟ");
    expect(json).toContain("+฿100");
    expect(json).toContain("-฿105.50");
    expect(json).toContain("พบ 3 รายการ");
    expect(json).toContain("10 ต.ค. กาแฟเย็น");
    expect(json).toContain("และอีก 1 รายการ");
    expect(json).toContain("ดูทั้งหมดในแอป");
  });

  it("has no button without an https link, and shows at most five matches", () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`รายการ${i}`, 100));
    const json = JSON.stringify(
      buildSearchCard({
        term: "x",
        totals: { incomeSatang: 0, expenseSatang: 900, count: 9 },
        items: many,
        moreUrl: "http://localhost/x",
      }),
    );
    expect(json).not.toContain("ดูทั้งหมดในแอป");
    expect(json).toContain("รายการ4");
    expect(json).not.toContain("รายการ5");
    expect(json).toContain("และอีก 4 รายการ");
  });
});

describe("emoji in front of a category's name", () => {
  type Btn = { action: { label: string; fillInText?: string; data?: string } };
  const labels = (m: Record<string, unknown>) =>
    (m.quickReply as { items: Btn[] }).items.map((i) => i.action);

  it("the category buttons of จดตังค์ show it, but the text put in the box is the plain name", () => {
    const m = buildCategoryKeyboardList("expense", [
      { name: "ค่าอาหารแมว", icon: "🐱", type: "expense", sort_order: 1, is_hidden: false },
      { name: "อาหาร", icon: "utensils", type: "expense", sort_order: 2, is_hidden: false },
    ]);
    expect(labels(m).map((a) => a.label)).toEqual(["🐱 ค่าอาหารแมว", "อาหาร"]);
    expect(labels(m).map((a) => a.fillInText)).toEqual(["ค่าอาหารแมว ", "อาหาร "]);
  });

  it("a long name with an emoji still fits the 20-character label", () => {
    const m = buildCategoryKeyboardList("expense", [
      { name: "ก".repeat(30), icon: "🐱", type: "expense", sort_order: 1, is_hidden: false },
    ]);
    expect(labels(m)[0]!.label).toHaveLength(20);
  });

  it("the category list of a checked slip shows it", () => {
    const m = buildCategoryChooser("t1", [
      { id: "c1", name: "ค่าอาหารแมว", icon: "🐱" },
      { id: "c2", name: "อาหาร", icon: "utensils" },
    ]);
    expect(labels(m).map((a) => a.label)).toEqual(["🐱 ค่าอาหารแมว", "อาหาร"]);
    expect(labels(m)[0]!.data).toBe("a=sk&id=t1&c=c1");
  });

  it("the entry-saved card carries the label it is given", () => {
    const json = JSON.stringify(
      buildConfirmMessage({ ...base, style: "full", categoryName: "🐱 ค่าอาหารแมว" }),
    );
    expect(json).toContain("🐱 ค่าอาหารแมว");
  });
});
