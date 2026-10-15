export interface LineIdTokenClaims {
  /** LINE user id — the same id the Messaging API webhook reports. */
  sub: string;
  name?: string;
  picture?: string;
}

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

/**
 * Verify a LIFF ID token with LINE. `clientId` is the Channel ID of the LINE Login
 * channel that owns the LIFF app. Returns null when the token is invalid or expired.
 */
export async function verifyLineIdToken(
  idToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LineIdTokenClaims | null> {
  const res = await fetchImpl(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Partial<LineIdTokenClaims>;
  if (typeof data.sub !== "string" || data.sub.length === 0) return null;
  return {
    sub: data.sub,
    name: typeof data.name === "string" ? data.name : undefined,
    picture: typeof data.picture === "string" ? data.picture : undefined,
  };
}
