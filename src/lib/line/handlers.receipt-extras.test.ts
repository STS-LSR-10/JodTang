import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TxRow } from "@/lib/repo";
import type { SlipCardExtras, SlipDeps } from "@/lib/slips";
import type { Wallet } from "@/lib/wallet";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { NOT_FOUND_TEXT, WALLET_SLIP_ASK_TEXT } from "./messages";

let plan = "plus";
let budgetMode: "overall" | "category" = "overall";
let budgetSpent = 1_557_400;
let todaySpent = 20_000;
let dailyBudget: string | null = null;
let wallets: Wallet[] = [];
let moved = 2;
const movedTo: { slipId: string; walletId: string | null }[] = [];
let slipDeps: SlipDeps | null = null;

const wallet = (over: Partial<Wallet>): Wallet => ({
  id: "w-cash",
  name: "เงินสด",
  kind: "cash",
  isDefault: true,
  openingSatang: 0,
  incomeSatang: 0,
  expenseSatang: 0,
  transferInSatang: 0,
  transferOutSatang: 0,
  debtInSatang: 0,
  debtOutSatang: 0,
  creditLimitSatang: null,
  statementDay: null,
  dueDay: null,
  entryCount: 0,
  ...over,
});

vi.mock("@/lib/slips", () => ({
  handleSlipImage: async (deps: SlipDeps) => {
    slipDeps = deps;
    return [{ type: "text", text: "slip ok" }];
  },
}));
vi.mock("@/lib/slip-repo", async (original) => ({
  ...(await original<typeof import("@/lib/slip-repo")>()),
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/photo-repo", () => ({
  getLivePhotoWait: async () => null,
  PHOTO_OFFER_WAIT_MINUTES: 3,
}));
vi.mock("@/lib/wallet-repo", async (original) => ({
  ...(await original<typeof import("@/lib/wallet-repo")>()),
  listWallets: async () => wallets,
  setSlipWallet: async (_d: unknown, _u: string, slipId: string, walletId: string | null) => {
    movedTo.push({ slipId, walletId });
    return moved;
  },
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
    confirm_style: "full",
    budget_cycle: "monthly",
    cycle_start_day: 1,
    daily_budget: dailyBudget,
  }),
  getBudgetMode: async () => budgetMode,
  loadBudgets: async () => [
    { category_id: null, amount: "15000.00" },
    { category_id: "c-food", amount: "3000.00" },
  ],
  loadCategories: async () => [{ id: "c-food", name: "อาหาร", type: "expense" }],
  expenseTotalSatang: async (_db: unknown, q: { from: Date; to: Date; categoryId?: string }) =>
    q.to.getTime() - q.from.getTime() < 2 * 86_400_000
      ? todaySpent
      : q.categoryId
        ? 290_000
        : budgetSpent,
}));

const USER_ID = "U" + "a".repeat(32);
const SLIP = "11111111-1111-1111-1111-111111111111";
const image: LineEvent = {
  type: "message",
  replyToken: "rt",
  source: { type: "user", userId: USER_ID },
  message: { type: "image", id: "img1" },
};
const tap = (data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: { type: "user", userId: USER_ID },
  postback: { data },
});
const tx = (over: Partial<TxRow> = {}): TxRow => ({
  id: "t1",
  type: "expense",
  title: "x",
  amount: "300.00",
  category_id: null,
  occurred_at: "2026-10-17T08:00:00Z",
  status: "confirmed",
  slip_id: SLIP,
  ...over,
});

function setup() {
  const reply = vi.fn<(token: string, messages: unknown[]) => Promise<undefined>>(
    async () => undefined,
  );
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply,
    getProfile: async () => null,
    now: () => new Date("2026-10-18T05:00:00Z"),
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
    slip: {
      fetchImage: async () => ({ bytes: new Uint8Array(1), mimeType: "image/jpeg" }),
      ocr: { name: "t", extract: async () => ({}) } as never,
    },
  };
  return { deps, reply };
}
/** Run an image through the handler and ask for the extras it gave the slip reader. */
async function extrasFor(made: TxRow[]): Promise<SlipCardExtras> {
  const { deps } = setup();
  await handleEvent(image, deps);
  if (!slipDeps?.extras) throw new Error("no extras were passed to the slip reader");
  return slipDeps.extras(made);
}
const firstText = (reply: ReturnType<typeof setup>["reply"]) =>
  ((reply.mock.calls[0] as unknown as [string, { text?: string }[]])[1][0] ?? {}).text;

