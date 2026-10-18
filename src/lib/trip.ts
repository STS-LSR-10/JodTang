export type SplitMode = "all" | "only" | "except";

export const MAX_TRIP_NAME = 40;
export const MAX_SPLIT_NAMES = 10;

export type TripCommand =
  | { kind: "trip-start"; name: string }
  | { kind: "trip-join" }
  | { kind: "trip-summary" }
  | { kind: "trip-close" }
  | { kind: "trip-old" }
  | { kind: "trip-status" };

/** Trip phrases in a group: เริ่มทริป <ชื่อ> · ร่วมทริป · สรุปทริป · จบทริป · ทริปเก่า · ทริป */
export function parseTripCommand(input: string): TripCommand | null {
  const text = input.trim().replace(/\s+/g, " ");
  const m = /^เริ่มทริป\s+(.+)$/.exec(text);
  if (m?.[1]) {
    const name = m[1].trim();
    return name.length <= MAX_TRIP_NAME ? { kind: "trip-start", name } : null;
  }
  if (text === "ร่วมทริป") return { kind: "trip-join" };
  if (text === "สรุปทริป") return { kind: "trip-summary" };
  if (text === "จบทริป") return { kind: "trip-close" };
  if (text === "ทริปเก่า") return { kind: "trip-old" };
  if (text === "ทริป") return { kind: "trip-status" };
  return null;
}

export interface SplitClause {
  /** The entry without the split words, e.g. "ไวน์ 900". */
  body: string;
  mode: SplitMode;
  /** Names typed after หาร / ไม่หาร. */
  names: string[];
}

/**
 * "ไวน์ 900 หาร แอน บ๊อบ" -> only these share it; "ค่าห้อง 3000 ไม่หาร บ๊อบ" -> everyone but them.
 * The words must come after the amount and be followed by names (no digits), so "ค่าหารสอง 100"
 * is just an entry.
 */
export function parseSplitClause(body: string): SplitClause {
  const m = /^([\s\S]*?\d[\s\S]*?)\s+(ไม่หาร|หาร)\s+([^\d]+?)\s*$/.exec(body);
  if (!m?.[1] || !m[2] || !m[3]) return { body, mode: "all", names: [] };
  const names = m[3].split(/[\s,]+/).filter(Boolean);
  if (names.length === 0 || names.length > MAX_SPLIT_NAMES) return { body, mode: "all", names: [] };
  return { body: m[1].trim(), mode: m[2] === "หาร" ? "only" : "except", names };
}

export interface Person {
  id: string;
  name: string;
}

/** The people typed names stand for: that exact name (ignoring case), else the only one it starts. */
export function resolveNames(
  names: string[],
  people: Person[],
): { ok: true; ids: string[] } | { ok: false; unknown: string[]; ambiguous: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  for (const typed of names) {
    const word = typed.toLowerCase();
    const exact = people.filter((p) => p.name.toLowerCase() === word);
    const starts = people.filter((p) => p.name.toLowerCase().startsWith(word));
    const hit = exact.length === 1 ? exact[0] : starts.length === 1 ? starts[0] : undefined;
    if (hit) {
      if (!ids.includes(hit.id)) ids.push(hit.id);
    } else if (starts.length > 1 || exact.length > 1) ambiguous.push(typed);
    else unknown.push(typed);
  }
  return unknown.length === 0 && ambiguous.length === 0
    ? { ok: true, ids }
    : { ok: false, unknown, ambiguous };
}

/** Who shares an entry: everyone on the trip, only some of them, or everyone but some. */
export function participantsOf(
  mode: SplitMode,
  named: string[],
  tripMembers: string[],
  payer: string,
): string[] {
  const everyone = tripMembers.includes(payer) ? tripMembers : [...tripMembers, payer];
  if (mode === "only") return named.length > 0 ? [...new Set(named)] : everyone;
  if (mode === "except") {
    const rest = everyone.filter((id) => !named.includes(id));
    return rest.length > 0 ? rest : [payer];
  }
  return everyone;
}

/**
 * Share each person owes of an amount, in whole satang that add up to exactly the amount. The
 * leftover satang go one each to the payer first (if they share it), then the others in order.
 */
export function splitAmount(
  amountSatang: number,
  participants: string[],
  payer: string,
): Map<string, number> {
  const people = [...new Set(participants)];
  if (people.length === 0) return new Map([[payer, amountSatang]]);
  const base = Math.floor(amountSatang / people.length);
  let leftover = amountSatang - base * people.length;
  const ordered = people.includes(payer) ? [payer, ...people.filter((p) => p !== payer)] : people;
  const out = new Map<string, number>();
  for (const p of ordered) {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    out.set(p, base + extra);
  }
  return out;
}

export interface TripEntry {
  payer: string;
  amountSatang: number;
  participants: string[];
}

export interface PersonBalance {
  id: string;
  paidSatang: number;
  owedSatang: number;
  /** paid - owed: positive is owed back to them, negative is what they must pay. */
  netSatang: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountSatang: number;
}

export interface Settlement {
  totalSatang: number;
  people: PersonBalance[];
  transfers: Transfer[];
}

/** Match people who owe with people owed, largest first, which keeps the number of transfers low. */
export function settleTransfers(net: ReadonlyMap<string, number>): Transfer[] {
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v }));
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v }));
  const bySize = (a: { id: string; left: number }, b: { id: string; left: number }) =>
    b.left - a.left || a.id.localeCompare(b.id);
  const out: Transfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(bySize);
    creditors.sort(bySize);
    const d = debtors[0];
    const c = creditors[0];
    if (!d || !c) break;
    const amount = Math.min(d.left, c.left);
    out.push({ from: d.id, to: c.id, amountSatang: amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
  }
  return out;
}

/** Who paid what, who should have paid what, and who must transfer how much to whom. */
export function computeSettlement(entries: TripEntry[], members: string[]): Settlement {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  for (const m of members) {
    paid.set(m, 0);
    owed.set(m, 0);
  }
  let total = 0;
  for (const e of entries) {
    total += e.amountSatang;
    paid.set(e.payer, (paid.get(e.payer) ?? 0) + e.amountSatang);
    if (!owed.has(e.payer)) owed.set(e.payer, 0);
    for (const [p, share] of splitAmount(e.amountSatang, e.participants, e.payer)) {
      owed.set(p, (owed.get(p) ?? 0) + share);
      if (!paid.has(p)) paid.set(p, 0);
    }
  }
  const ids = [...new Set([...paid.keys(), ...owed.keys()])];
  const people = ids.map((id) => ({
    id,
    paidSatang: paid.get(id) ?? 0,
    owedSatang: owed.get(id) ?? 0,
    netSatang: (paid.get(id) ?? 0) - (owed.get(id) ?? 0),
  }));
  people.sort((a, b) => b.netSatang - a.netSatang || a.id.localeCompare(b.id));
  return {
    totalSatang: total,
    people,
    transfers: settleTransfers(new Map(people.map((p) => [p.id, p.netSatang]))),
  };
}
