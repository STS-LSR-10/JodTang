import { beforeEach, describe, expect, it, vi } from "vitest";

let share: {
  billId: string;
  title: string;
  payerLineUserId: string;
  shareSatang: number;
  status: string;
} | null = null;
let payment: { promptpayId: string | null } | null = null;
const asked: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/split-bill-repo", () => ({
  shareByToken: async (_db: unknown, token: string) => {
    asked.push(token);
    return share;
  },
  getPaymentByLine: async () => payment,
}));

import { GET } from "./route";

const TOKEN = "123e4567-e89b-42d3-a456-426614174000";
const call = (token: string) =>
  GET(new Request(`http://x/api/split-bill/qr/${token}`), { params: Promise.resolve({ token }) });

beforeEach(() => {
  share = {
    billId: "b1",
    title: "หมูกระทะ",
    payerLineUserId: "Uanna",
    shareSatang: 30_000,
    status: "collecting",
  };
  payment = { promptpayId: "0812345678" };
  asked.length = 0;
});

describe("GET /api/split-bill/qr/<token>.png", () => {
  it("answers a PNG for a real share, without any sign-in", async () => {
    const res = await call(`${TOKEN}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(asked).toEqual([TOKEN]); // the ".png" is not part of the token
  });

  it("is a 404 for anything that is not a real, open share with a PromptPay behind it", async () => {
    expect((await call("not-a-token.png")).status).toBe(404);
    expect(asked).toHaveLength(0); // a bad token never even reaches the database

    share = null;
    expect((await call(`${TOKEN}.png`)).status).toBe(404);

    share = {
      billId: "b1",
      title: "x",
      payerLineUserId: "Uanna",
      shareSatang: 100,
      status: "cancelled",
    };
    expect((await call(`${TOKEN}.png`)).status).toBe(404);
    share.status = "joining"; // shares are not fixed yet
    expect((await call(`${TOKEN}.png`)).status).toBe(404);

    share.status = "collecting";
    payment = { promptpayId: null };
    expect((await call(`${TOKEN}.png`)).status).toBe(404);
    payment = null;
    expect((await call(`${TOKEN}.png`)).status).toBe(404);
  });

  it("never puts the phone number in the picture's address or headers", async () => {
    const res = await call(`${TOKEN}.png`);
    expect(JSON.stringify([...res.headers])).not.toContain("0812345678");
  });
});
