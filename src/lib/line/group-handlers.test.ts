import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupEntryRow, GroupRow } from "@/lib/group";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

const GID = "C-group-1";
const NOW = new Date("2026-10-18T05:00:00Z");

let group: GroupRow | null = null;
let ownerPlan = "ultimate";
let ownerLine = "Uowner";
let entries: (GroupEntryRow & { deleted?: boolean })[] = [];
let members = new Map<string, { name: string; updatedAt: string }>();
let ownedCount = 0;
let todayCount = 0;
let userPlan = "ultimate";
const opened: { lineGroupId: string; owner: string }[] = [];
const closed: string[] = [];
const upserts: { userId: string; name: string }[] = [];

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async (_db: unknown, lineUserId: string) => ({
    id: `app-${lineUserId}`,
    line_user_id: lineUserId,
    display_name: null,
    plan: userPlan,
    plan_expires_at: null,
  }),
}));
vi.mock("@/lib/group-repo", () => ({
  getGroup: async () => group,
  getOwner: async () => ({ lineUserId: ownerLine, plan: ownerPlan, planExpiresAt: null }),
  countOwnedGroups: async () => ownedCount,
  openGroup: async (_db: unknown, lineGroupId: string, owner: string) => {
    opened.push({ lineGroupId, owner });
    group = { id: "g1", lineGroupId, ownerUserId: owner, isActive: true };
    return group;
  },
  closeGroup: async (_db: unknown, lineGroupId: string) => {
    closed.push(lineGroupId);
    if (group) group = { ...group, isActive: false };
  },
  memberNames: async () => members,
  upsertMember: async (_db: unknown, _g: string, userId: string, name: string) => {
    upserts.push({ userId, name });
    members.set(userId, { name, updatedAt: NOW.toISOString() });
  },
  addEntries: async (
    _db: unknown,
    _g: string,
    payer: string,
    list: { title: string; amountSatang: number; occurredAt: Date }[],
  ) => {
    const rows = list.map((e, i) => ({
      id: `e${entries.length + i + 1}`,
      payerLineUserId: payer,
      title: e.title,
      amountSatang: e.amountSatang,
      occurredAt: e.occurredAt.toISOString(),
    }));
    entries.push(...rows);
    return rows;
  },
  recentEntries: async (_db: unknown, _g: string, limit: number, payer?: string) =>
    entries
      .filter((e) => !e.deleted && (!payer || e.payerLineUserId === payer))
      .slice()
      .reverse()
      .slice(0, limit),
  getEntry: async (_db: unknown, _g: string, id: string) =>
    entries.find((e) => e.id === id && !e.deleted) ?? null,
  deleteEntry: async (_db: unknown, _g: string, id: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e || e.deleted) return false;
    e.deleted = true;
    return true;
  },
  payerTotals: async () => {
    const by = new Map<string, { totalSatang: number; entries: number }>();
    for (const e of entries.filter((x) => !x.deleted)) {
      const cur = by.get(e.payerLineUserId) ?? { totalSatang: 0, entries: 0 };
      by.set(e.payerLineUserId, {
        totalSatang: cur.totalSatang + e.amountSatang,
        entries: cur.entries + 1,
      });
    }
    return [...by]
      .map(([lineUserId, v]) => ({ lineUserId, ...v }))
      .sort((a, b) => b.totalSatang - a.totalSatang);
  },
  countEntriesSince: async () => todayCount,
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
    getGroupMemberProfile: async (_g, u) => ({ displayName: u === "Uanna" ? "แอน" : "บ๊อบ" }),
    now: () => NOW,
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const said = (reply: ReturnType<typeof setup>["reply"]) =>
  JSON.stringify(reply.mock.calls.map((c) => c[1]));
const openBook = () => {
  group = { id: "g1", lineGroupId: GID, ownerUserId: "app-Uowner", isActive: true };
};

beforeEach(() => {
  group = null;
  ownerPlan = "ultimate";
  ownerLine = "Uowner";
  entries = [];
  members = new Map();
  ownedCount = 0;
  todayCount = 0;
  userPlan = "ultimate";
  opened.length = 0;
  closed.length = 0;
  upserts.length = 0;
});

describe("the bot joining and leaving", () => {
  it("greets the group when added, and closes the ledger when removed", async () => {
    let { deps, reply } = setup();
    await handleEvent(
      { type: "join", replyToken: "rt", source: { type: "group", groupId: GID } },
      deps,
    );
    expect(said(reply)).toContain("เปิดสมุดกลุ่ม");

    ({ deps, reply } = setup());
    await handleEvent({ type: "leave", source: { type: "group", groupId: GID } }, deps);
    expect(closed).toEqual([GID]);
  });
});

describe("เปิดสมุดกลุ่ม", () => {
  it("an Ultimate member opens it and becomes the owner", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uowner", "เปิดสมุดกลุ่ม"), deps);
    expect(opened).toEqual([{ lineGroupId: GID, owner: "app-Uowner" }]);
    expect(said(reply)).toContain("เปิดสมุดกลุ่มแล้ว");
  });

  it("a member who is not Ultimate is told it needs Ultimate", async () => {
    userPlan = "plus";
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uplus", "เปิดสมุดกลุ่ม"), deps);
    expect(opened).toHaveLength(0);
    expect(said(reply)).toContain("Ultimate");
  });

  it("already open by the same person, or by someone else with a running plan", async () => {
    openBook();
    let { deps, reply } = setup();
    await handleEvent(inGroup("Uowner", "เปิดสมุดกลุ่ม"), deps);
    expect(said(reply)).toContain("เปิดอยู่แล้ว");

    ({ deps, reply } = setup());
    await handleEvent(inGroup("Uother", "เปิดสมุดกลุ่ม"), deps);
    expect(opened).toHaveLength(0);
    expect(said(reply)).toContain("มีเจ้าของสมุดอยู่แล้ว");
  });

  it("when the owner's Ultimate has run out another Ultimate member may take over", async () => {
    openBook();
    ownerPlan = "free";
    const { deps } = setup();
    await handleEvent(inGroup("Uother", "เปิดสมุดกลุ่ม"), deps);
    expect(opened).toEqual([{ lineGroupId: GID, owner: "app-Uother" }]);
  });

  it("an owner of five ledgers cannot open a sixth", async () => {
    ownedCount = 5;
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uowner", "เปิดสมุดกลุ่ม"), deps);
    expect(opened).toHaveLength(0);
    expect(said(reply)).toContain("ครบ 5 กลุ่ม");
  });

  it("no LINE user id on the message: asks them to add the bot", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup(undefined, "เปิดสมุดกลุ่ม"), deps);
    expect(said(reply)).toContain("เพิ่มบอทเป็นเพื่อน");
  });
});

