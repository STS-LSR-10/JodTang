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
}

export const TX_SELECT =
  "id,type,title,amount,occurred_at,source,category_id,slip_id,photo_path,note,tags,categories(name,icon,color)";

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
  };
}
