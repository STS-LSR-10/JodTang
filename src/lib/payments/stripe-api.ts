const API = "https://api.stripe.com/v1";

export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Stripe's machine-readable error code, e.g. "api_key_invalid". */
    readonly code: string | null = null,
  ) {
    super(message);
  }

  /** Short, non-sensitive reason to show next to a generic failure message: "401 api_key_invalid". */
  get reason(): string {
    return [this.status, this.code].filter(Boolean).join(" ");
  }
}

/** POST a form-encoded request to Stripe and return the JSON body. */
export async function stripePost<T>(
  secretKey: string,
  path: string,
  fields: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string; param?: string };
  };
  if (!res.ok) {
    // Stripe's error text describes the request, never the key
    const e = body.error;
    throw new StripeApiError(
      res.status,
      `stripe ${path} ${res.status} ${e?.code ?? ""} ${e?.param ?? ""} ${e?.message ?? ""}`
        .replace(/\s+/g, " ")
        .trim(),
      e?.code ?? null,
    );
  }
  return body as T;
}

/** GET a Stripe resource and return the JSON body. */
export async function stripeGet<T>(secretKey: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
  if (!res.ok) {
    throw new StripeApiError(
      res.status,
      `stripe GET ${path} ${res.status} ${body.error?.code ?? ""}`.trim(),
      body.error?.code ?? null,
    );
  }
  return body as T;
}
