import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, newDb, newUser, one, rows } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await newDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("migrations", () => {
  it("run cleanly a second time (idempotent)", async () => {
    await expect(applyMigrations(db)).resolves.toBeUndefined();
  }, 60_000);

  it("seed exactly the 19 system categories, even after re-running", async () => {
    const r = await one<{ n: number }>(
      db,
      "select count(*)::int as n from categories where user_id is null",
    );
    expect(r.n).toBe(19);
    const kinds = await rows<{ type: string; n: number }>(
      db,
      "select type::text as type, count(*)::int as n from categories where user_id is null group by 1 order by 1",
    );
    expect(kinds).toEqual([
      { type: "expense", n: 12 },
      { type: "income", n: 7 },
    ]);
  });

  it("create the bucket row as private", async () => {
    const b = await one<{ public: boolean }>(
      db,
      "select public from storage.buckets where id = 'slips'",
    );
    expect(b.public).toBe(false);
  });

  it("give every new user a unique 8-character referral code", async () => {
    const a = await newUser(db, "code-a");
    const b = await newUser(db, "code-b");
    const codes = await rows<{ referral_code: string }>(
      db,
      "select referral_code from users where id in ($1, $2)",
      [a, b],
    );
    expect(new Set(codes.map((c) => c.referral_code)).size).toBe(2);
    for (const c of codes) expect(c.referral_code).toMatch(/^[0-9A-F]{8}$/);
  });
});

