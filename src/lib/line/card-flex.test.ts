import { describe, expect, it } from "vitest";
import { cardStatus } from "@/lib/card";
import type { Wallet } from "@/lib/wallet";
import { buildCardsCard } from "./card-flex";

const wallet: Wallet = {
  id: "c1",
  name: "KTC",
  kind: "card",
  isDefault: false,
  openingSatang: 0,
  incomeSatang: 0,
  expenseSatang: 4_500_000,
  transferInSatang: 0,
  transferOutSatang: 0,
  debtInSatang: 0,
  debtOutSatang: 0,
  entryCount: 3,
  creditLimitSatang: 5_000_000,
  statementDay: 25,
  dueDay: 10,
};
const NOW = new Date("2026-10-18T05:00:00Z");

describe("buildCardsCard", () => {
  const json = JSON.stringify(
    buildCardsCard({
      cards: [{ wallet, status: cardStatus(wallet, { cycle: 120_000, previous: 80_000 }, NOW) }],
      manageUrl: "https://app.test/wallets",
    }),
  );

  it("shows what is owed, the limit left and how much of it is used", () => {
    expect(json).toContain("💳 KTC");
    expect(json).toContain("ยอดค้างชำระ");
    expect(json).toContain("฿45,000");
    expect(json).toContain("วงเงินคงเหลือ");
    expect(json).toContain("ใช้วงเงินไป 90%");
  });

  it("shows this and last statement cycle and the two dates", () => {
    expect(json).toContain("ยอดใช้รอบนี้");
    expect(json).toContain("฿1,200");
    expect(json).toContain("ยอดใช้รอบที่แล้ว");
    expect(json).toContain("ตัดรอบบิลถัดไป");
    expect(json).toContain("ครบกำหนดชำระ");
  });

  it("has the link to the wallets page", () => {
    expect(json).toContain("https://app.test/wallets");
  });
});
