import { describe, expect, it } from "vitest";
import { summarizePayers } from "@/lib/group";
import { buildGroupSummaryCard } from "./group-flex";

describe("buildGroupSummaryCard", () => {
  const summary = summarizePayers(
    [
      { lineUserId: "Ubob", totalSatang: 120_050, entries: 2 },
      { lineUserId: "Uanna", totalSatang: 35_000, entries: 1 },
    ],
    new Map([
      ["Ubob", "บ๊อบ"],
      ["Uanna", "แอน"],
    ]),
  );
  const json = JSON.stringify(
    buildGroupSummaryCard({ title: "สมุดกลุ่ม · เดือนนี้", subtitle: "18 ต.ค. 69", summary }),
  );

  it("shows the group total and how many entries", () => {
    expect(json).toContain("รวมทั้งกลุ่ม");
    expect(json).toContain("฿1,550.50");
    expect(json).toContain("3 รายการ");
  });

  it("shows who paid what with the share", () => {
    expect(json).toContain("บ๊อบ");
    expect(json).toContain("฿1,200.50 · 77%");
    expect(json).toContain("แอน");
    expect(json).toContain("฿350 · 23%");
  });
});

import { computeSettlement } from "@/lib/trip";
import { buildTripSummaryCard } from "./group-flex";

describe("buildTripSummaryCard", () => {
  const settlement = computeSettlement(
    [
      { payer: "Ua", amountSatang: 90_000, participants: ["Ua", "Ub", "Uc"] },
      { payer: "Ub", amountSatang: 20_000, participants: ["Ua", "Ub"] },
    ],
    ["Ua", "Ub", "Uc"],
  );
  const nameOf = (id: string) => ({ Ua: "แอน", Ub: "บ๊อบ", Uc: "คาร์ล" })[id] ?? "?";
  const card = (closed: boolean) =>
    JSON.stringify(
      buildTripSummaryCard({ name: "เชียงใหม่", closed, entryCount: 2, settlement, nameOf }),
    );

  it("the total, each person's paid and share, and what they get back or must pay", () => {
    const json = card(false);
    expect(json).toContain("เชียงใหม่");
    expect(json).toContain("฿1,100");
    expect(json).toContain("2 รายการ");
    expect(json).toContain("ได้คืน ฿500");
    expect(json).toContain("ต้องจ่าย ฿300");
    expect(json).toContain("จ่ายไป ฿900 · ส่วนของตัวเอง ฿400");
  });

  it("who transfers whom", () => {
    const json = card(false);
    expect(json).toContain("คาร์ล → แอน");
    expect(json).toContain("บ๊อบ → แอน");
  });

  it("open or closed in the header", () => {
    expect(card(false)).toContain("ทริปกำลังดำเนินอยู่");
    expect(card(true)).toContain("ปิดทริปแล้ว");
  });

  it("nothing to transfer says so", () => {
    const even = computeSettlement(
      [{ payer: "Ua", amountSatang: 100, participants: ["Ua"] }],
      ["Ua"],
    );
    const json = JSON.stringify(
      buildTripSummaryCard({ name: "x", closed: true, entryCount: 1, settlement: even, nameOf }),
    );
    expect(json).toContain("ไม่มีใครต้องโอนเพิ่ม");
  });
});
