import { toSatang } from "@/lib/money";
import type { TxType } from "@/lib/types";

/** Transaction as sent to the LIFF client. Amounts are integer satang. */
export interface TxDto {
  id: string;
  type: TxType;
  title: string;
  amountSatang: number;
  occurredAt: string;
  source: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  /** A photo was attached to the entry (view it via /api/transactions/:id/photo). */
  hasPhoto: boolean;
  /** A slip image is attached (view it via /api/transactions/:id/slip). */
  hasSlip: boolean;
  note: string | null;
  /** #tags without the # (Professional and above). */
  tags: string[];
  /** The wallet the entry was put in; null = the main wallet. */
  accountId: string | null;
  accountName: string | null;
  /** The wallet is shared with other people. */
  accountShared?: boolean;
  /** Who wrote the entry (shown on shared wallets, where more than one person writes). */
  writerName?: string | null;
  /** The entry is the viewer's own (only their own can be edited or deleted). */
  mine?: boolean;
  /** Entered in a foreign currency: its code, the original amount (×100) and the rate used. */
  origCurrency: string | null;
  origAmountMinor: number | null;
  fxRate: number | null;
}

export const TX_SELECT =
  "id,type,title,amount,occurred_at,source,category_id,slip_id,photo_path,note,tags,user_id,account_id,orig_currency,orig_amount,fx_rate,accounts(name,is_shared),users(display_name),categories(name,icon,color)";

interface TxJoinRow {
  id: string;
  type: TxType;
  title: string;
  amount: number | string;
  occurred_at: string;
  source: string;
  category_id: string | null;
  slip_id?: string | null;
  photo_path?: string | null;
  note?: string | null;
  tags?: string[] | null;
  account_id?: string | null;
  orig_currency?: string | null;
  orig_amount?: number | string | null;
  fx_rate?: number | string | null;
  user_id?: string;
  accounts?: { name: string; is_shared?: boolean } | { name: string; is_shared?: boolean }[] | null;
  users?: { display_name: string | null } | { display_name: string | null }[] | null;
  // PostgREST returns a single object for a to-one embed, but be lenient.
  categories: CategoryEmbed | CategoryEmbed[] | null;
}

interface CategoryEmbed {
  name: string;
  icon: string | null;
  color: string | null;
}

export function toTxDto(row: TxJoinRow): TxDto {
  const cat = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    amountSatang: toSatang(row.amount),
    occurredAt: row.occurred_at,
    source: row.source,
    categoryId: row.category_id,
    categoryName: cat?.name ?? null,
    categoryIcon: cat?.icon ?? null,
    categoryColor: cat?.color ?? null,
    hasPhoto: Boolean(row.photo_path),
    hasSlip: Boolean(row.slip_id),
    note: row.note ?? null,
    tags: row.tags ?? [],
    accountId: row.account_id ?? null,
    origCurrency: row.orig_currency ?? null,
    origAmountMinor:
      row.orig_amount === null || row.orig_amount === undefined ? null : toSatang(row.orig_amount),
    fxRate: row.fx_rate === null || row.fx_rate === undefined ? null : Number(row.fx_rate),
    accountName: (Array.isArray(row.accounts) ? row.accounts[0] : row.accounts)?.name ?? null,
    accountShared:
      (Array.isArray(row.accounts) ? row.accounts[0] : row.accounts)?.is_shared === true,
    writerName: (Array.isArray(row.users) ? row.users[0] : row.users)?.display_name?.trim() || null,
  };
}
