import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const PIN_MIN = 4;
export const PIN_MAX = 6;
/** Wrong PINs in a row before the lock starts. */
export const MAX_FAILS = 5;
/** Minutes locked after the 1st, 2nd and later times the limit was hit (the database applies these). */
export const LOCK_MINUTES = [15, 30, 60] as const;
/** How long a "forgot my PIN" request waits before the PIN is removed. */
export const RESET_DELAY_HOURS = 24;
export const UNLOCK_MINUTES = 15;

export type PinCheck = "ok" | "format" | "weak";

/** All the same digit, a straight run up or down ("1234", "9876"), or a short pattern repeated ("1212", "123123"). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - (digits[i] ?? 0));
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true;
  for (let size = 1; size <= pin.length / 2; size++) {
    if (pin.length % size === 0 && pin.slice(0, size).repeat(pin.length / size) === pin)
      return true;
  }
  return false;
}

/** 4–6 digits, and not one that is easy to guess. */
export function checkPin(pin: unknown): PinCheck {
  if (typeof pin !== "string" || !new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin))
    return "format";
  return isWeakPin(pin) ? "weak" : "ok";
}

const scryptAsync = (secret: Buffer, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(secret, salt, 32, { N: 16_384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

/** The PIN is mixed with a server-side secret (pepper) first, so a copy of the database alone cannot be brute-forced. */
const pepperPin = (pin: string, pepper: string) =>
  createHmac("sha256", pepper).update(pin).digest();

/** A slow salted hash of the PIN (hex), with the salt to store beside it. */
export async function hashPin(
  pin: string,
  pepper: string,
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pepperPin(pin, pepper), salt);
  return { hash: key.toString("hex"), salt: salt.toString("hex") };
}

/** Constant-time check of a typed PIN against the stored hash. */
export async function verifyPin(
  pin: string,
  stored: { hash: string; salt: string },
  pepper: string,
): Promise<boolean> {
  if (!/^\d+$/.test(pin) || pin.length > 32) return false;
  const expected = Buffer.from(stored.hash, "hex");
  const key = await scryptAsync(pepperPin(pin, pepper), Buffer.from(stored.salt, "hex"));
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export interface LockState {
  failed: number;
  level: number;
  lockedUntil: Date | null;
}

export const isLocked = (s: Pick<LockState, "lockedUntil">, now: Date): boolean =>
  s.lockedUntil !== null && s.lockedUntil > now;

/** A pending "forgot my PIN" request has waited long enough. */
export const resetDue = (requestedAt: Date | null, now: Date): boolean =>
  requestedAt !== null && now.getTime() - requestedAt.getTime() >= RESET_DELAY_HOURS * 3_600_000;

export const resetEffectiveAt = (requestedAt: Date): Date =>
  new Date(requestedAt.getTime() + RESET_DELAY_HOURS * 3_600_000);
