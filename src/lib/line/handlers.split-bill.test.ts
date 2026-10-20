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
const usedSlips = new Set<string>();
const usage = new Map<string, number>();
let seq = 0;
const slipImages: number[] = [];
let slipLimited = false;
let fetchFails = false;
let ocrFails = false;
let slipRaw: Record<string, unknown> = {};

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
  claimPaid: async (_db: unknown, id: string, user: string) => {
    const bill = bills.find((b) => b.id === id);
    const m = billMembers[id]?.find((x) => x.lineUserId === user);
    if (bill?.status !== "collecting" || !m) return "none";
    if (m.paid || m.claimed) return "already";
    m.claimed = true;
    return "ok";
  },
  unpay: async (_db: unknown, id: string, user: string) => {
    const bill = bills.find((b) => b.id === id);
    const m = billMembers[id]?.find((x) => x.lineUserId === user);
    if (!bill || !m || !m.paid || user === bill.payerLineUserId) return "none";
    m.paid = false;
    m.paidVia = null;
    bill.status = "collecting";
    return "ok";
  },
  slipUsed: async (_db: unknown, sha: string | null, ref: string | null) =>
    (sha !== null && usedSlips.has(`sha:${sha}`)) || (ref !== null && usedSlips.has(`ref:${ref}`)),
  openSharesOf: async (_db: unknown, _g: string, user: string) =>
    bills
      .filter((b) => b.status === "collecting")
      .flatMap((bill) => {
        const m = billMembers[bill.id]?.find((x) => x.lineUserId === user);
        return m && !m.paid && m.shareSatang !== null ? [{ bill, shareSatang: m.shareSatang }] : [];
      }),
  payBySlip: async (
    _db: unknown,
    input: {
      billId: string;
      lineUserId: string;
      sha256: string;
      reference: string | null;
      receiverVerified: boolean;
    },
  ) => {
    const bill = bills.find((b) => b.id === input.billId);
    const m = billMembers[input.billId]?.find((x) => x.lineUserId === input.lineUserId);
    if (bill?.status !== "collecting" || !m) return "none";
    if (m.paid) return "already";
    if (
      usedSlips.has(`sha:${input.sha256}`) ||
      (input.reference && usedSlips.has(`ref:${input.reference}`))
    ) {
      return "duplicate";
    }
    usedSlips.add(`sha:${input.sha256}`);
    if (input.reference) usedSlips.add(`ref:${input.reference}`);
    m.paid = true;
    m.claimed = false;
    m.paidVia = input.receiverVerified ? "slip" : "slip_unverified";
    if (billMembers[input.billId]?.every((x) => x.paid)) bill.status = "settled";
    return "ok";
  },
}));

const inGroup = (userId: string | undefined, t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "group", groupId: GID, userId },
  message: { type: "text", id: "1", text: t },
});
const photo = (userId: string | undefined): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "group", groupId: GID, userId },
  message: { type: "image", id: "img1" },
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
    db: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        const key = `${args.p_kind}|${args.p_month}`;
        if (fn === "take_usage") {
          const used = usage.get(key) ?? 0;
          if (used >= (args.p_limit as number)) return { data: false, error: null };
          usage.set(key, used + 1);
          return { data: true, error: null };
        }
        usage.set(key, Math.max(0, (usage.get(key) ?? 0) - 1));
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient,
    reply,
    getProfile: async () => null,
    getGroupMemberProfile: async (_g, u) => ({ displayName: NAMES[u] ?? "ใครสักคน" }),
    now: () => NOW,
    limit: async (bucket) => ({
      allowed: !(bucket === "group_slip" && slipLimited),
      hits: 1,
      limit: 30,
    }),
    slip: {
      fetchImage: async () => {
        if (fetchFails) throw new Error("download failed");
        return { bytes: new Uint8Array([slipImages.length, 1, 2, 3]), mimeType: "image/jpeg" };
      },
      ocr: {
        name: "fake",
        extract: async () => {
          slipImages.push(1);
          if (ocrFails) throw new Error("model down");
          return slipRaw;
        },
      } as never,
    },
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
  usedSlips.clear();
  usage.clear();
  slipImages.length = 0;
  slipLimited = false;
  fetchFails = false;
  ocrFails = false;
  slipRaw = {};
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

