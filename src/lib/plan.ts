/**
 * Single place for plan limits and feature flags (Free / Professional / Ultimate).
 * Payments are a stub for now; plan_expires_at is also how redeemed points grant Professional days.
 *
 * The stored id "plus" is the Professional tier (kept so no data has to be migrated); show
 * `PLAN_LABEL[plan]` to people, never the id.
 */
export type Plan = "free" | "plus" | "ultimate";

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  plus: "Professional",
  ultimate: "Ultimate",
};

export const FREE_SLIP_LIMIT = 30;

export type Feature =
  | "unlimitedSlips"
  | "savingsChart"
  | "recurring"
  | "multiAccount"
  | "merchantMemory"
  | "dailyReminder"
  | "advancedExport"
  | "autoSummary"
  | "voiceLog"
  | "backdate";

/** Every feature built so far is part of Professional, and so of Ultimate above it. */
const PAID_ONLY: Record<Feature, boolean> = {
  unlimitedSlips: true,
  savingsChart: true,
  recurring: true,
  multiAccount: true,
  merchantMemory: true,
  dailyReminder: true,
  advancedExport: true,
  autoSummary: true,
  voiceLog: true,
  backdate: true,
};

export function isPaidPlan(plan: Plan): boolean {
  return plan !== "free";
}

/**
 * The plan in force right now. A future `plan_expires_at` means a paid plan (the stored tier, or
 * Professional for redeemed days on a free row); a past one means the period ended and the user is
 * back on Free.
 */
export function effectivePlan(
  plan: Plan,
  planExpiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): Plan {
  if (planExpiresAt) {
    if (new Date(planExpiresAt).getTime() <= now.getTime()) return "free";
    return plan === "free" ? "plus" : plan;
  }
  return plan;
}

export function can(plan: Plan, feature: Feature): boolean {
  return PAID_ONLY[feature] ? isPaidPlan(plan) : true;
}

/** Slips still allowed this month, or null when unlimited. */
export function slipsRemaining(plan: Plan, usedThisMonth: number): number | null {
  if (can(plan, "unlimitedSlips")) return null;
  return Math.max(0, FREE_SLIP_LIMIT - usedThisMonth);
}