beforeEach(() => {
  plan = "plus";
  budgetMode = "overall";
  budgetSpent = 1_557_400;
  todaySpent = 20_000;
  dailyBudget = null;
  wallets = [wallet({})];
  moved = 2;
  movedTo.length = 0;
  slipDeps = null;
});

describe("what a slip card carries under its rows", () => {
  it("the overall budget with the warning when this slip crossed a line, and the cycle", async () => {
    const e = await extrasFor([tx()]); // ฿300 of ฿15,574 spent: was ฿15,274, already over -> no warning
    expect(e.budgets).toEqual([
      { scopeName: null, spentSatang: 1_557_400, limitSatang: 1_500_000, level: "over" },
    ]);
    expect(e.cycleLabel).toBe("รายเดือน (วันที่ 1)");
    budgetSpent = 1_510_000;
    const crossed = await extrasFor([tx({ amount: "300.00" })]); // from ฿14,800 to ฿15,100
    expect(crossed.notices?.[0]?.level).toBe("over");
    expect(crossed.notices?.[0]?.text).toContain("เกินงบ");
  });

  it("a category budget per category when the mode is category", async () => {
    budgetMode = "category";
    const e = await extrasFor([
      tx({ id: "a", category_id: "c-food", amount: "50.00" }),
      tx({ id: "b", category_id: "c-food", amount: "100.00" }),
    ]);
    expect(e.budgets).toHaveLength(1); // both rows count against the same category budget
    expect(e.budgets?.[0]).toMatchObject({ scopeName: "อาหาร", limitSatang: 300_000 });
  });

  it("the daily-limit warning comes along", async () => {
    dailyBudget = "500.00";
    todaySpent = 62_000;
    budgetSpent = 400_000;
    const e = await extrasFor([tx({ occurred_at: "2026-10-18T05:00:00Z", amount: "300.00" })]);
    expect(JSON.stringify(e.notices)).toContain("฿120");
  });

  it("a payment row with two wallets, none with one", async () => {
    expect((await extrasFor([tx()])).payment).toBeUndefined();
    wallets = [wallet({}), wallet({ id: "w-ktc", name: "KTC", kind: "card", isDefault: false })];
    const e = await extrasFor([tx()]);
    expect(e.payment?.choices.map((c) => [c.id, c.selected])).toEqual([
      ["w-cash", true],
      ["w-ktc", false],
    ]);
    expect(e.payment?.more).toBe(false);
  });

  it("no budget block when nothing applies (income-only is not a slip, so: no entries)", async () => {
    const e = await extrasFor([]);
    expect(e.budgets).toEqual([]);
    expect(e.notices).toEqual([]);
  });
});

describe("the จ่ายด้วย row of a slip card", () => {
  beforeEach(() => {
    wallets = [wallet({}), wallet({ id: "w-ktc", name: "KTC", kind: "card", isDefault: false })];
  });

  it("moves every entry of the slip to the wallet that was tapped", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap(`a=wms&s=${SLIP}&w=w-ktc`), deps);
    expect(movedTo).toEqual([{ slipId: SLIP, walletId: "w-ktc" }]);
    expect(firstText(reply)).toContain("ย้ายทั้ง 2 รายการไป");
    expect(firstText(reply)).toContain("KTC");
  });

  it("the main wallet is stored as none", async () => {
    const { deps } = setup();
    await handleEvent(tap(`a=wms&s=${SLIP}&w=w-cash`), deps);
    expect(movedTo).toEqual([{ slipId: SLIP, walletId: null }]);
  });

  it("an unknown wallet, a slip with nothing left, or a made-up id changes nothing", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap(`a=wms&s=${SLIP}&w=nope`), deps);
    expect(firstText(reply)).toBe(NOT_FOUND_TEXT);
    moved = 0;
    await handleEvent(tap(`a=wms&s=${SLIP}&w=w-ktc`), deps);
    await handleEvent(tap("a=wms&s=../x&w=w-ktc"), deps);
    expect(movedTo).toHaveLength(1); // only the empty-slip attempt reached the repo
  });

  it("อื่น ๆ lists the wallets, each button moving the whole slip", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap(`a=wls&s=${SLIP}`), deps);
    const msg = (reply.mock.calls[0]?.[1] as { text?: string; quickReply?: unknown }[])[0];
    expect(msg?.text).toBe(WALLET_SLIP_ASK_TEXT);
    expect(JSON.stringify(msg?.quickReply)).toContain(`a=wms&s=${SLIP}&w=w-ktc`);
  });
});