describe("จด", () => {
  beforeEach(openBook);

  it("records the entry to whoever typed it and names them", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "จด ข้าวเที่ยง 350"), deps);
    expect(entries[0]).toMatchObject({
      payerLineUserId: "Uanna",
      title: "ข้าวเที่ยง",
      amountSatang: 35_000,
    });
    expect(upserts).toEqual([{ userId: "Uanna", name: "แอน" }]);
    const text = said(reply);
    expect(text).toContain("จ่ายโดย แอน");
    expect(text).toContain("a=gdx&id=e1");
  });

  it("two people each get their own entries", async () => {
    const { deps } = setup();
    await handleEvent(inGroup("Uanna", "จด ข้าว 100"), deps);
    await handleEvent(inGroup("Ubob", "จด กาแฟ 50"), deps);
    expect(entries.map((e) => e.payerLineUserId)).toEqual(["Uanna", "Ubob"]);
  });

  it("the name is fetched once and then remembered", async () => {
    const { deps } = setup();
    await handleEvent(inGroup("Uanna", "จด ข้าว 100"), deps);
    await handleEvent(inGroup("Uanna", "จด ขนม 20"), deps);
    expect(upserts).toHaveLength(1);
  });

  it("several entries in one message", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "จด กาแฟ 90, ขนม 40"), deps);
    expect(entries).toHaveLength(2);
    expect(said(reply)).toContain("จดแล้ว 2 รายการ");
    expect(said(reply)).toContain("รวม ฿130");
  });

  it("ordinary chat with a number is never recorded, and gets no reply", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "กินข้าว 100 ไหม"), deps);
    await handleEvent(inGroup("Uanna", "55555 ตลกมาก"), deps);
    expect(entries).toHaveLength(0);
    expect(reply).not.toHaveBeenCalled();
  });

  it("refuses income, more than five entries, and nothing to record", async () => {
    let { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "จด +500 ขายของ"), deps);
    expect(said(reply)).toContain("จดรายจ่ายเท่านั้น");

    ({ deps, reply } = setup());
    await handleEvent(inGroup("Uanna", "จด a 1, b 2, c 3, d 4, e 5, f 6"), deps);
    expect(said(reply)).toContain("ไม่เกิน 5");

    ({ deps, reply } = setup());
    await handleEvent(inGroup("Uanna", "จด ข้าวอร่อยมาก"), deps);
    expect(said(reply)).toContain("จด ข้าวเที่ยง 350");
    expect(entries).toHaveLength(0);
  });

  it("stops at 300 entries a day for the group", async () => {
    todayCount = 299;
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "จด ข้าว 100, กาแฟ 50"), deps);
    expect(entries).toHaveLength(0);
    expect(said(reply)).toContain("300 รายการ");
  });

  it("asks someone the bot cannot identify to add it as a friend", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup(undefined, "จด ข้าว 100"), deps);
    expect(entries).toHaveLength(0);
    expect(said(reply)).toContain("เพิ่มบอทเป็นเพื่อน");
  });

  it("a group that was never opened is told how to open it", async () => {
    group = null;
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "จด ข้าว 100"), deps);
    expect(said(reply)).toContain("เปิดสมุดกลุ่ม");
  });

  it("when the owner's Ultimate has run out, writing stops but the summary still works", async () => {
    entries = [
      {
        id: "e0",
        payerLineUserId: "Uanna",
        title: "เก่า",
        amountSatang: 10_000,
        occurredAt: NOW.toISOString(),
      },
    ];
    members.set("Uanna", { name: "แอน", updatedAt: NOW.toISOString() });
    ownerPlan = "free";
    let { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "จด ข้าว 100"), deps);
    expect(said(reply)).toContain("หยุดจดชั่วคราว");
    expect(entries).toHaveLength(1);

    ({ deps, reply } = setup());
    await handleEvent(inGroup("Uanna", "สรุป"), deps);
    expect(said(reply)).toContain("รวมทั้งกลุ่ม");
  });
});

