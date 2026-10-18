import { toSatang } from "@/lib/money";

export const WALLET_KINDS = ["cash", "bank", "card", "savings", "ewallet"] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];

export const WALLET_KIND_LABEL: Record<WalletKind, string> = {
  cash: "เงินสด",
  bank: "บัญชีธนาคาร",
  card: "บัตรเครดิต",
  savings: "เงินเก็บ",
  ewallet: "อีวอลเล็ต",
};

export const WALLET_KIND_EMOJI: Record<WalletKind, string> = {
  cash: "💵",
  bank: "🏦",
  card: "💳",
  savings: "🐷",
  ewallet: "📱",
};

export const DEFAULT_WALLET_NAME = "เงินสด";
export const MAX_WALLET_NAME = 30;

export interface Wallet {
  id: string;
  name: string;
  kind: WalletKind;
  isDefault: boolean;
  /** Integer satang; may be negative (a card). */
  openingSatang: number;
  incomeSatang: number;
  expenseSatang: number;
  /** Moved in / out by transfers between wallets (not income or expense). */
  transferInSatang: number;
  transferOutSatang: number;
  entryCount: number;
}

/** Opening balance + income - expense + transfers in - transfers out, in satang. */
export function balanceOf(
  w: Pick<
    Wallet,
    "openingSatang" | "incomeSatang" | "expenseSatang" | "transferInSatang" | "transferOutSatang"
  >,
): number {
  return (
    w.openingSatang + w.incomeSatang - w.expenseSatang + w.transferInSatang - w.transferOutSatang
  );
}

export function totalBalance(wallets: Wallet[]): number {
  return wallets.reduce((sum, w) => sum + balanceOf(w), 0);
}

/** A wallet as the web app receives it (satang as integers, the balance worked out). */
export function walletToDto(w: Wallet) {
  return {
    id: w.id,
    name: w.name,
    kind: w.kind,
    isDefault: w.isDefault,
    openingSatang: w.openingSatang,
    incomeSatang: w.incomeSatang,
    expenseSatang: w.expenseSatang,
    transferInSatang: w.transferInSatang,
    transferOutSatang: w.transferOutSatang,
    balanceSatang: balanceOf(w),
    entryCount: w.entryCount,
  };
}

export const walletLabel = (w: Pick<Wallet, "name" | "kind">) =>
  `${WALLET_KIND_EMOJI[w.kind]} ${w.name}`;

export type WalletMatch =
  { ok: true; wallet: Wallet } | { ok: false; reason: "none" | "ambiguous" };

/**
 * The wallet a typed "@word" means: the one with exactly that name (ignoring case), else the only
 * one whose name starts with it. Never a guess between several.
 */
export function resolveWallet(hint: string, wallets: Wallet[]): WalletMatch {
  const word = hint.trim().toLowerCase();
  if (!word) return { ok: false, reason: "none" };
  const exact = wallets.filter((w) => w.name.toLowerCase() === word);
  if (exact.length === 1 && exact[0]) return { ok: true, wallet: exact[0] };
  const starts = wallets.filter((w) => w.name.toLowerCase().startsWith(word));
  if (starts.length === 1 && starts[0]) return { ok: true, wallet: starts[0] };
  return { ok: false, reason: starts.length > 1 ? "ambiguous" : "none" };
}

/** A decimal typed for the opening balance ("1,200.50", "-500") as satang, or null if invalid. */
export function parseOpeningBalance(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return 0;
  const text = String(input).replace(/,/g, "").trim();
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(text)) return null;
  return toSatang(text);
}
