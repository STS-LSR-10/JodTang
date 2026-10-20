import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billShares, type BillMemberRow, type BillRow } from "@/lib/split-bill";
import type { PaymentAccount } from "@/lib/split-bill-repo";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

const GID = "C-bill-group";
const NOW = new Date("2026-10-18T05:00:00Z");
const NAMES: Record<string, string> = {
  Uanna: "แอน",
  Ubob: "บ๊อบ",
  Uchom: "ชมพู",
  Uowner: "เจ้าของ",
};

let group = { id: "g1", lineGroupId: GID, ownerUserId: "app-Uowner", isActive: true };
let ownerPlan = "ultimate";
let members = new Map<string, { name: string; updatedAt: string }>();
let bills: BillRow[] = [];
let billMembers: Record<string, (BillMemberRow & { joinedAt: number })[]> = {};
const payments = new Map<string, PaymentAccount>();
let seq = 0;

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async (_db: unknown, lineUserId: string) => ({
    id: `app-${lineUserId}`,
    line_user_id: lineUserId,
    display_name: null,
    plan: "ultimate",
    plan_expires_at: null,
  }),
}));
vi.mock("@/lib/group-repo", () => ({
  getGroup: async () => group,
  getOwner: async () => ({ lineUserId: "Uowner", plan: ownerPlan, planExpiresAt: null }),
  memberNames: async () => members,
  upsertMember: async (_db: unknown, _g: string, userId: string, name: string) => {
    members.set(userId, { name, updatedAt: NOW.toISOString() });
  },
  closeGroup: async () => undefined,
}));
vi.mock("@/lib/split-bill-repo", () => ({
  createBill: async (
    _db: unknown,
    input: { groupId: string; payerLineUserId: string; title: string; amountSatang: number },
  ) => {
    if (bills.filter((b) => b.status === "joining" || b.status === "collecting").length >= 10) {
      return "too_many";
    }
    const bill: BillRow = {
      id: `b${++seq}`,
      groupId: input.groupId,
      payerLineUserId: input.payerLineUserId,
      title: input.title,
      amountSatang: input.amountSatang,
      status: "joining",
      createdAt: NOW.toISOString(),
    };
    bills.push(bill);
    billMembers[bill.id] = [];
    return bill;
  },
  getBill: async (_db: unknown, _g: string, id: string) => bills.find((b) => b.id === id) ?? null,
  listBills: async (_db: unknown, _g: string, statuses: string[]) =>
    bills.filter((b) => statuses.includes(b.status)),
  latestBillBy: async (_db: unknown, _g: string, payer: string, statuses: string[]) =>
    bills.filter((b) => b.payerLineUserId === payer && statuses.includes(b.status)).at(-1) ?? null,
  billMembers: async (_db: unknown, id: string) => billMembers[id] ?? [],
  joinBill: async (_db: unknown, id: string, user: string) => {
    const bill = bills.find((b) => b.id === id);
    if (bill?.status !== "joining") return "closed";
    const list = billMembers[id] ?? (billMembers[id] = []);
    if (!list.some((m) => m.lineUserId === user)) {
      if (list.length >= 30) return "full";
      list.push({
        lineUserId: user,
        shareSatang: null,
        paid: false,
        qrToken: `tok-${id}-${user}`,
        joinedAt: list.length,
      });
    }
    return "ok";
  },
  closeBill: async (
    _db: unknown,
    id: string,
    shares: { lineUserId: string; shareSatang: number; paid: boolean }[],
  ) => {
    const bill = bills.find((b) => b.id === id);
    if (bill?.status !== "joining") return false;
    expect(shares.reduce((s, x) => s + x.shareSatang, 0)).toBe(bill.amountSatang);
    for (const s of shares) {
      const m = billMembers[id]?.find((x) => x.lineUserId === s.lineUserId);
      if (m) {
        m.shareSatang = s.shareSatang;
        m.paid = s.paid;
      }
    }
    bill.status = billMembers[id]?.every((m) => m.paid) ? "settled" : "collecting";
    return true;
  },
  markPaid: async (_db: unknown, id: string, user: string) => {
    const bill = bills.find((b) => b.id === id);
    const m = billMembers[id]?.find((x) => x.lineUserId === user);
    if (bill?.status !== "collecting" || !m) return "none";
    if (m.paid) return "already";
    m.paid = true;
    if (billMembers[id]?.every((x) => x.paid)) bill.status = "settled";
    return "ok";
  },
  cancelBill: async (_db: unknown, id: string) => {
    const bill = bills.find((b) => b.id === id);
    if (!bill || (bill.status !== "joining" && bill.status !== "collecting")) return false;
    bill.status = "cancelled";
    return true;
  },
  getPaymentByLine: async (_db: unknown, line: string) => payments.get(line) ?? null,
}));

