import { jwtVerify, SignJWT } from "jose";
import { EXPORT_LINK_TTL_SECONDS } from "@/lib/config";
import { txFilterSchema, type TxFilters } from "@/lib/tx-query";

const ISSUER = "jodtang";
const AUDIENCE = "jodtang-export";

export type ExportFormat = "csv" | "xlsx";

export interface ExportClaims {
  userId: string;
  format: ExportFormat;
  filters: TxFilters;
}

const keyOf = (secret: string) => new TextEncoder().encode(secret);

/**
 * A short-lived, single-purpose token that is the whole "credential" of an export link.
 * Needed because the LINE in-app browser cannot download files, so the link is opened in the
 * phone's own browser, which has no Authorization header. It carries the user and the filters
 * (signed, so neither can be changed) and expires in two minutes.
 */
export async function signExportToken(
  claims: ExportClaims,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ fmt: claims.format, f: claims.filters })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + EXPORT_LINK_TTL_SECONDS)
    .sign(keyOf(secret));
}

export async function verifyExportToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<ExportClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now,
    });
    if (typeof payload.sub !== "string") return null;
    if (payload.fmt !== "csv" && payload.fmt !== "xlsx") return null;
    const filters = txFilterSchema.safeParse(payload.f ?? {});
    if (!filters.success) return null;
    return { userId: payload.sub, format: payload.fmt, filters: filters.data };
  } catch {
    return null;
  }
}
