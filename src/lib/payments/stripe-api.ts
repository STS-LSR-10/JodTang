const API = "https://api.stripe.com/v1";

export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
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
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    // Stripe's error text describes the request, never the key
    throw new StripeApiError(
      res.status,
      `stripe ${path} ${res.status} ${body.error?.code ?? ""}`.trim(),
    );
  }
  return body as T;
}
