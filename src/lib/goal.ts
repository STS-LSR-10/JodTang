import { personAmount, takeDue, type DueSpec } from "@/lib/debt";
import { bangkokParts, fromBangkok } from "@/lib/thai-date";

export const MAX_GOAL_NAME = 40;
export const MAX_GOAL_NOTE = 100;

/** A savings goal as the web app receives it (amounts are integer satang). */
export interface GoalDto {
  id: string;
  name: string;
  emoji: string | null;
  targetSatang: number;
  savedSatang: number;
  /** YYYY-MM-DD or null. */
  dueOn: string | null;
  archived: boolean;
  /** Whole percent of the target saved (can pass 100). */
  percent: number;
  remainingSatang: number;
  done: boolean;
  /** To still make the date: satang to put aside each month; null with no date, when done, or when late. */
  monthlyNeededSatang: number | null;
  overdue: boolean;
}

const BAHT_DAY = 86_400_000;

/** Progress numbers for one goal, as of `now`. */
export function goalProgress(
  g: { targetSatang: number; savedSatang: number; dueOn: string | null },
  now: Date,
): Pick<GoalDto, "percent" | "remainingSatang" | "done" | "monthlyNeededSatang" | "overdue"> {
  const saved = Math.max(0, g.savedSatang);
  const remaining = Math.max(0, g.targetSatang - saved);
  const done = saved >= g.targetSatang;
  let monthly: number | null = null;
  let overdue = false;
  if (g.dueOn && !done) {
    const [y, m, d] = g.dueOn.split("-").map(Number);
    const today = bangkokParts(now);
    const days = Math.round(
      (fromBangkok(y ?? 0, m ?? 1, d ?? 1).getTime() -
        fromBangkok(today.year, today.month, today.day).getTime()) /
        BAHT_DAY,
    );
    if (days < 0) overdue = true;
    else monthly = Math.ceil(remaining / Math.max(1, Math.ceil(days / 30)));
  }
  return {
    percent: Math.floor((saved * 100) / g.targetSatang),
    remainingSatang: remaining,
    done,
    monthlyNeededSatang: monthly,
    overdue,
  };
}

/** The goal a typed name means: exactly that name (ignoring case), else the only one it starts. */
export function resolveGoal<T extends { name: string }>(
  hint: string,
  goals: T[],
): { ok: true; goal: T } | { ok: false; reason: "none" | "ambiguous" } {
  const word = hint.replace(/\s+/g, " ").trim().toLowerCase();
  if (!word) return { ok: false, reason: "none" };
  const exact = goals.filter((g) => g.name.toLowerCase() === word);
  if (exact.length === 1 && exact[0]) return { ok: true, goal: exact[0] };
  const starts = goals.filter((g) => g.name.toLowerCase().startsWith(word));
  if (starts.length === 1 && starts[0]) return { ok: true, goal: starts[0] };
  return { ok: false, reason: starts.length > 1 ? "ambiguous" : "none" };
}

export type GoalCommand =
  | { kind: "goals" }
  | { kind: "goal-new"; name: string; targetSatang: number; due: DueSpec | null }
  | { kind: "goal-deposit"; name: string; amountSatang: number }
  | { kind: "goal-withdraw"; name: string; amountSatang: number };

/**
 * Goal phrases (text already trimmed, spaces collapsed, Thai digits turned into numbers):
 *   เป้าหมาย · กระปุก                                  -> the list
 *   เป้าหมาย ใหม่ เที่ยวญี่ปุ่น 30000 [ภายใน 31/3]       -> a new goal
 *   ออม เที่ยวญี่ปุ่น 2000 · ถอน เที่ยวญี่ปุ่น 500       -> put in / take out
 * `ออม …` and `ถอน …` are only goal commands once the bot finds a goal of that name.
 */
export function parseGoalText(text: string): GoalCommand | null {
  if (["เป้าหมาย", "เป้าหมายออม", "กระปุก", "กระปุกออมสิน", "goals"].includes(text.toLowerCase())) {
    return { kind: "goals" };
  }
  let m = /^(?:เป้าหมาย|กระปุก)\s+ใหม่\s+(.+)$/.exec(text);
  if (m?.[1]) {
    const { text: withoutDue, due } = takeDue(m[1]);
    const pa = personAmount(withoutDue);
    if (!pa || pa.person.length > MAX_GOAL_NAME) return null;
    return { kind: "goal-new", name: pa.person, targetSatang: pa.amountSatang, due };
  }
  m = /^ออม\s+(.+)$/.exec(text);
  if (m?.[1]) {
    const pa = personAmount(m[1]);
    return pa ? { kind: "goal-deposit", name: pa.person, amountSatang: pa.amountSatang } : null;
  }
  m = /^ถอน\s+(.+)$/.exec(text);
  if (m?.[1]) {
    const pa = personAmount(m[1]);
    return pa ? { kind: "goal-withdraw", name: pa.person, amountSatang: pa.amountSatang } : null;
  }
  return null;
}

/** A date typed as "31/3" etc. as a YYYY-MM-DD string, or null. */
export function dueSpecToDate(
  spec: DueSpec | null,
  resolve: (s: DueSpec) => Date | null,
): string | null {
  if (!spec) return null;
  const date = resolve(spec);
  if (!date) return null;
  const p = bangkokParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Running total of deposits (oldest first) for the progress chart; satang. */
export function cumulative(deposits: { amountSatang: number; occurredAt: string }[]): {
  at: string;
  totalSatang: number;
}[] {
  let total = 0;
  return [...deposits]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((d) => {
      total += d.amountSatang;
      return { at: d.occurredAt, totalSatang: total };
    });
}
