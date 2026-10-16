import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newDb, newUser, one, rows } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await newDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

const prepaid = (user: string, plan: string, months: number, ref: string, amount = 5900) =>
  one<{ apply_prepaid_purchase: string }>(
    db,
    "select apply_prepaid_purchase($1, $2::plan_tier, $3, $4, $5, 'promptpay')",
    [user, plan, months, ref, amount],
  );

describe("apply_prepaid_purchase", () => {
  it("activates the plan for the period and records the payment", async () => {
    const u = await newUser(db, "pay-a");
    await prepaid(u, "plus", 1, "cs_a1");
    const r = await one<{ plan: string; days: number }>(
      db,
      "select plan::text, round(extract(epoch from (plan_expires_at - now())) / 86400)::int as days from users where id = $1",
      [u],
    );
    expect(r.plan).toBe("plus");
    expect(r.days).toBeGreaterThanOrEqual(28);
    expect(r.days).toBeLessThanOrEqual(31);
    expect(await rows(db, "select * from payments where user_id = $1", [u])).toHaveLength(1);
  });

  it("is idempotent: the same Stripe reference never extends twice", async () => {
    const u = await newUser(db, "pay-b");
    await prepaid(u, "plus", 12, "cs_b1", 29900);
    const first = await one<{ e: string }>(
      db,
      "select plan_expires_at::text as e from users where id = $1",
      [u],
    );
    await prepaid(u, "plus", 12, "cs_b1", 29900);
    const second = await one<{ e: string }>(
      db,
      "select plan_expires_at::text as e from users where id = $1",
      [u],
    );
    expect(second.e).toBe(first.e);
    expect(await rows(db, "select 1 from payments where user_id = $1", [u])).toHaveLength(1);
  });

  it("stacks on remaining time (a second purchase extends, it does not restart)", async () => {
    const u = await newUser(db, "pay-c");
    await prepaid(u, "plus", 1, "cs_c1");
    await prepaid(u, "ultimate", 1, "cs_c2", 13900);
    const r = await one<{ plan: string; days: number }>(
      db,
      "select plan::text, round(extract(epoch from (plan_expires_at - now())) / 86400)::int as days from users where id = $1",
      [u],
    );
    expect(r.plan).toBe("ultimate");
    expect(r.days).toBeGreaterThanOrEqual(58);
  });

  it("rejects a non-positive period", async () => {
    const u = await newUser(db, "pay-d");
    await expect(prepaid(u, "plus", 0, "cs_d1")).rejects.toThrow();
  });
});

describe("set_plan_until", () => {
  const until = (user: string, plan: string, at: string) =>
    db.query("select set_plan_until($1::uuid, $2::plan_tier, $3::timestamptz, $4, 'sub_x')", [
      user,
      plan,
      at,
      `cus_${user}`,
    ]);
  it("sets the plan until the period end and remembers the Stripe ids", async () => {
    const u = await newUser(db, "sub-a");
    await until(u, "plus", "2030-01-01T00:00:00Z");
    const r = await one<{ plan: string; e: string; c: string; s: string }>(
      db,
      "select plan::text, plan_expires_at::text as e, stripe_customer_id as c, stripe_subscription_id as s from users where id = $1",
      [u],
    );
    expect(r.plan).toBe("plus");
    expect(r.e.startsWith("2030-01-01")).toBe(true);
    expect(r.c).toBe(`cus_${u}`);
    expect(r.s).toBe("sub_x");
  });

  it("a renewal moves the end forward, a late/duplicate event never shortens it", async () => {
    const u = await newUser(db, "sub-b");
    await until(u, "plus", "2030-02-01T00:00:00Z");
    await until(u, "plus", "2030-01-01T00:00:00Z"); // older event arriving late
    const r = await one<{ e: string }>(
      db,
      "select plan_expires_at::text as e from users where id = $1",
      [u],
    );
    expect(r.e.startsWith("2030-02-01")).toBe(true);
  });
});

describe("record_payment", () => {
  it("is idempotent per Stripe reference", async () => {
    const u = await newUser(db, "rec-a");
    const call = () =>
      one<{ record_payment: boolean }>(
        db,
        "select record_payment($1, 'plus'::plan_tier, 1, 'in_1', 5900, 'card')",
        [u],
      );
    expect((await call()).record_payment).toBe(true);
    expect((await call()).record_payment).toBe(false);
  });
});

describe("permissions", () => {
  it("the browser roles cannot call the plan functions", async () => {
    const u = await newUser(db, "perm-a");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(prepaid(u, "plus", 1, `cs_perm_${role}`)).rejects.toThrow(/permission denied/i);
      await db.exec("reset role");
    }
  });

  it("a user can read their own payments but not another user's", async () => {
    const a = await newUser(db, "own-a");
    const b = await newUser(db, "own-b");
    await prepaid(a, "plus", 1, "cs_own_a");
    await prepaid(b, "plus", 1, "cs_own_b");
    await db.exec(
      "select set_config('request.jwt.claims', '{\"sub\":\"" +
        a +
        '","role":"authenticated"}\', false); set role authenticated',
    );
    const seen = await rows<{ user_id: string }>(db, "select user_id from payments");
    await db.exec("reset role");
    expect(seen.map((r) => r.user_id)).toEqual([a]);
  });
});
