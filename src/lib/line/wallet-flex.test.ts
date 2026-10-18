import { describe, expect, it } from "vitest";
import type { Wallet } from "@/lib/wallet";
import { buildWalletChooser, buildWalletsCard } from "./wallet-flex";

const w = (over: Partial<Wallet>): Wallet => ({
  id: "w1",
  name: "เงินสด",
  kind: "cash",
  isDefault: true,
  openingSatang: 100000,
  incomeSatang: 0,
  expenseSatang: 0,
  transferInSatang: 0,
  transferOutSatang: 0,
  entryCount: 0,
  ...over,
});

describe("buildWalletsCard", () => {
  it("lists each wallet and the total", () => {
    const json = JSON.stringify(
      buildWalletsCard({
        wallets: [
          w({}),
          w({ id: "w2", name: "KTC", kind: "card", isDefault: false, openingSatang: -350000 }),
        ],
        canAdd: true,
      }),
    );
    expect(json).toContain("💵 เงินสด");
    expect(json).toContain("💳 KTC");
    expect(json).toContain("-฿3,500");
    expect(json).toContain("รวมทุกกระเป๋า");
    expect(json).toContain("-฿2,500");
  });

  it("a single wallet has no total row and no main marker", () => {
    const json = JSON.stringify(buildWalletsCard({ wallets: [w({})], canAdd: false }));
    expect(json).not.toContain("รวมทุกกระเป๋า");
    expect(json).not.toContain("(หลัก)");
    expect(json).toContain("อัปเกรด");
  });

  it("the manage button only appears for an https address", () => {
    const wallets = [w({})];
    expect(
      JSON.stringify(buildWalletsCard({ wallets, canAdd: true, manageUrl: "http://x" })),
    ).not.toContain("จัดการกระเป๋า");
    expect(
      JSON.stringify(
        buildWalletsCard({ wallets, canAdd: true, manageUrl: "https://x.test/wallets" }),
      ),
    ).toContain("จัดการกระเป๋า");
  });
});

describe("buildWalletChooser", () => {
  it("offers the other wallets, each with the entry and wallet ids", () => {
    const msg = buildWalletChooser({
      txId: "t1",
      currentId: "w1",
      text: "ย้ายไปไหน",
      wallets: [w({}), w({ id: "w2", name: "KTC", kind: "card", isDefault: false })],
    }) as unknown as { quickReply: { items: { action: { data: string } }[] } };
    expect(msg.quickReply.items.map((i) => i.action.data)).toEqual(["a=wm&id=t1&w=w2"]);
  });
});
