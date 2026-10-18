import { jwtVerify, SignJWT } from "jose";
import { UNLOCK_MINUTES } from "@/lib/pin";

const ISSUER = "jodtang";
const AUDIENCE = "jodtang-unlock";

export const UNLOCK_HEADER = "x-unlock";

const keyOf = (secret: string) => new TextEncoder().encode(secret);

/** Proof that the right PIN was typed a moment ago: short lived, tied to one person. */
export async function signUnlock(
  userId: string,
  secret: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + UNLOCK_MINUTES * 60;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(keyOf(secret));
  return { token, expiresAt: new Date(exp * 1000) };
}

/** True only for a genuine, unexpired unlock token of this very person. */
export async function verifyUnlock(
  token: string,
  secret: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now,
    });
    return payload.sub === userId;
  } catch {
    return false;
  }
}
