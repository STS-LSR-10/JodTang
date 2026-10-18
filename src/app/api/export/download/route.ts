import { verifyExportToken } from "@/lib/auth/export-token";
import { MAX_EXPORT_ROWS } from "@/lib/config";
import { TX_SELECT, toTxDto } from "@/lib/dto";
import { getServerEnv } from "@/lib/env";
import { toCsv } from "@/lib/export/csv";
import { exportDate, type ExportRow } from "@/lib/export/rows";
import { buildXlsx } from "@/lib/export/xlsx";
import { can } from "@/lib/plan";
import { getPlanInfo } from "@/lib/plan-server";
import { getAdminClient } from "@/lib/supabase/admin";
import { applyTxFilters } from "@/lib/tx-query";
import { DEFAULT_WALLET_NAME } from "@/lib/wallet";
import { listWallets } from "@/lib/wallet-repo";
import { listTransfers } from "@/lib/transfer-repo";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET /api/export/download?t=<token> — the file itself. The signed token is the credential. */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  if (!token) return new Response("ลิงก์ไม่ถูกต้อง", { status: 400 });

  try {
    const claims = await verifyExportToken(token, getServerEnv().SESSION_JWT_SECRET);
    if (!claims) {
      return new Response("ลิงก์หมดอายุแล้ว กลับไปกดส่งออกใหม่อีกครั้งนะ", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const db = getAdminClient();
    const wallets = await listWallets(db, claims.userId);
    const defaultWallet = wallets.find((w) => w.isDefault);
    const query = applyTxFilters(
      db
        .from("transactions")
        .select(TX_SELECT)
        .eq("user_id", claims.userId)
        .eq("status", "confirmed"),
      claims.filters,
      { defaultAccountId: defaultWallet?.id ?? null },
    )
      .order("occurred_at", { ascending: true })
      .limit(MAX_EXPORT_ROWS);
    const { data, error } = await query;
    if (error) throw new Error(`export query: ${error.message}`);

    const rows: ExportRow[] = (data ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = toTxDto(r as any);
      return {
        date: new Date(tx.occurredAt),
        type: tx.type,
        title: tx.title,
        categoryName: tx.categoryName,
        amountSatang: tx.amountSatang,
        source: tx.source,
        // an entry with no wallet is in the main wallet
        walletName: tx.accountName ?? defaultWallet?.name ?? DEFAULT_WALLET_NAME,
      };
    });

    const stamp = exportDate(new Date()).replaceAll("-", "");
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

    if (claims.format === "csv") {
      return new Response(toCsv(rows), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="jodtang-${stamp}.csv"`,
        },
      });
    }

    // The plan is checked now (not trusted from the token): Plus adds the summary sheets.
    const { plan } = await getPlanInfo(db, claims.userId);
    // transfers have no type/category/tag/text/wallet, so those filters leave them out
    const f = claims.filters;
    const transfers =
      f.type || f.categoryId || f.q || f.tag || f.accountId
        ? []
        : (await listTransfers(db, claims.userId, MAX_EXPORT_ROWS)).filter(
            (t) =>
              (!f.from || new Date(t.occurredAt) >= new Date(f.from)) &&
              (!f.to || new Date(t.occurredAt) < new Date(f.to)),
          );
    const file = await buildXlsx(rows, { advanced: can(plan, "advancedExport"), transfers });
    return new Response(new Uint8Array(file), {
      headers: {
        ...headers,
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="jodtang-${stamp}.xlsx"`,
      },
    });
  } catch (error) {
    log.error("export_failed", error);
    return new Response("ส่งออกไม่สำเร็จ ลองใหม่อีกครั้งนะ", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
