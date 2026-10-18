/** Shape of GET /api/me as the settings sections use it. */
export interface Me {
  displayName: string | null;
  pictureUrl: string | null;
  /** The plan in force now (an expired paid plan reads as "free"). */
  plan: "free" | "plus" | "ultimate";
  planExpiresAt: string | null;
  features: Record<string, boolean>;
  slips: { used: number; limit: number | null; remaining: number | null };
  points: number;
  streak: number;
  redeem: { pointsPerDay: number; days: number; cost: number };
  referralCode: string;
  referred: boolean;
  limits: { recurringRules: number; wallets: number };
  payments: { available: boolean; history: unknown[] };
}

export interface Settings {
  confirm_style: "full" | "short" | "off";
  budget_cycle: "monthly" | "weekly";
  cycle_start_day: number;
  daily_reminder_enabled: boolean;
  daily_reminder_time: string | null;
  weekly_summary_enabled: boolean;
  monthly_summary_enabled: boolean;
  card_theme?: string;
  bot_persona?: string;
}

export const cardClass = "space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card";
export const fieldClass =
  "h-12 w-full rounded-2xl border border-border bg-background px-4 outline-none focus:border-primary";
