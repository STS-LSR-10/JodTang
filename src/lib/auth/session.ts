import { jwtVerify, SignJWT } from "jose";

const ISSUER = "meetang";
const AUDIENCE = "meetang-liff";
export const SESSION_TTL_SECONDS = 60 * 60;

export interface SessionClaims {
  /** users.id */
  userId: string;
  lineUserId: string;
}

const keyOf = (secret: string) => new TextEncoder().encode(secret);

/** Short-lived (1h) HS256 session JWT issued after a LINE ID token was verified. */
export async function signSession(
  claims: SessionClaims,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ lu: claims.lineUserId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(keyOf(secret));
}

/** Returns the claims, or null for anything invalid/expired/forged. */
export async function verifySession(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now,
    });
    if (typeof payload.sub !== "string" || typeof payload.lu !== "string") return null;
    return { userId: payload.sub, lineUserId: payload.lu };
  } catch {
    return null;
  }
}