describe("สรุป / ล่าสุด / ลบล่าสุด", () => {
  beforeEach(() => {
    openBook();
    members.set("Uanna", { name: "แอน", updatedAt: NOW.toISOString() });
    members.set("Ubob", { name: "บ๊อบ", updatedAt: NOW.toISOString() });
    entries = [
      {
        id: "e1",
        payerLineUserId: "Uanna",
        title: "ข้าว",
        amountSatang: 30_000,
        occurredAt: NOW.toISOString(),
      },
      {
        id: "e2",
        payerLineUserId: "Ubob",
        title: "แท็กซี่",
        amountSatang: 70_000,
        occurredAt: NOW.toISOString(),
      },
    ];
  });

  it("the summary says who paid how much", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "สรุป"), deps);
    const text = said(reply);
    expect(text).toContain("฿1,000");
    expect(text).toContain("บ๊อบ");
    expect(text).toContain("฿700 · 70%");
    expect(text).toContain("แอน");
  });

  it("an empty period says so", async () => {
    entries = [];
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "สรุปวันนี้"), deps);
    expect(said(reply)).toContain("ยังไม่มีรายการ");
  });

  it("recent lists the entries with the payer's name", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "ล่าสุด"), deps);
    expect(said(reply)).toContain("แท็กซี่ ฿700 · บ๊อบ");
  });

  it("ลบล่าสุด removes the sender's own latest entry, not somebody else's", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "ลบล่าสุด"), deps);
    expect(entries.find((e) => e.id === "e1")?.deleted).toBe(true);
    expect(entries.find((e) => e.id === "e2")?.deleted).toBeUndefined();
    expect(said(reply)).toContain("ลบแล้ว: ข้าว");
  });

  it("someone with no entries has nothing to delete", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Ucarl", "ลบล่าสุด"), deps);
    expect(said(reply)).toContain("ไม่มีรายการของคุณให้ลบ");
  });
});

