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

/** Photos a person can attach to entries per month (a cost guard; same for every paid plan). */
export const PHOTOS_PER_MONTH = 100;

/** Slips a person can have read per month, by plan. Null means unlimited. */
export const SLIP_LIMIT: Record<Plan, number | null> = {
  free: 0,
  plus: 5,
  ultimate: null,
};

export type Feature =
  | "savingsChart"
  | "recurring"
  | "multiAccount"
  | "merchantMemory"
  | "dailyReminder"
  | "advancedExport"
  | "autoSummary"
  | "voiceLog"
  | "backdate"
  | "multiEntry"
  | "tags"
  | "entryPhoto"
  | "smartParse";

/** The lowest tier that has each feature (Ultimate always includes everything Professional has). */
const MIN_PLAN: Record<Feature, "plus" | "ultimate"> = {
  savingsChart: "plus",
  recurring: "plus",
  multiAccount: "plus",
  merchantMemory: "plus",
  dailyReminder: "plus",
  advancedExport: "plus",
  autoSummary: "plus",
  voiceLog: "ultimate",
  backdate: "plus",
  multiEntry: "plus",
  tags: "plus",
  entryPhoto: "plus",
  smartParse: "ultimate",
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
  return MIN_PLAN[feature] === "ultimate" ? plan === "ultimate" : isPaidPlan(plan);
}

/** Slips still allowed this month, or null when unlimited. */
export function slipsRemaining(plan: Plan, usedThisMonth: number): number | null {
  const limit = SLIP_LIMIT[plan];
  return limit === null ? null : Math.max(0, limit - usedThisMonth);
}