const inGroup = (userId: string | undefined, t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "group", groupId: GID, userId },
  message: { type: "text", id: "1", text: t },
});
const tap = (userId: string, data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: { type: "group", groupId: GID, userId },
  postback: { data },
});

function setup() {
  const reply = vi.fn<(token: string, messages: unknown[]) => Promise<undefined>>(
    async () => undefined,
  );
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply,
    getProfile: async () => null,
    getGroupMemberProfile: async (_g, u) => ({ displayName: NAMES[u] ?? "ใครสักคน" }),
    now: () => NOW,
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const said = (reply: ReturnType<typeof setup>["reply"]) =>
  JSON.stringify(reply.mock.calls.map((c) => c[1]));
const run = async (event: LineEvent) => {
  const s = setup();
  await handleEvent(event, s.deps);
  return said(s.reply);
};

beforeEach(() => {
  process.env.APP_BASE_URL = "https://x.test";
  group = { id: "g1", lineGroupId: GID, ownerUserId: "app-Uowner", isActive: true };
  ownerPlan = "ultimate";
  members = new Map(
    ["Uanna", "Ubob", "Uchom", "Uowner"].map((id) => [
      id,
      { name: NAMES[id] as string, updatedAt: NOW.toISOString() },
    ]),
  );
  bills = [];
  billMembers = {};
  payments.clear();
  seq = 0;
});

/** A bill that Anna paid for, with Bob and Chom in, list still open. */
async function openBill(amount = 1200) {
  await run(inGroup("Uanna", `หารบิล หมูกระทะ ${amount}`));
  await run(tap("Ubob", "a=gbj&b=b1"));
  await run(tap("Uchom", "a=gbj&b=b1"));
}

describe("opening a bill", () => {
  it("posts a card with the join button, and the payer is in already", async () => {
    const out = await run(inGroup("Uanna", "หารบิล หมูกระทะ 1200"));
    expect(out).toContain('"type":"flex"');
    expect(out).toContain("หมูกระทะ");
    expect(out).toContain("฿1,200");
    expect(out).toContain("a=gbj&b=b1");
    expect(out).toContain("a=gbc&b=b1");
    expect(billMembers.b1?.map((m) => m.lineUserId)).toEqual(["Uanna"]);
    expect(bills[0]).toMatchObject({ payerLineUserId: "Uanna", amountSatang: 120_000 });
  });

  it("people typed after the amount are in straight away", async () => {
    await run(inGroup("Uanna", "หารบิล หมูกระทะ 1200 บ๊อบ ชมพู"));
    expect(billMembers.b1?.map((m) => m.lineUserId).sort()).toEqual(["Uanna", "Ubob", "Uchom"]);
  });

  it("a name the bot does not know opens nothing and says so", async () => {
    const out = await run(inGroup("Uanna", "หารบิล หมูกระทะ 1200 นก"));
    expect(out).toContain("ไม่รู้จัก นก");
    expect(bills).toHaveLength(0);
  });

  it("without an amount it explains how", async () => {
    expect(await run(inGroup("Uanna", "หารบิล หมูกระทะ"))).toContain("หารบิล หมูกระทะ 1200");
    expect(bills).toHaveLength(0);
  });

  it("needs the ledger to be open, and a writable one", async () => {
    group = { ...group, isActive: false };
    expect(await run(inGroup("Uanna", "หารบิล หมูกระทะ 1200"))).toContain("ยังไม่ได้เปิดสมุด");
    group = { ...group, isActive: true };
    ownerPlan = "free";
    expect(await run(inGroup("Uanna", "หารบิล หมูกระทะ 1200"))).toContain("หยุดจดชั่วคราว");
    expect(bills).toHaveLength(0);
  });

  it("at most ten unfinished bills a group", async () => {
    for (const letter of "กขคงจฉชซฌญ") await run(inGroup("Uanna", `หารบิล บิล${letter} 100`));
    expect(await run(inGroup("Uanna", "หารบิล อีกบิล 100"))).toContain("ครบ 10 บิล");
    expect(bills).toHaveLength(10);
  });
});

describe("joining and closing the list", () => {
  it("each tap joins once and says how many are in", async () => {
    await run(inGroup("Uanna", "หารบิล หมูกระทะ 1200"));
    expect(await run(tap("Ubob", "a=gbj&b=b1"))).toContain("บ๊อบ ร่วมหาร");
    expect(await run(tap("Ubob", "a=gbj&b=b1"))).toContain("ตอนนี้ 2 คน"); // a second tap does not add him again
    expect(billMembers.b1).toHaveLength(2);
  });

  it("only the payer (or the owner) closes it; the shares are equal and add up", async () => {
    await openBill(1000);
    expect(await run(tap("Ubob", "a=gbc&b=b1"))).toContain("เฉพาะคนที่จ่ายบิลนี้");
    expect(bills[0]?.status).toBe("joining");

    const out = await run(tap("Uanna", "a=gbc&b=b1"));
    expect(bills[0]?.status).toBe("collecting");
    const shares = billMembers.b1?.map((m) => m.shareSatang) ?? [];
    expect(shares.reduce((s, x) => (s ?? 0) + (x ?? 0), 0)).toBe(100_000);
    expect(
      Math.max(...(shares as number[])) - Math.min(...(shares as number[])),
    ).toBeLessThanOrEqual(1);
    expect(out).toContain("💸 จ่ายส่วนของฉัน");
    expect(out).toContain("a=gbp&b=b1&u=Ubob");
    expect(out).not.toContain("a=gbp&b=b1&u=Uanna"); // the payer owes nobody
    expect(billMembers.b1?.find((m) => m.lineUserId === "Uanna")?.paid).toBe(true);
  });

  it("a bill that does not divide still adds up to the satang, the payer taking the odd one", () => {
    const shares = billShares(10_000, ["Ubob", "Uchom", "Uanna"], "Uanna");
    expect(shares.map((s) => s.shareSatang)).toEqual([3334, 3333, 3333]);
    expect(shares.reduce((s, x) => s + x.shareSatang, 0)).toBe(10_000);
    expect(shares[0]).toMatchObject({ lineUserId: "Uanna", paid: true });
  });

  it("the payer alone cannot close; the typed command works too", async () => {
    await run(inGroup("Uanna", "หารบิล หมูกระทะ 1200"));
    expect(await run(inGroup("Uanna", "ปิดรายชื่อ"))).toContain("ยังไม่มีใครร่วมหาร");
    await run(tap("Ubob", "a=gbj&b=b1"));
    await run(inGroup("Uanna", "ปิดรายชื่อ"));
    expect(bills[0]?.status).toBe("collecting");
  });

  it("nobody can join once the list is closed (a double tap closes once)", async () => {
    await openBill();
    await run(tap("Uanna", "a=gbc&b=b1"));
    expect(await run(tap("Uanna", "a=gbc&b=b1"))).toContain("ปิดรายชื่อไปแล้ว");
    expect(await run(tap("Uowner", "a=gbj&b=b1"))).toContain("ปิดรายชื่อแล้ว");
    expect(billMembers.b1).toHaveLength(3);
  });

  it("the payer can cancel; others cannot", async () => {
    await openBill();
    expect(await run(tap("Ubob", "a=gbx&b=b1"))).toContain("เฉพาะคนที่จ่ายบิลนี้");
    expect(await run(tap("Uanna", "a=gbx&b=b1"))).toContain("ยกเลิกบิล");
    expect(bills[0]?.status).toBe("cancelled");
  });
});

describe("paying", () => {
  beforeEach(async () => {
    await openBill(900);
    await run(tap("Uanna", "a=gbc&b=b1"));
  });

  it("gives each person a QR with their own amount, from the payer's PromptPay", async () => {
    payments.set("Uanna", {
      promptpayId: "0812345678",
      bankName: null,
      bankAccount: null,
      accountName: null,
    });
    const out = await run(tap("Ubob", "a=gbq&b=b1"));
    const token = billMembers.b1?.find((m) => m.lineUserId === "Ubob")?.qrToken;
    expect(out).toContain("ส่วนของ บ๊อบ");
    expect(out).toContain("฿300");
    expect(out).toContain(`/api/split-bill/qr/${token}.png`.replace(/^/, ""));
    expect(out).toContain("081-xxx-5678"); // masked, never the whole number
    expect(out).not.toContain("0812345678");
  });

  it("without a public https address there is no picture, only the details", async () => {
    payments.set("Uanna", {
      promptpayId: "0812345678",
      bankName: null,
      bankAccount: null,
      accountName: null,
    });
    const prev = process.env.APP_BASE_URL;
    delete process.env.APP_BASE_URL;
    try {
      expect(await run(tap("Ubob", "a=gbq&b=b1"))).not.toContain('"type":"image"');
    } finally {
      if (prev !== undefined) process.env.APP_BASE_URL = prev;
    }
  });

  it("a bank account is shown as text (there is no QR for it)", async () => {
    process.env.APP_BASE_URL = "https://x.test";
    payments.set("Uanna", {
      promptpayId: null,
      bankName: "กสิกร",
      bankAccount: "123-4-56789-0",
      accountName: "แอน ใจดี",
    });
    const out = await run(tap("Ubob", "a=gbq&b=b1"));
    expect(out).toContain("กสิกร 123-4-56789-0");
    expect(out).toContain("แอน ใจดี");
    expect(out).not.toContain('"type":"image"');
  });

  it("tells the payer how to set it up when nothing is set", async () => {
    const out = await run(tap("Ubob", "a=gbq&b=b1"));
    expect(out).toContain("พร้อมเพย์ 0812345678");
  });

  it("someone not on the bill, or already paid, is told", async () => {
    expect(await run(tap("Uowner", "a=gbq&b=b1"))).toContain("ไม่ได้อยู่ในรายชื่อ");
    await run(tap("Uanna", "a=gbp&b=b1&u=Ubob"));
    expect(await run(tap("Ubob", "a=gbq&b=b1"))).toContain("จ่ายเรียบร้อยแล้ว");
  });

  it("only the payer ticks a person off; the card then shows it, and the last one settles the bill", async () => {
    expect(await run(tap("Ubob", "a=gbp&b=b1&u=Uchom"))).toContain("เฉพาะคนที่จ่ายบิลนี้");
    expect(billMembers.b1?.find((m) => m.lineUserId === "Uchom")?.paid).toBe(false);

    const first = await run(tap("Uanna", "a=gbp&b=b1&u=Ubob"));
    expect(first).toContain("รับเงินจาก บ๊อบ แล้ว");
    expect(first).toContain("ยังค้าง 1 คน");
    expect(await run(tap("Uanna", "a=gbp&b=b1&u=Ubob"))).toContain("จ่ายแล้วก่อนหน้านี้");

    const last = await run(inGroup("Uanna", "ได้รับแล้ว ชมพู"));
    expect(last).toContain("เก็บครบแล้ว");
    expect(bills[0]?.status).toBe("settled");
  });

  it("the typed 'ได้รับแล้ว' names someone who is not on the bill", async () => {
    expect(await run(inGroup("Uanna", "ได้รับแล้ว นก"))).toContain("ไม่เจอ นก");
  });
});

describe("chasing", () => {
  it("lists who still owes how much, bill by bill, and keeps working when the ledger is read-only", async () => {
    await openBill(900);
    await run(tap("Uanna", "a=gbc&b=b1"));
    await run(tap("Uanna", "a=gbp&b=b1&u=Ubob"));
    ownerPlan = "free";
    const out = await run(inGroup("Ubob", "ตามเงิน"));
    expect(out).toContain("ชมพู");
    expect(out).toContain("฿300");
    expect(out).not.toContain("บ๊อบ"); // already paid
  });

  it("says so when nobody owes anything", async () => {
    expect(await run(inGroup("Uanna", "ตามเงิน"))).toContain("ไม่มียอดค้าง");
  });

  it("บิลค้าง lists the unfinished bills in plain words", async () => {
    await openBill();
    const out = await run(inGroup("Uanna", "บิลค้าง"));
    expect(out).toContain("หมูกระทะ");
    expect(out).toContain("รอปิดรายชื่อ");
  });
});

describe("private commands never answer in a group", () => {
  it("setting PromptPay in the group does nothing", async () => {
    expect(await run(inGroup("Uanna", "พร้อมเพย์ 0812345678"))).toBe("[]");
  });
});