describe("the undo button", () => {
  beforeEach(() => {
    openBook();
    entries = [
      {
        id: "e1",
        payerLineUserId: "Uanna",
        title: "ข้าว",
        amountSatang: 30_000,
        occurredAt: NOW.toISOString(),
      },
    ];
  });

  it("the writer can remove it", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap("Uanna", "a=gdx&id=e1"), deps);
    expect(entries[0]?.deleted).toBe(true);
    expect(said(reply)).toContain("ลบแล้ว");
  });

  it("the owner can remove anybody's", async () => {
    const { deps } = setup();
    await handleEvent(tap("Uowner", "a=gdx&id=e1"), deps);
    expect(entries[0]?.deleted).toBe(true);
  });

  it("another member cannot", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap("Ubob", "a=gdx&id=e1"), deps);
    expect(entries[0]?.deleted).toBeUndefined();
    expect(said(reply)).toContain("ลบได้เฉพาะรายการของตัวเอง");
  });

  it("a second tap says it is gone", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap("Uanna", "a=gdx&id=e1"), deps);
    await handleEvent(tap("Uanna", "a=gdx&id=e1"), deps);
    expect(said(reply)).toContain("ไม่พบรายการนี้แล้ว");
  });
});

describe("ปิดสมุดกลุ่ม / ช่วยเหลือ", () => {
  beforeEach(openBook);

  it("only the owner can close it", async () => {
    let { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "ปิดสมุดกลุ่ม"), deps);
    expect(closed).toHaveLength(0);
    expect(said(reply)).toContain("เฉพาะเจ้าของสมุด");

    ({ deps, reply } = setup());
    await handleEvent(inGroup("Uowner", "ปิดสมุดกลุ่ม"), deps);
    expect(closed).toEqual([GID]);
  });

  it("help lists the commands", async () => {
    const { deps, reply } = setup();
    await handleEvent(inGroup("Uanna", "ช่วยเหลือ"), deps);
    expect(said(reply)).toContain("จด ข้าวเที่ยง 350");
  });
});

describe("what the group can never see", () => {
  it("personal commands typed in a group get no answer and touch nothing", async () => {
    openBook();
    const { deps, reply } = setup();
    for (const t of [
      "กระเป๋า",
      "หนี้",
      "เป้าหมาย",
      "บิล",
      "สรุปเดือนนี้ของฉัน",
      "ตังสะสม",
      "ค้นหา กาแฟ",
    ]) {
      await handleEvent(inGroup("Uanna", t), deps);
    }
    expect(reply).not.toHaveBeenCalled();
    expect(entries).toHaveLength(0);
  });

  it("a room (multi-person chat) is not handled", async () => {
    const { deps, reply } = setup();
    await handleEvent(
      {
        type: "message",
        replyToken: "rt",
        source: { type: "room", userId: "Uanna" },
        message: { type: "text", text: "จด ข้าว 100" },
      },
      deps,
    );
    expect(reply).not.toHaveBeenCalled();
  });
});
