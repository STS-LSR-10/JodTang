export type TxType = "expense" | "income";
export type ConfirmStyle = "full" | "short" | "off";
export type BudgetCycle = "monthly" | "weekly";

/** A LINE message object (text, flex, ...). Kept loose on purpose. */
export type LineMessage = { type: string; [key: string]: unknown };
