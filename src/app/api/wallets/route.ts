import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { walletCapacity } from "@/lib/plan";
import { getPlanInfo } from "@/lib/plan-server";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  MAX_WALLET_NAME,
  parseOpeningBalance,
  totalBalance,
  WALLET_KINDS,
  walletToDto,
} from "@/lib/wallet";
import { createWallet, ensureWallets } from "@/lib/wallet-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wallets — the person's wallets with balances (the main wallet is made on first use),
 * the total, and how many wallets their plan allows.
 */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;
    const db = getAdminClient();
    const [wallets, { plan }] = await Promise.all([
      ensureWallets(db, auth.userId),
      getPlanInfo(db, auth.userId),
    ]);
    const limit = walletCapacity(plan);
    return json({
      items: wallets.map(walletToDto),
      totalSatang: totalBalance(wallets),
      limit,
      canAdd: wallets.length < limit,
    });
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_WALLET_NAME),
  kind: z.enum(WALLET_KINDS).default("cash"),
  openingBalance: z.union([z.string(), z.number()]).nullable().optional(),
  isDefault: z.boolean().optional(),
});

/** POST /api/wallets — add a wallet, within what the plan allows (Free 1, Professional 5). */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;
    const db = getAdminClient();

    const limited = await limitOr429(db, "write", auth.userId, LIMITS.write);
    if (limited) return limited;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(`ตั้งชื่อกระเป๋าให้ถูกต้องนะ (ไม่เกิน ${MAX_WALLET_NAME} ตัวอักษร)`, 400);
    }
    const opening = parseOpeningBalance(parsed.data.openingBalance);
    if (opening === null) return apiError("ยอดตั้งต้นไม่ถูกต้อง", 400);

    const [wallets, { plan }] = await Promise.all([
      ensureWallets(db, auth.userId),
      getPlanInfo(db, auth.userId),
    ]);
    const capacity = walletCapacity(plan);
    if (wallets.length >= capacity) {
      return Response.json(
        {
          error:
            plan === "free"
              ? "แผน Free มีกระเป๋าได้ 1 ใบ อัปเกรดเป็น Professional เพื่อมีได้ถึง 5 ใบนะ"
              : `มีกระเป๋าได้สูงสุด ${capacity} ใบ`,
          upgrade: plan === "free" || plan === "plus",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await createWallet(db, auth.userId, {
      name: parsed.data.name,
      kind: parsed.data.kind,
      openingSatang: opening,
      makeDefault: parsed.data.isDefault === true,
    });
    if (result === "duplicate") return apiError("มีกระเป๋าชื่อนี้อยู่แล้ว", 409);
    return json({ id: result }, 201);
  });
}
