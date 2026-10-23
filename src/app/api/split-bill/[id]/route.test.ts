import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillRow } from "@/lib/split-bill";

const BILL_ID = "abcdef12-0000-4000-8000-000000000000";
let session = { userId: "app-Uanna", lineUserId: "Uanna" };
let bill: BillRow | null;
let group = { id: "g1", lineGroupId: "C-g", ownerUserId: "app-Uowner", isActive: true };
let known = new Map<string, { name: string; updatedAt: string }>();
let lineList: string[] | null = null;
let confirmResult = true;
const confirmed: { lineUserId: string; shareSatang: number; paid: boolean }[][] = [];
const upserts: string[] = [];
let limited = false;

vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => session }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ LINE_CHANNEL_ACCESS_TOKEN: "t" }) }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () =>
    limited ? Response.json({ error: "ช้าลงหน่อย" }, { status: 429 }) : null,
}));
vi.mock("@/lib/line/client", () => ({
  createLineClient: () => ({
    listGroupMemberIds: async () => lineList,
    getGroupMemberProfile: async (_g: string, id: string) => ({ displayName: `ชื่อ-${id}` }),
  }),
}));
vi.mock("@/lib/group-repo", () => ({
  memberNames: async () => known,
  upsertMember: async (_db: unknown, _g: string, id: string, name: string) => {
    upserts.push(id);
    known.set(id, { name, updatedAt: new Date().toISOString() });
  },
}));
vi.mock("@/lib/split-bill-repo", () => ({
  getBillAndGroup: async () => (bill ? { bill, group } : null),
  confirmBill: async (_db: unknown, _id: string, shares: (typeof confirmed)[number]) => {
    confirmed.push(shares);
    return confirmResult;
  },
}));

import { GET, POST } from "./route";

const ctx = { params: Promise.resolve({ id: BILL_ID }) };
const get = () => GET(new Request("http://x/api/split-bill/x"), ctx);
const post = (body: unknown) =>
  POST(
    new Request("http://x/api/split-bill/x", { method: "POST", body: JSON.stringify(body) }),
    ctx,
  );

beforeEach(() => {
  session = { userId: "app-Uanna", lineUserId: "Uanna" };
  bill = {
    id: BILL_ID,
    groupId: "g1",
    payerLineUserId: "Uanna",
    title: "หมูกระทะ",
    amountSatang: 90_000,
    status: "setup",
    createdAt: "2026-10-18T05:00:00Z",
  };
  group = { id: "g1", lineGroupId: "C-g", ownerUserId: "app-Uowner", isActive: true };
  known = new Map(
    [
      ["Uanna", "แอน"],
      ["Ubob", "บ๊อบ"],
      ["Uchom", "ชมพู"],
    ].map(([id, name]) => [
      id as string,
      { name: name as string, updatedAt: "2026-10-18T05:00:00Z" },
    ]),
  );
  lineList = null;
  confirmResult = true;
  confirmed.length = 0;
  upserts.length = 0;
  limited = false;
});

describe("GET /api/split-bill/<id>", () => {
  it("gives the bill and the people the bot knows, the payer first", async () => {
    const body = await (await get()).json();
    expect(body.bill).toMatchObject({ title: "หมูกระทะ", amountSatang: 90_000, status: "setup" });
    // the payer first, then the others by name (Thai order)
    expect(body.people.map((p: { lineUserId: string }) => p.lineUserId)).toEqual([
      "Uanna",
      "Uchom",
      "Ubob",
    ]);
    expect(body.people[0]).toMatchObject({ lineUserId: "Uanna", isPayer: true });
    expect(body.open).toBe(true);
    expect(body.complete).toBe(false); // LINE would not list the members (OA not verified)
  });

  it("with a verified account the whole member list is used, and new people get their names", async () => {
    lineList = ["Uanna", "Ubob", "Uchom", "Udan"];
    const body = await (await get()).json();
    expect(body.complete).toBe(true);
    expect(body.people.map((p: { lineUserId: string }) => p.lineUserId)).toContain("Udan");
    expect(body.people.find((p: { lineUserId: string }) => p.lineUserId === "Udan").name).toBe(
      "ชื่อ-Udan",
    );
    expect(upserts).toEqual(["Udan"]);
  });

  it("only the payer (or the owner of the ledger) may open it", async () => {
    session = { userId: "app-Ubob", lineUserId: "Ubob" };
    expect((await get()).status).toBe(403);
    session = { userId: "app-Uowner", lineUserId: "Uowner" };
    expect((await get()).status).toBe(200);
  });

  it("a bill that does not exist or whose ledger is closed is a 404; one already chosen says it is not open", async () => {
    bill = null;
    expect((await get()).status).toBe(404);
    bill = {
      id: BILL_ID,
      groupId: "g1",
      payerLineUserId: "Uanna",
      title: "x",
      amountSatang: 100,
      status: "collecting",
      createdAt: "2026-10-18T05:00:00Z",
    };
    expect((await (await get()).json()).open).toBe(false);
    group = { ...group, isActive: false };
    expect((await get()).status).toBe(404);
  });
});

describe("POST /api/split-bill/<id>", () => {
  it("fixes equal shares that add up to the bill, the payer included, and returns the line for the chat", async () => {
    const res = await post({ people: ["Ubob", "Uchom"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      count: 3,
      message: "✅ เลือกคนหารบิล หมูกระทะ แล้ว #abcdef12",
    });
    expect(confirmed).toHaveLength(1);
    const shares = confirmed[0]!;
    expect(shares.map((s) => s.lineUserId).sort()).toEqual(["Uanna", "Ubob", "Uchom"]);
    expect(shares.reduce((s, x) => s + x.shareSatang, 0)).toBe(90_000);
    expect(shares.find((s) => s.lineUserId === "Uanna")?.paid).toBe(true);
  });

  it("the payer is added even when left out of the list", async () => {
    await post({ people: ["Ubob"] });
    expect(confirmed[0]?.map((s) => s.lineUserId).sort()).toEqual(["Uanna", "Ubob"]);
  });

  it("refuses a person who is not in the group, an empty choice, and a list that is too long", async () => {
    expect((await post({ people: ["Ustranger"] })).status).toBe(400);
    expect((await post({ people: [] })).status).toBe(400);
    expect((await post({ nope: 1 })).status).toBe(400);
    expect((await post({ people: ["Uanna"] })).status).toBe(400); // only the payer: nobody to share with
    expect(confirmed).toHaveLength(0);
  });

  it("only the payer (or the owner) may confirm", async () => {
    session = { userId: "app-Ubob", lineUserId: "Ubob" };
    expect((await post({ people: ["Uchom"] })).status).toBe(403);
    expect(confirmed).toHaveLength(0);
  });

  it("a bill that was already chosen cannot be chosen twice", async () => {
    confirmResult = false;
    expect((await post({ people: ["Ubob"] })).status).toBe(409);
    confirmResult = true;
    bill = { ...bill!, status: "collecting" };
    expect((await post({ people: ["Ubob"] })).status).toBe(409);
  });

  it("is rate limited", async () => {
    limited = true;
    expect((await post({ people: ["Ubob"] })).status).toBe(429);
    expect(confirmed).toHaveLength(0);
  });
});
