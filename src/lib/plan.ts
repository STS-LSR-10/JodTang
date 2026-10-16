/**
 * Single place for plan limits and feature flags (Free vs Plus).
 * Payments are a stub for now; plan_expires_at is also how redeemed points grant Plus days.
 */
export type Plan = "free" | "plus";

export const FREE_SLIP_LIMIT = 30;

export type Feature =
  | "unlimitedSlips"
  | "savingsChart"
  | "recurring"
  | "multiAccount"
  | "merchantMemory"
  | "dailyReminder"
  | "advancedExport";

const PLUS_ONLY: Record<Feature, boolean> = {
  unlimitedSlips: true,
  savingsChart: true,
  recurring: true,
  multiAccount: true,
  merchantMemory: true,
  dailyReminder: true,
  advancedExport: true,
};

/**
 * The plan in force right now. A future `plan_expires_at` means Plus (paid or redeemed days);
 * a past one means the Plus period ended and the user is back on Free.
 */
export function effectivePlan(
  plan: Plan,
  planExpiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): Plan {
  if (planExpiresAt) return new Date(planExpiresAt).getTime() > now.getTime() ? "plus" : "free";
  return plan;
}

export function can(plan: Plan, feature: Feature): boolean {
  return PLUS_ONLY[feature] ? plan === "plus" : true;
}

/** Slips still allowed this month, or null when unlimited. */
export function slipsRemaining(plan: Plan, usedThisMonth: number): number | null {
  if (can(plan, "unlimitedSlips")) return null;
  return Math.max(0, FREE_SLIP_LIMIT - usedThisMonth);
}
