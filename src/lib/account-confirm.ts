/** Client-safe: the phrase the user types to delete everything (second confirmation step). */
export const DELETE_CONFIRM_PHRASE = "ลบข้อมูลทั้งหมด";

/** Forgiving about spaces and Unicode normalisation, strict about the words. */
export function isDeleteConfirmed(input: string): boolean {
  const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, "").trim();
  return clean(input) === clean(DELETE_CONFIRM_PHRASE);
}
