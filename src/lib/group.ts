import { parseTripCommand, type TripCommand } from "@/lib/trip";

export const MAX_GROUPS_PER_OWNER = 5;
export const MAX_GROUP_ENTRIES_PER_DAY = 300;
export const MAX_RECORDS_PER_MESSAGE = 5;
export const RECENT_COUNT = 5;

/** A group ledger as the bot sees it. */
export interface GroupRow {
  id: string;
  lineGroupId: string;
  ownerUserId: string;
  isActive: boolean;
}

export interface GroupEntryRow {
  id: string;
  payerLineUserId: string;
  title: string;
  amountSatang: number;
  occurredAt: string;
  /** The trip it belongs to (entries written while a trip was open). */
  tripId?: string | null;
  /** The people the entry was shared between (empty outside a trip). */
  splitUsers?: string[];
  /** Entered in a foreign currency: the code, the original amount (×100) and the rate. */
  origCurrency?: string | null;
  origMinor?: number | null;
  fxRate?: number | null;
}

export interface TripRow {
  id: string;
  groupId: string;
  name: string;
  startedBy: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
}

export type GroupCommand =
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "record"; body: string }
  | { kind: "summary"; scope: "today" | "month" }
  | { kind: "recent" }
  | { kind: "delete-last" }
  | { kind: "help" }
  | TripCommand;

/**
 * What a message in a group means. Only explicit commands count: an entry needs the word "จด" in
 * front, so ordinary chat ("กินข้าว 100 ไหม") is never recorded. Anything else is null and the bot
 * stays quiet.
 */
export function parseGroupCommand(input: string): GroupCommand | null {
  const text = input.trim();
  const one = text.replace(/\s+/g, " ").toLowerCase();

  if (["เปิดสมุดกลุ่ม", "เปิดสมุด"].includes(one)) return { kind: "open" };
  if (["ปิดสมุดกลุ่ม", "ปิดสมุด"].includes(one)) return { kind: "close" };
  if (["สรุป", "สรุปกลุ่ม", "สรุปเดือนนี้"].includes(one))
    return { kind: "summary", scope: "month" };
  if (one === "สรุปวันนี้") return { kind: "summary", scope: "today" };
  if (["ล่าสุด", "รายการล่าสุด"].includes(one)) return { kind: "recent" };
  if (one === "ลบล่าสุด") return { kind: "delete-last" };
  if (["ช่วยเหลือ", "วิธีใช้", "เมนู", "help"].includes(one)) return { kind: "help" };

  const trip = parseTripCommand(text);
  if (trip) return trip;

  const m = /^จด\s+([\s\S]+)$/.exec(text);
  if (m?.[1]?.trim()) return { kind: "record", body: m[1].trim() };
  return null;
}

export interface PayerShare {
  lineUserId: string;
  name: string;
  totalSatang: number;
  entries: number;
  /** Whole percent of the group's total. */
  percent: number;
}

export interface GroupSummary {
  totalSatang: number;
  count: number;
  payers: PayerShare[];
}

/** Totals per payer (as the database returns them, biggest first) with names and shares. */
export function summarizePayers(
  rows: { lineUserId: string; totalSatang: number; entries: number }[],
  names: ReadonlyMap<string, string>,
): GroupSummary {
  const totalSatang = rows.reduce((s, r) => s + r.totalSatang, 0);
  return {
    totalSatang,
    count: rows.reduce((s, r) => s + r.entries, 0),
    payers: rows.map((r) => ({
      lineUserId: r.lineUserId,
      name: names.get(r.lineUserId) ?? "สมาชิกกลุ่ม",
      totalSatang: r.totalSatang,
      entries: r.entries,
      percent: totalSatang > 0 ? Math.round((r.totalSatang * 100) / totalSatang) : 0,
    })),
  };
}

/** May this person delete this entry? The one who wrote it, or the owner of the ledger. */
export function canDeleteEntry(input: {
  entryPayer: string;
  requester: string;
  requesterIsOwner: boolean;
}): boolean {
  return input.requesterIsOwner || input.entryPayer === input.requester;
}
