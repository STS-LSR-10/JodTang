/**
 * Money is handled as integer satang (1 baht = 100 satang). Never use float math on amounts.
 * DB columns are numeric(14,2); convert at the boundary with toSatang / satangToString.
 */

/** Parse "50.50", "1,200", or a number with <= 2 decimals into integer satang (rounds half up). */
export function toSatang(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim().replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error("Invalid money value");
  const [, sign, whole = "0", frac = ""] = match;
  const digits = (frac + "000").slice(0, 3);
  let cents = Number(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) cents += 1;
  const total = Number(whole) * 100 + cents;
  return sign === "-" ? -total : total;
}

/** Integer satang -> "50.50" (for numeric DB columns). */
export function satangToString(satang: number): string {
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(Math.round(satang));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Integer satang -> display text without currency symbol: "1,200" or "50.50". */
export function formatBaht(satang: number): string {
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(Math.round(satang));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = abs % 100;
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(cents).padStart(2, "0")}`;
}