const slipOf = (over: Record<string, unknown> = {}) => ({
  is_slip: true,
  kind: "transfer",
  amount: 300,
  paid_at: "2026-10-18T12:05:00+07:00",
  payee_name: "แอน ใจดี",
  payee_account: "xxx-x-x5678-x",
  reference: "REF123456",
  ...over,
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

describe("โอนแล้ว (a friend says they paid)", () => {
  beforeEach(async () => {
    await openBill(900);
    await run(tap("Uanna", "a=gbc&b=b1"));
  });

  it("the button marks it waiting, asks the payer to confirm, and the card shows it", async () => {
    const out = await run(tap("Ubob", "a=gbm&b=b1"));
    expect(out).toContain("บ๊อบ แจ้งว่าโอน");
    expect(out).toContain("฿300");
    expect(out).toContain("a=gbp&b=b1&u=Ubob"); // one tap for the payer to confirm
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")).toMatchObject({
      claimed: true,
      paid: false,
    });
    const card = await run(inGroup("Uanna", "ตามเงิน"));
    expect(card).toContain("บ๊อบ"); // still owes until the payer confirms
  });

  it("the payer's tick then makes it paid; saying it twice does nothing new", async () => {
    await run(tap("Ubob", "a=gbm&b=b1"));
    expect(await run(tap("Ubob", "a=gbm&b=b1"))).toContain("แจ้งโอนไปแล้ว");
    await run(tap("Uanna", "a=gbp&b=b1&u=Ubob"));
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")?.paid).toBe(true);
  });

  it("the typed 'โอนแล้ว' works when there is one open bill; with two it points at the buttons", async () => {
    expect(await run(inGroup("Ubob", "โอนแล้ว"))).toContain("บ๊อบ แจ้งว่าโอน");
    await run(inGroup("Uanna", "หารบิล ขนม 600"));
    await run(tap("Uchom", "a=gbj&b=b2"));
    await run(tap("Ubob", "a=gbj&b=b2"));
    await run(tap("Uanna", "a=gbc&b=b2"));
    expect(await run(inGroup("Uchom", "โอนแล้ว"))).toContain("หลายบิล");
  });

  it("someone with nothing to pay, or not on the bill, is told", async () => {
    expect(await run(inGroup("Uowner", "โอนแล้ว"))).toContain("ไม่มียอดค้าง");
    expect(await run(tap("Uowner", "a=gbm&b=b1"))).toContain("ไม่ได้อยู่ในรายชื่อ");
    await run(tap("Uanna", "a=gbp&b=b1&u=Ubob"));
    expect(await run(tap("Ubob", "a=gbm&b=b1"))).toContain("แจ้งโอนไปแล้ว");
  });

  it("the payer can take a tick back, nobody else can, and a settled bill goes back to collecting", async () => {
    await run(tap("Uanna", "a=gbp&b=b1&u=Ubob"));
    await run(tap("Uanna", "a=gbp&b=b1&u=Uchom"));
    expect(bills[0]?.status).toBe("settled");
    expect(await run(tap("Ubob", "a=gbu&b=b1&u=Uchom"))).toContain("เฉพาะคนที่จ่ายบิลนี้");
    expect(await run(tap("Uanna", "a=gbu&b=b1&u=Uchom"))).toContain("ยกเลิกการรับเงินจาก ชมพู");
    expect(bills[0]?.status).toBe("collecting");
    expect(billMembers.b1?.find((m) => m.lineUserId === "Uchom")?.paid).toBe(false);
    expect(await run(inGroup("Uanna", "ยังไม่ได้รับ บ๊อบ"))).toContain("ยกเลิกการรับเงินจาก บ๊อบ");
    expect(await run(tap("Uanna", "a=gbu&b=b1&u=Uanna"))).toContain("ยังไม่ได้ถูกติ๊ก"); // never the payer's own share
  });
});

