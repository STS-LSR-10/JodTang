import { describe, expect, it, vi } from "vitest";
import { verifyLineIdToken } from "./liff-verify";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("verifyLineIdToken", () => {
  it("returns the claims for a valid token and sends id_token + client_id", async () => {
    const f = fakeFetch(200, { sub: "U123", name: "สมชาย", picture: "https://x/p.png", aud: "1" });
    const claims = await verifyLineIdToken("tok-123456789", "client-1", f);
    expect(claims).toEqual({ sub: "U123", name: "สมชาย", picture: "https://x/p.png" });

    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("id_token")).toBe("tok-123456789");
    expect(sent.get("client_id")).toBe("client-1");
  });

  it("returns null when LINE rejects the token", async () => {
    const f = fakeFetch(400, { error: "invalid_request" });
    expect(await verifyLineIdToken("bad-token-123", "client-1", f)).toBeNull();
  });

  it("returns null when the response has no sub", async () => {
    const f = fakeFetch(200, { name: "no sub" });
    expect(await verifyLineIdToken("tok-123456789", "client-1", f)).toBeNull();
  });
});