describe("constraints", () => {
  it("reject non-positive amounts and bad budget start days", async () => {
    const u = await newUser(db, "constraints");
    await expect(
      db.query(
        "insert into transactions (user_id, type, amount, title) values ($1,'expense',0,'x')",
        [u],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("update user_settings set cycle_start_day = 31 where user_id = $1", [u]),
    ).rejects.toThrow();
    await expect(
      db.query("update user_settings set budget_mode = 'weird' where user_id = $1", [u]),
    ).rejects.toThrow();
  });

  it("allow one overall budget and one budget per category only", async () => {
    const u = await newUser(db, "budgets");
    const cat = await one<{ id: string }>(db, "select id from categories where name = 'อาหาร'");
    await db.query("insert into budgets (user_id, amount) values ($1, 100)", [u]);
    await expect(
      db.query("insert into budgets (user_id, amount) values ($1, 200)", [u]),
    ).rejects.toThrow();
    await db.query("insert into budgets (user_id, category_id, amount) values ($1,$2,50)", [
      u,
      cat.id,
    ]);
    await expect(
      db.query("insert into budgets (user_id, category_id, amount) values ($1,$2,60)", [u, cat.id]),
    ).rejects.toThrow();
  });

  it("slips: the same image hash or reference cannot be stored twice per user", async () => {
    const u = await newUser(db, "slips");
    const v = await newUser(db, "slips-other");
    const ins = (user: string, hash: string, ref: string | null) =>
      db.query(
        "insert into slips (user_id, storage_path, image_sha256, slip_ref) values ($1,'p',$2,$3)",
        [user, hash, ref],
      );
    await ins(u, "h1", "R1");
    await expect(ins(u, "h1", "R2")).rejects.toThrow(); // same image
    await expect(ins(u, "h2", "R1")).rejects.toThrow(); // same reference
    await ins(v, "h1", "R1"); // another user may have the same values
    await ins(u, "h3", null);
    await ins(u, "h4", null); // missing references never collide
  });
});

describe("summary and analytics functions", () => {
  it("add up confirmed entries only, in satang-exact numeric", async () => {
    const u = await newUser(db, "sums");
    const food = await one<{ id: string }>(
      db,
      "select id from categories where name = 'อาหาร' and user_id is null",
    );
    const add = (
      type: string,
      amount: string,
      at: string,
      status = "confirmed",
      cat: string | null = food.id,
    ) =>
      db.query(
        "insert into transactions (user_id,type,amount,title,category_id,occurred_at,status) values ($1,$2,$3,'t',$4,$5,$6)",
        [u, type, amount, cat, at, status],
      );
    await add("income", "1000.00", "2026-10-10T05:00:00Z");
    await add("expense", "250.50", "2026-10-11T05:00:00Z");
    await add("expense", "0.10", "2026-10-12T05:00:00Z");
    await add("expense", "999.00", "2026-10-12T05:00:00Z", "deleted"); // ignored
    await add("expense", "999.00", "2026-10-12T05:00:00Z", "pending_confirm"); // ignored
    await add("expense", "5.00", "2026-09-01T05:00:00Z"); // outside the range

    const s = await one<{ income: string; expense: string; balance: string; tx_count: string }>(
      db,
      "select * from summary_by_period($1, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')",
      [u],
    );
    expect(Number(s.income)).toBe(1000);
    expect(Number(s.expense)).toBe(250.6);
    expect(Number(s.balance)).toBe(749.4);
    expect(Number(s.tx_count)).toBe(3);

    const cats = await rows<{ name: string; total: string }>(
      db,
      "select name, total from spend_by_category($1, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')",
      [u],
    );
    expect(cats).toHaveLength(1);
    expect(cats[0]?.name).toBe("อาหาร");
    expect(Number(cats[0]?.total)).toBe(250.6);
  });

  it("analytics_series buckets by Bangkok month and week", async () => {
    const u = await newUser(db, "series");
    // 2026-09-30 18:00 UTC is already 1 Oct in Bangkok
    await db.query(
      "insert into transactions (user_id,type,amount,title,occurred_at) values ($1,'expense',10,'a','2026-09-30T18:00:00Z'), ($1,'expense',20,'b','2026-10-15T05:00:00Z'), ($1,'income',500,'c','2026-10-20T05:00:00Z')",
      [u],
    );
    const months = await rows<{ bucket_start: Date; income: string; expense: string }>(
      db,
      "select * from analytics_series($1,'2026-09-01T00:00:00Z','2026-11-30T00:00:00Z','month')",
      [u],
    );
    expect(months).toHaveLength(1);
    expect(new Date(months[0]?.bucket_start as Date).toISOString()).toBe(
      "2026-09-30T17:00:00.000Z",
    );
    expect(Number(months[0]?.expense)).toBe(30);
    expect(Number(months[0]?.income)).toBe(500);

    const weeks = await rows(
      db,
      "select * from analytics_series($1,'2026-09-01T00:00:00Z','2026-11-30T00:00:00Z','week')",
      [u],
    );
    expect(weeks.length).toBeGreaterThan(1);

    const bad = await rows(
      db,
      "select * from analytics_series($1,'2026-09-01T00:00:00Z','2026-11-30T00:00:00Z','year')",
      [u],
    );
    expect(bad).toEqual([]); // an unknown bucket returns nothing instead of arbitrary SQL
  });
});

describe("points, redeem and referral", () => {
  it("award_points is idempotent per (user, reason, ref)", async () => {
    const u = await newUser(db, "award");
    const first = await one<{ award_points: boolean }>(
      db,
      "select award_points($1, 1, 'daily', '2026-10-16')",
      [u],
    );
    const again = await one<{ award_points: boolean }>(
      db,
      "select award_points($1, 1, 'daily', '2026-10-16')",
      [u],
    );
    const nextDay = await one<{ award_points: boolean }>(
      db,
      "select award_points($1, 1, 'daily', '2026-10-17')",
      [u],
    );
    expect([first.award_points, again.award_points, nextDay.award_points]).toEqual([
      true,
      false,
      true,
    ]);
    const p = await one<{ points: number }>(db, "select points from users where id = $1", [u]);
    expect(p.points).toBe(2);
  });

  it("redeem_points buys whole days, extends from the current expiry, refuses overdraw", async () => {
    const u = await newUser(db, "redeem");
    await db.query("update users set points = 25 where id = $1", [u]);
    const r = await one<{ redeem_points: Date }>(db, "select redeem_points($1, 20, 2)", [u]);
    const days = (new Date(r.redeem_points).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(1.9);
    expect(days).toBeLessThan(2.1);
    expect(
      (await one<{ points: number }>(db, "select points from users where id=$1", [u])).points,
    ).toBe(5);

    // stacking: a second redeem extends the existing expiry
    await db.query("update users set points = 10 where id = $1", [u]);
    const r2 = await one<{ redeem_points: Date }>(db, "select redeem_points($1, 10, 1)", [u]);
    expect(new Date(r2.redeem_points).getTime() - new Date(r.redeem_points).getTime()).toBeCloseTo(
      86_400_000,
      -3,
    );

    await expect(db.query("select redeem_points($1, 10, 1)", [u])).rejects.toThrow(
      /not_enough_points/,
    );
    expect(
      (await one<{ points: number }>(db, "select points from users where id=$1", [u])).points,
    ).toBe(0);
    const ledger = await rows<{ delta: number }>(
      db,
      "select delta from point_ledger where user_id=$1 and reason='redeem'",
      [u],
    );
    expect(ledger.map((l) => l.delta)).toEqual([-20, -10]);
  });

  it("apply_referral validates the code, the owner and the time window", async () => {
    const referrer = await newUser(db, "ref-owner");
    const code = (
      await one<{ referral_code: string }>(db, "select referral_code from users where id=$1", [
        referrer,
      ])
    ).referral_code;
    const friend = await newUser(db, "ref-friend");
    const apply = async (user: string, c: string) =>
      (await one<{ apply_referral: string }>(db, "select apply_referral($1,$2,14)", [user, c]))
        .apply_referral;

    expect(await apply(friend, "NOPE0000")).toBe("invalid");
    expect(await apply(referrer, code)).toBe("self");
    expect(await apply(friend, code.toLowerCase())).toBe("ok"); // case-insensitive
    expect(await apply(friend, code)).toBe("already");

    const old = await newUser(db, "ref-old");
    await db.query("update users set created_at = now() - interval '30 days' where id=$1", [old]);
    expect(await apply(old, code)).toBe("expired");
  });

  it("grant_referral_bonus pays both sides exactly once", async () => {
    const referrer = await newUser(db, "bonus-owner");
    const code = (
      await one<{ referral_code: string }>(db, "select referral_code from users where id=$1", [
        referrer,
      ])
    ).referral_code;
    const friend = await newUser(db, "bonus-friend");
    const loner = await newUser(db, "bonus-none");
    await db.query("select apply_referral($1,$2,14)", [friend, code]);

    const grant = async (u: string) =>
      (
        await one<{ grant_referral_bonus: boolean }>(db, "select grant_referral_bonus($1,10,7)", [
          u,
        ])
      ).grant_referral_bonus;
    expect(await grant(loner)).toBe(false); // nobody referred them
    expect(await grant(friend)).toBe(true);
    expect(await grant(friend)).toBe(false); // never twice

    const pts = async (u: string) =>
      (await one<{ points: number }>(db, "select points from users where id=$1", [u])).points;
    expect(await pts(referrer)).toBe(10);
    expect(await pts(friend)).toBe(7);
  });
});

describe("check_rate_limit", () => {
  it("counts hits per key and blocks over the limit", async () => {
    const hit = async (key: string) =>
      one<{ is_allowed: boolean; hits_in_window: number }>(
        db,
        "select * from check_rate_limit($1, 3, 3600)",
        [key],
      );
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit("k1"));
    expect(results.map((r) => r.is_allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((r) => r.hits_in_window)).toEqual([1, 2, 3, 4, 5]);
    expect((await hit("k2")).hits_in_window).toBe(1); // other keys are independent
  });

  it("rejects nonsense parameters", async () => {
    await expect(db.query("select * from check_rate_limit('x', 0, 60)")).rejects.toThrow(
      /invalid_rate_limit/,
    );
    await expect(db.query("select * from check_rate_limit('x', 5, 0)")).rejects.toThrow(
      /invalid_rate_limit/,
    );
  });
});

describe("deleting a user (erase-my-data)", () => {
  it("cascades through every table that stores their data", async () => {
    const u = await newUser(db, "erase-me");
    const keeper = await newUser(db, "keeper");
    await db.query("update users set referred_by = $1 where id = $2", [keeper, u]);
    const cat = await one<{ id: string }>(
      db,
      "insert into categories (user_id,type,name) values ($1,'expense','mine') returning id",
      [u],
    );
    const slip = await one<{ id: string }>(
      db,
      "insert into slips (user_id,storage_path,image_sha256) values ($1,'p','erase-h') returning id",
      [u],
    );
    await db.query(
      "insert into transactions (user_id,type,amount,title,category_id,slip_id) values ($1,'expense',5,'x',$2,$3)",
      [u, cat.id, slip.id],
    );
    await db.query("insert into budgets (user_id,category_id,amount) values ($1,$2,10)", [
      u,
      cat.id,
    ]);
    await db.query("insert into accounts (user_id,name) values ($1,'cash')", [u]);
    await db.query(
      "insert into merchant_memory (user_id,match_text,category_id) values ($1,'shop',$2)",
      [u, cat.id],
    );
    await db.query(
      "insert into recurring_rules (user_id,type,amount,title,cadence,next_run_at) values ($1,'expense',1,'r','daily',now())",
      [u],
    );
    await db.query("insert into point_ledger (user_id,delta,reason) values ($1,1,'daily')", [u]);
    await db.query(
      "insert into category_overrides (user_id,category_id,is_hidden) values ($1,(select id from categories where user_id is null limit 1),true)",
      [u],
    );

    await db.query("delete from users where id = $1", [u]);

    const tables = [
      "user_settings",
      "categories",
      "budgets",
      "accounts",
      "slips",
      "transactions",
      "merchant_memory",
      "recurring_rules",
      "point_ledger",
      "category_overrides",
    ];
    for (const t of tables) {
      const r = await one<{ n: number }>(
        db,
        `select count(*)::int as n from ${t} where user_id = $1`,
        [u],
      );
      expect(r.n, `${t} still has rows for the deleted user`).toBe(0);
    }
    // other users and shared system data are untouched
    expect(
      (await one<{ n: number }>(db, "select count(*)::int as n from users where id=$1", [keeper]))
        .n,
    ).toBe(1);
    expect(
      (
        await one<{ n: number }>(
          db,
          "select count(*)::int as n from categories where user_id is null",
        )
      ).n,
    ).toBe(19);
  });
});

describe("row level security (supabase/tests/rls_check.sql)", () => {
  it("passes: users are isolated, plan/points are server-only, server tables are hidden", async () => {
    const script = readFileSync(join(process.cwd(), "supabase", "tests", "rls_check.sql"), "utf8");
    const notices: string[] = [];
    const rlsDb = await newDb();
    // PGlite surfaces RAISE NOTICE through the optional onNotice hook when supported
    try {
      await rlsDb.exec(script);
    } finally {
      await rlsDb.close();
    }
    expect(notices).toEqual([]); // reaching this line means no check raised an exception
  }, 60_000);

  it("detects a leak: if a table loses RLS the script fails", async () => {
    const script = readFileSync(join(process.cwd(), "supabase", "tests", "rls_check.sql"), "utf8");
    const broken = await newDb();
    try {
      await broken.exec("alter table transactions disable row level security");
      await expect(broken.exec(script)).rejects.toThrow(/RLS is DISABLED on public\.transactions/);
    } finally {
      await broken.close();
    }
  }, 60_000);

  it("detects a leak: a permissive policy on transactions is caught", async () => {
    const script = readFileSync(join(process.cwd(), "supabase", "tests", "rls_check.sql"), "utf8");
    const broken = await newDb();
    try {
      await broken.exec("create policy leak on transactions for select using (true)");
      await expect(broken.exec(script)).rejects.toThrow(/can READ another user|leaks/);
    } finally {
      await broken.close();
    }
  }, 60_000);
});