describe("a slip sent into the group", () => {
  beforeEach(async () => {
    payments.set("Uanna", {
      promptpayId: "0812345678",
      bankName: null,
      bankAccount: null,
      accountName: null,
    });
    await openBill(900);
    await run(tap("Uanna", "a=gbc&b=b1"));
    slipRaw = slipOf();
  });

  it("pays the share when the amount and the receiver fit (and says it was checked)", async () => {
    const out = await run(photo("Ubob"));
    expect(out).toContain("บ๊อบ จ่ายส่วนของ");
    expect(out).toContain("ตรวจสลิปแล้ว");
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")).toMatchObject({
      paid: true,
      paidVia: "slip",
    });
    expect(out).toContain("ตรวจสลิปแล้ว"); // the card shows how it was paid too
  });

  it("an amount over the share is accepted and mentioned", async () => {
    slipRaw = slipOf({ amount: 500 });
    expect(await run(photo("Ubob"))).toContain("โอนเกินมา ฿200");
  });

  it("an amount under the share does not pay it", async () => {
    slipRaw = slipOf({ amount: 250 });
    const out = await run(photo("Ubob"));
    expect(out).toContain("ยอดยังไม่ครบ");
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")?.paid).toBe(false);
  });

  it("a receiver that is not the payer's account does not pay it", async () => {
    slipRaw = slipOf({ payee_account: "xxx-x-x9999-x" });
    const out = await run(photo("Ubob"));
    expect(out).toContain("ไม่ตรงกับของ แอน");
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")?.paid).toBe(false);
  });

  it("a receiver the slip does not show still pays, marked unverified, with a button to take it back", async () => {
    slipRaw = slipOf({ payee_account: null });
    const out = await run(photo("Ubob"));
    expect(out).toContain("อ่านผู้รับในสลิปไม่ได้");
    expect(out).toContain("a=gbu&b=b1&u=Ubob");
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")?.paidVia).toBe("slip_unverified");
  });

  it("a payer with no account set cannot be checked either, and it is marked unverified", async () => {
    payments.clear();
    await run(photo("Ubob"));
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")?.paidVia).toBe("slip_unverified");
  });

  it("a slip made before the bill was opened cannot pay it", async () => {
    slipRaw = slipOf({ paid_at: "2026-10-17T09:00:00+07:00" });
    expect(await run(photo("Ubob"))).toContain("ทำก่อนเปิดบิล");
    expect(billMembers.b1?.find((m) => m.lineUserId === "Ubob")?.paid).toBe(false);
  });

  it("the same slip cannot pay twice, by picture or by the bank's reference", async () => {
    await run(photo("Ubob"));
    expect(await run(photo("Uchom"))).toContain("เคยใช้จ่ายไปแล้ว"); // same reference, another picture
    expect(billMembers.b1?.find((m) => m.lineUserId === "Uchom")?.paid).toBe(false);
  });

  it("pictures from people who owe nothing, and pictures that are not slips, get no answer at all", async () => {
    expect(await run(photo("Uowner"))).toBe("[]");
    expect(await run(photo(undefined))).toBe("[]");
    expect(slipImages).toHaveLength(0); // and nothing was read
    slipRaw = { is_slip: false };
    expect(await run(photo("Ubob"))).toBe("[]");
    expect(usage.get(`group_slip|2026-10-01`)).toBe(0); // the use was given back
  });

  it("a blurry slip says so and gives the use back; so do a failed download and a failed reading", async () => {
    slipRaw = { is_slip: true, kind: "transfer", amount: null };
    expect(await run(photo("Ubob"))).toContain("อ่านสลิปไม่ชัด");
    expect(usage.get(`group_slip|2026-10-01`)).toBe(0);
    fetchFails = true;
    expect(await run(photo("Ubob"))).toContain("โหลดรูปไม่สำเร็จ");
    fetchFails = false;
    ocrFails = true;
    expect(await run(photo("Ubob"))).toContain("อ่านสลิปไม่สำเร็จ");
    expect(usage.get(`group_slip|2026-10-01`)).toBe(0);
  });

  it("a read-only ledger, a busy sender and a used-up month do not read pictures", async () => {
    ownerPlan = "free";
    expect(await run(photo("Ubob"))).toBe("[]");
    ownerPlan = "ultimate";
    slipLimited = true;
    expect(await run(photo("Ubob"))).toBe("[]");
    slipLimited = false;
    usage.set("group_slip|2026-10-01", 300);
    expect(await run(photo("Ubob"))).toContain("ครบเกณฑ์แล้ว");
    expect(slipImages).toHaveLength(0);
  });

  it("the last share to be paid settles the bill", async () => {
    await run(photo("Ubob"));
    slipRaw = slipOf({ reference: "REF999999" });
    const out = await run(photo("Uchom"));
    expect(out).toContain("เก็บครบแล้ว");
    expect(bills[0]?.status).toBe("settled");
  });
});
