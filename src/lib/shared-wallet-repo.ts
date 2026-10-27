import type { SupabaseClient } from "@supabase/supabase-js";
import { sharedMemberLimit } from "@/lib/plan";
import { effectivePlan, type Plan } from "@/lib/plan";
import { satangToString } from "@/lib/money";
import type { WalletKind } from "@/lib/wallet";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

export const INVITE_HOURS = 24;

export interface WalletMember {
  userId: string;
  name: string;
  role: "owner" | "member";
}

/** A new shared wallet owned by the person (who is its first member). "duplicate": the name is used. */
export async function createSharedWallet(
  db: SupabaseClient,
  ownerId: string,
  input: { name: string; kind: Exclude<WalletKind, "card">; openingSatang: number },
): Promise<string | "duplicate"> {
  const { data, error } = await db
    .from("accounts")
    .insert({
      user_id: ownerId,
      name: input.name,
      kind: input.kind,
      opening_balance: satangToString(input.openingSatang),
      is_default: false,
      is_shared: true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return "duplicate";
    fail("create shared wallet", error);
  }
  const id = (data as { id: string }).id;
  const member = await db
    .from("wallet_members")
    .insert({ wallet_id: id, user_id: ownerId, role: "owner" });
  if (member.error) {
    // do not leave a shared wallet nobody is on
    await db.from("accounts").delete().eq("id", id);
    fail("add the owner to the shared wallet", member.error);
  }
  return id;
}

/** How many shared wallets the person owns. */
export async function ownedSharedCount(db: SupabaseClient, ownerId: string): Promise<number> {
  const { count, error } = await db
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerId)
    .eq("is_shared", true);
  if (error) fail("count shared wallets", error);
  return count ?? 0;
}

/** The people on a shared wallet, owner first. */
export async function membersOf(db: SupabaseClient, walletId: string): Promise<WalletMember[]> {
  const { data, error } = await db
    .from("wallet_members")
    .select("user_id,role,joined_at,users(display_name)")
    .eq("wallet_id", walletId)
    .order("joined_at", { ascending: true });
  if (error) fail("load wallet members", error);
  const rows = (data ?? []) as unknown as {
    user_id: string;
    role: "owner" | "member";
    users: { display_name: string | null } | { display_name: string | null }[] | null;
  }[];
  return rows
    .map((r) => ({
      userId: r.user_id,
      role: r.role,
      name: (Array.isArray(r.users) ? r.users[0] : r.users)?.display_name?.trim() || "สมาชิก",
    }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));
}

/** Members of several shared wallets at once: wallet id -> people. */
export async function membersOfMany(
  db: SupabaseClient,
  walletIds: string[],
): Promise<Map<string, WalletMember[]>> {
  const out = new Map<string, WalletMember[]>();
  await Promise.all(
    walletIds.map(async (id) => {
      out.set(id, await membersOf(db, id));
    }),
  );
  return out;
}

export async function isMember(
  db: SupabaseClient,
  walletId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("wallet_members")
    .select("user_id")
    .eq("wallet_id", walletId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("check wallet membership", error);
  return data !== null;
}

/** Take a person off the wallet (the one who leaves, or the owner removing them). */
export async function removeMember(
  db: SupabaseClient,
  walletId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("wallet_members")
    .delete()
    .eq("wallet_id", walletId)
    .eq("user_id", userId)
    .eq("role", "member") // the owner cannot be removed: they delete the wallet instead
    .select("user_id")
    .maybeSingle();
  if (error) fail("remove wallet member", error);
  return data !== null;
}

const randomCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");

/** A fresh invite for the wallet: a 6-digit code that works once, for 24 hours. */
export async function createInvite(
  db: SupabaseClient,
  walletId: string,
  createdBy: string,
  now: Date,
): Promise<{ code: string; expiresAt: Date }> {
  // forget invites that ended a while ago, so the code space stays free
  await db
    .from("wallet_invites")
    .delete()
    .lt("expires_at", new Date(now.getTime() - 2 * 86_400_000).toISOString());
  const expiresAt = new Date(now.getTime() + INVITE_HOURS * 3_600_000);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const { error } = await db.from("wallet_invites").insert({
      code,
      wallet_id: walletId,
      created_by: createdBy,
      expires_at: expiresAt.toISOString(),
    });
    if (!error) return { code, expiresAt };
    if (error.code !== "23505") fail("create wallet invite", error);
  }
  throw new Error("create wallet invite: no free code");
}

export type JoinResult =
  | { ok: true; wallet: { id: string; name: string; ownerId: string } }
  | { ok: false; reason: "invalid" | "expired" | "used" | "own" | "already" | "full" };

/**
 * Use an invite code: the person joins the wallet if the code is good, they are not on it already,
 * and the owner's plan still has room (two people on Pro, ten on Elite). The code can
 * be used once; the plan limit is the owner's, not the joiner's.
 */
export async function redeemInvite(
  db: SupabaseClient,
  code: string,
  userId: string,
  now: Date,
): Promise<JoinResult> {
  const found = await db
    .from("wallet_invites")
    .select("code,wallet_id,expires_at,used_at,created_by")
    .eq("code", code)
    .maybeSingle();
  if (found.error) fail("find invite", found.error);
  const invite = found.data as {
    code: string;
    wallet_id: string;
    expires_at: string;
    used_at: string | null;
    created_by: string;
  } | null;
  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.used_at) return { ok: false, reason: "used" };
  if (new Date(invite.expires_at) <= now) return { ok: false, reason: "expired" };

  const wallet = await db
    .from("accounts")
    .select("id,name,user_id,is_shared,users(plan,plan_expires_at)")
    .eq("id", invite.wallet_id)
    .maybeSingle();
  if (wallet.error) fail("find shared wallet", wallet.error);
  const w = wallet.data as unknown as {
    id: string;
    name: string;
    user_id: string;
    is_shared: boolean;
    users:
      | { plan: Plan; plan_expires_at: string | null }
      | { plan: Plan; plan_expires_at: string | null }[]
      | null;
  } | null;
  if (!w || !w.is_shared) return { ok: false, reason: "invalid" };
  if (w.user_id === userId) return { ok: false, reason: "own" };
  if (await isMember(db, w.id, userId)) return { ok: false, reason: "already" };

  const owner = Array.isArray(w.users) ? w.users[0] : w.users;
  const ownerPlan = owner ? effectivePlan(owner.plan, owner.plan_expires_at, now) : "free";
  const members = await membersOf(db, w.id);
  if (members.length >= sharedMemberLimit(ownerPlan)) return { ok: false, reason: "full" };

  // claim the code first: two people typing it at once must not both get in
  const claimed = await db
    .from("wallet_invites")
    .update({ used_at: now.toISOString(), used_by: userId })
    .eq("code", code)
    .is("used_at", null)
    .select("code")
    .maybeSingle();
  if (claimed.error) fail("use invite", claimed.error);
  if (!claimed.data) return { ok: false, reason: "used" };

  const added = await db
    .from("wallet_members")
    .insert({ wallet_id: w.id, user_id: userId, role: "member" });
  if (added.error && added.error.code !== "23505") fail("join shared wallet", added.error);
  return { ok: true, wallet: { id: w.id, name: w.name, ownerId: w.user_id } };
}
