/** Client-safe: the phrase the user types to delete everything (second confirmation step). */
export const DELETE_CONFIRM_PHRASE = "ลบข้อมูลทั้งหมด";

/** Forgiving about spaces and Unicode normalisation, strict about the words. */
export function isDeleteConfirmed(input: string): boolean {
  const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, "").trim();
  return clean(input) === clean(DELETE_CONFIRM_PHRASE);
}

import { thaiMonthYear } from "@/lib/thai-date";

/** The phrase to type to erase all history but keep the account. */
export const RESET_CONFIRM_PHRASE = "ล้างประวัติ";

/** The phrase to type to erase one month, e.g. "ลบเดือน ต.ค. 2569". */
export const monthDeletePhrase = (monthKey: string) => `ลบเดือน ${thaiMonthYear(monthKey)}`;

const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, "").trim();

/** True when what was typed matches the phrase (forgiving about spaces, strict about the words). */
export const phraseMatches = (typed: string, phrase: string): boolean =>
  clean(typed) === clean(phrase);
