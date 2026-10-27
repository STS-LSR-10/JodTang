import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

let plan = "free";
let claim = true;
let trialUsed = false;
const saved: Record<string, unknown>[] = [];
const trials: unknown[] = [];

vi.mock("@/lib/upsell", async (original) => ({
  ...(await original<typeof import("@/lib/upsell")>()),
  claimUpsellCard: async () => claim,
}));
vi.mock("@/lib/payments/billing-state", () => ({
  loadBillingState: async () => ({ plan, trialsUsed: trialUsed ? ["plus"] : [] }),
}));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan,
    plan_expires_at: null,
  }),
  getSettings: async () => ({
    confirm_style: "short",
    budget_cycle: "monthly",
    cycle_start_day: 1,
  }),
  getBudgetMode: async () => "overall",
  loadBudgets: async () => [],
  loadCategories: async () => [],
  loadMemoryFor: async () => [],
  expenseTotalSatang: async () => 0,
  categoryTotalSatang: async () => 0,
  insertTransaction: async (_db: unknown, input: Record<string, unknown>) => {
    saved.push(input);
    return {
      id: "t1",
      status: input.status,
      type: input.type,
      title: input.title,
      amount: String((input.amountSatang as number) / 100),
      occurred_at: (input.occurredAt as Date).toISOString(),
      category_id: null,
      slip_id: null,
    };
  },
}));

const NOW = new Date("2026-10-18T05:00:00Z");
const user = { type: "user" as const, userId: "U" + "a".repeat(32) };
const say = (t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: user,
  message: { type: "text", id: "1", text: t },
});
const tap = (data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: user,
  postback: { data },
});

function setup() {
  const reply = vi.fn<(token: string, messages: unknown[]) => Promise<undefined>>(
    async () => undefined,
  );
  const db = {
    from: () => ({ upsert: async () => ({ error: null }) }),
    rpc: async (fn: string, args: unknown) => {
      if (fn === "start_plan_trial") {
        trials.push(args);
        return { data: trialUsed ? null : "2026-10-25T05:00:00Z", error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  const deps: HandlerDeps = {
    db,
    reply,
    getProfile: async () => null,
    now: () => NOW,
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const everything = (reply: ReturnType<typeof setup>["reply"]) =>
  JSON.stringify(reply.mock.calls.map((c) => c[1]));

beforeEach(() => {
  plan = "free";
  claim = true;
  trialUsed = false;
  saved.length = 0;
  trials.length = 0;
});

describe("upgrade pitches in the chat", () => {
  it("a backdated entry from Free saves nothing and gets the card", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("เมื่อวาน ข้าวผัด 60"), deps);
    expect(saved).toHaveLength(0);
    const text = everything(reply);
    expect(text).toContain('"type":"flex"');
    expect(text).toContain("a=trial&p=plus");
    expect(text).toContain("a=bdt");
  });

  it("the second time that day it is the short text, not the card", async () => {
    claim = false;
    const { deps, reply } = setup();
    await handleEvent(say("เมื่อวาน ข้าวผัด 60"), deps);
    expect(everything(reply)).not.toContain('"type":"flex"');
    expect(everything(reply)).toContain("ยังไม่ได้จดรายการนี้");
  });

  it("'record as today' saves the same entry dated today", async () => {
    const { deps } = setup();
    await handleEvent(tap(`a=bdt&t=${encodeURIComponent("เมื่อวาน ข้าวผัด 60")}`), deps);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.title).toContain("ข้าวผัด");
    expect((saved[0]?.occurredAt as Date).toISOString()).toBe(NOW.toISOString());
  });

  it("the trial button starts the Pro trial once", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap("a=trial&p=plus"), deps);
    expect(trials).toHaveLength(1);
    expect(everything(reply)).toContain("ทดลองใช้ Pro ฟรี 7 วันแล้ว");

    trialUsed = true;
    const again = setup();
    await handleEvent(tap("a=trial&p=plus"), again.deps);
    expect(everything(again.reply)).toContain("เริ่มทดลองใช้ไม่ได้");
  });

  it("Pro is never pitched", async () => {
    plan = "plus";
    const { deps, reply } = setup();
    await handleEvent(say("เมื่อวาน ข้าวผัด 60"), deps);
    expect(saved).toHaveLength(1);
    expect(everything(reply)).not.toContain("a=trial");
  });
});
