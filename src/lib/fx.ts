const SCALE = 100_000_000n;

/** A rate (baht per 1 unit) as a whole number of 1e-8 units, avoiding float arithmetic afterwards. */
export function rateToScaled(rate: number | string): bigint {
  return BigInt(Math.round(Number(rate) * 1e8));
}

/**
 * Convert an amount in a foreign currency (minor units, ×100) to satang with integer math, rounding
 * half up: 1500.00 JPY (150000) at 0.2335 -> 35025 satang.
 */
export function convertToSatang(minor: number, rate: number | string): number {
  return Number((BigInt(minor) * rateToScaled(rate) + SCALE / 2n) / SCALE);
}

/** "0.2335" / "152.1" — a rate for display, trimming trailing zeros. */
export function formatRate(rate: number | string): string {
  const n = Number(rate);
  const digits = n >= 100 ? 2 : n >= 1 ? 3 : 4;
  return String(Number(n.toFixed(digits)));
}

/** "1,500 JPY" / "20.50 USD" for display. */
export function formatForeign(minor: number, currency: string): string {
  const whole = Math.trunc(minor / 100);
  const cents = minor % 100;
  const int = whole.toLocaleString("en-US");
  return `${cents === 0 ? int : `${int}.${String(cents).padStart(2, "0")}`} ${currency}`;
}

export interface FxRate {
  /** Baht per 1 unit of the currency. */
  rate: number;
  /** The day the rate is from (a weekend gets Friday's). */
  sourceDay: string;
}

const API = "https://api.frankfurter.dev/v1";
const TIMEOUT_MS = 4000;

/**
 * Ask Frankfurter (ECB reference rates) for the baht price of one unit of `currency` on `day`
 * (YYYY-MM-DD, or "latest"). Null when the source does not answer or the answer is not usable.
 */
export async function fetchRate(
  currency: string,
  day: string | "latest",
  fetchFn: typeof fetch = fetch,
): Promise<FxRate | null> {
  try {
    const res = await fetchFn(`${API}/${day}?base=${currency}&symbols=THB`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { date?: unknown; rates?: { THB?: unknown } };
    const rate = body.rates?.THB;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return null;
    return { rate, sourceDay: body.date };
  } catch {
    return null;
  }
}
