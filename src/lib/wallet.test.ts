import { describe, expect, it } from "vitest";
import {
  balanceOf,
  parseOpeningBalance,
  resolveWallet,
  totalBalance,
  walletToDto,
  type Wallet,
} from "./wallet";

const w = (over: Partial<Wallet>): Wallet => ({
  id: "w1",
  name: "เงินสด",
  kind: "cash",
  isDefault: false,
  openingSatang: 0,
  incomeSatang: 0,
  expenseSatang: 0,
  transferInSatang: 0,
  transferOutSatang: 0,
  debtInSatang: 0,
  debtOutSatang: 0,
  creditLimitSatang: null,
  statementDay: null,
  dueDay: null,
  entryCount: 0,
  ...over,
});

describe("balances", () => {
  it("is opening + income - expense and can go negative (a card)", () => {
    expect(balanceOf(w({ openingSatang: 100000, incomeSatang: 50000, expenseSatang: 20000 }))).toBe(
      130000,
    );
    expect(balanceOf(w({ expenseSatang: 350000 }))).toBe(-350000);
  });

  it("transfers move money in and out", () => {
    expect(
      balanceOf(w({ openingSatang: 1000, transferInSatang: 500, transferOutSatang: 200 })),
    ).toBe(1300);
  });

  it("debts move money in and out too", () => {
    expect(balanceOf(w({ openingSatang: 1000, debtInSatang: 300, debtOutSatang: 800 }))).toBe(500);
  });

  it("the total adds every wallet", () => {
    expect(totalBalance([w({ openingSatang: 1000 }), w({ id: "w2", incomeSatang: 500 })])).toBe(
      1500,
    );
  });

  it("the web app gets the balance worked out", () => {
    expect(walletToDto(w({ openingSatang: 100, incomeSatang: 50 })).balanceSatang).toBe(150);
  });
});

describe("resolveWallet", () => {
  const wallets = [
    w({ id: "a", name: "เงินสด", isDefault: true }),
    w({ id: "b", name: "KTC", kind: "card" }),
    w({ id: "c", name: "กสิกร", kind: "bank" }),
    w({ id: "d", name: "กสิกรออมทรัพย์", kind: "savings" }),
  ];

  it("matches the exact name, ignoring case", () => {
    expect(resolveWallet("ktc", wallets)).toMatchObject({ ok: true, wallet: { id: "b" } });
  });

  it("prefers the exact name over a longer one that starts the same", () => {
    expect(resolveWallet("กสิกร", wallets)).toMatchObject({ ok: true, wallet: { id: "c" } });
  });

  it("a unique prefix is enough", () => {
    expect(resolveWallet("เงิน", wallets)).toMatchObject({ ok: true, wallet: { id: "a" } });
  });

  it("never guesses between several", () => {
    const two = [w({ id: "x", name: "บัตร A" }), w({ id: "y", name: "บัตร B" })];
    expect(resolveWallet("บัตร", two)).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("says when there is none", () => {
    expect(resolveWallet("xyz", wallets)).toEqual({ ok: false, reason: "none" });
    expect(resolveWallet("  ", wallets)).toEqual({ ok: false, reason: "none" });
  });
});

describe("parseOpeningBalance", () => {
  it.each([
    [undefined, 0],
    [null, 0],
    ["", 0],
    ["1,200.50", 120050],
    ["-500", -50000],
    [300, 30000],
  ])("%s -> %s satang", (input, satang) => {
    expect(parseOpeningBalance(input)).toBe(satang);
  });

  it.each(["abc", "1.234", "12e3"])("%s is invalid", (input) => {
    expect(parseOpeningBalance(input)).toBeNull();
  });
});
