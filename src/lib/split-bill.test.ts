import { describe, expect, it } from "vitest";
import { parseGroupCommand } from "./group";
import { billShares, parseBillCommand, totalOwed, unpaid } from "./split-bill";

describe("parseBillCommand", () => {
  it("title then amount", () => {
    expect(parseBillCommand("หารบิล หมูกระทะ 1200")).toEqual({
      kind: "bill-new",
      title: "หมูกระทะ",
      amountSatang: 120_000,
      names: [],
    });
  });

  it("names after the amount (spaces or commas), commas in the amount, satang", () => {
    expect(parseBillCommand("หารบิล ข้าวเย็น 1,250.50 แอน, บ๊อบ ชมพู")).toEqual({
      kind: "bill-new",
      title: "ข้าวเย็น",
      amountSatang: 125_050,
      names: ["แอน", "บ๊อบ", "ชมพู"],
    });
  });

  it("the amount first: the rest is the name, or just 'บิล'", () => {
    expect(parseBillCommand("หารบิล 450 ชาบู")).toMatchObject({
      title: "ชาบู",
      amountSatang: 45_000,
      names: [],
    });
    expect(parseBillCommand("หารบิล 450")).toMatchObject({ title: "บิล", amountSatang: 45_000 });
  });

  it("Thai digits work", () => {
    expect(parseBillCommand("หารบิล ชาบู ๖๐๐")).toMatchObject({ amountSatang: 60_000 });
  });

  it("explains instead of guessing when something is missing or silly", () => {
    for (const text of [
      "หารบิล",
      "หารบิล หมูกระทะ",
      "หารบิล หมูกระทะ 0",
      "หารบิล หมูกระทะ 99999999",
    ]) {
      expect(parseBillCommand(text)?.kind, text).toBe("bill-usage");
    }
    expect(parseBillCommand("หารบิล " + "ก".repeat(41) + " 100")?.kind).toBe("bill-usage");
  });

  it("the other words", () => {
    expect(parseBillCommand("ตามเงิน")).toEqual({ kind: "bill-chase" });
    expect(parseBillCommand("บิลค้าง")).toEqual({ kind: "bill-open" });
    expect(parseBillCommand("ปิดรายชื่อ")).toEqual({ kind: "bill-close" });
    expect(parseBillCommand("ยกเลิกบิล")).toEqual({ kind: "bill-cancel" });
    expect(parseBillCommand("ได้รับแล้ว แอน")).toEqual({ kind: "bill-paid", names: ["แอน"] });
    expect(parseBillCommand("ได้รับ แอน บ๊อบ")).toEqual({
      kind: "bill-paid",
      names: ["แอน", "บ๊อบ"],
    });
  });

  it("ordinary chat is not a command", () => {
    for (const text of [
      "หารกันเถอะ",
      "บิลมาแล้ว",
      "ตามเงินหน่อย",
      "ได้รับแล้วนะ",
      "กินข้าว 100 ไหม",
      "บิล",
    ]) {
      expect(parseBillCommand(text), text).toBeNull();
    }
  });

  it("is part of what a group understands, and does not steal the record or trip commands", () => {
    expect(parseGroupCommand("หารบิล หมูกระทะ 1200")?.kind).toBe("bill-new");
    expect(parseGroupCommand("ตามเงิน")?.kind).toBe("bill-chase");
    expect(parseGroupCommand("จด ข้าวเที่ยง 350")?.kind).toBe("record");
    expect(parseGroupCommand("เริ่มทริป เชียงใหม่")?.kind).toBe("trip-start");
  });
});

describe("billShares", () => {
  const total = (list: { shareSatang: number }[]) => list.reduce((s, x) => s + x.shareSatang, 0);

  it("equal shares that add up exactly, whatever the amount and the number of people", () => {
    for (const amount of [100, 101, 9999, 120_000, 1_234_567]) {
      for (let n = 2; n <= 9; n++) {
        const people = Array.from({ length: n }, (_, i) => `U${i}`);
        const shares = billShares(amount, people, "U0");
        expect(total(shares), `${amount}/${n}`).toBe(amount);
        const values = shares.map((s) => s.shareSatang);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("the payer is always in, takes the odd satang first, and counts as paid", () => {
    const shares = billShares(10_000, ["Ubob", "Uchom"], "Uanna");
    expect(shares.map((s) => s.lineUserId)).toEqual(["Uanna", "Ubob", "Uchom"]);
    expect(shares.map((s) => s.shareSatang)).toEqual([3334, 3333, 3333]);
    expect(shares.filter((s) => s.paid).map((s) => s.lineUserId)).toEqual(["Uanna"]);
  });
});

describe("who still owes", () => {
  const m = (lineUserId: string, shareSatang: number, paid: boolean) => ({
    lineUserId,
    shareSatang,
    paid,
    qrToken: lineUserId,
  });
  it("leaves out the payer and the ones who paid", () => {
    const members = [
      m("Uanna", 300, true),
      m("Ubob", 300, false),
      m("Uchom", 300, true),
      m("Udan", 250, false),
    ];
    expect(unpaid(members, "Uanna").map((x) => x.lineUserId)).toEqual(["Ubob", "Udan"]);
    expect(totalOwed(members, "Uanna")).toBe(550);
    expect(totalOwed([m("Uanna", 300, false)], "Uanna")).toBe(0); // the payer never owes themself
  });
});
