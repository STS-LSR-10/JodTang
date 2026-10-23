/**
 * Tunable product rules in one place (points, referral, limits). Change a number here to
 * change the rule everywhere; the SQL functions take these values as arguments.
 */

/** Points for each day on which the user records at least one entry (1 per day: no farming). */
export const DAILY_POINT = 1;

/** Redeem rate: this many points buy one day of Plus. */
export const POINTS_PER_PLUS_DAY = 10;

/** Referral rewards, paid once when the referred user records their first entry. */
export const REFERRAL_BONUS_REFERRER = 10;
export const REFERRAL_BONUS_REFEREE = 10;

/** A referral code can only be applied by users who joined within this many days. */
export const REFERRAL_WINDOW_DAYS = 14;

/** Most rows in one export file. */
export const MAX_EXPORT_ROWS = 5000;

/** Export download links stop working after this many seconds. */
export const EXPORT_LINK_TTL_SECONDS = 120;

/** Reminder is skipped if the cron runs later than this many hours after the chosen time. */
export const REMINDER_GRACE_HOURS = 3;

/** The bot's LINE Official Account basic ID (not a secret); people who are not its friends are sent to add it. */
export const LINE_OA_BASIC_ID = process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID ?? "@964jamyy";

/** The "add friend" link of the bot. */
export const addFriendUrl = (basicId: string = LINE_OA_BASIC_ID): string =>
  `https://line.me/R/ti/p/${encodeURIComponent(basicId)}`;
