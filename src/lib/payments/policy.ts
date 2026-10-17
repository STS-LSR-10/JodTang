import { effectivePlan, type Plan } from "@/lib/plan";
import type { PaymentMethod } from "./provider";

/** What a person is currently paying with, worked out from their user row and payment history. */
export interface BillingState {
  /** The plan in force right now (expiry applied). */
  plan: Plan;
  customerId: string | null;
  /** A card subscription that renews by itself is running. */
  subscriptionRunning: boolean;
  /** Prepaid (PromptPay) time is still left and no card subscription is running. */
  prepaidRunning: boolean;
}

export interface BillingInputs {
  plan: Plan;
  planExpiresAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** The user has at least one paid PromptPay (prepaid) payment. */
  hasPrepaidPayment: boolean;
}

export function billingState(i: BillingInputs, now: Date = new Date()): BillingState {
  const active =
    Boolean(i.planExpiresAt) && new Date(i.planExpiresAt as string).getTime() > now.getTime();
  const subscriptionRunning = Boolean(i.stripeSubscriptionId) && active;
  return {
    plan: effectivePlan(i.plan, i.planExpiresAt, now),
    customerId: i.stripeCustomerId,
    subscriptionRunning,
    prepaidRunning: active && !subscriptionRunning && i.hasPrepaidPayment,
  };
}

const RANK: Record<Plan, number> = { free: 0, plus: 1, ultimate: 2 };

export interface Block {
  message: string;
  /** The person should use the billing portal instead. */
  manage?: boolean;
}

/**
 * One billing method at a time, and never a cheaper tier than the one in force:
 *  - a running card subscription renews by itself, so a second payment (card or PromptPay) would
 *    pay twice for the same time; change or cancel it in the billing portal;
 *  - prepaid (PromptPay) time cannot be mixed with a card subscription: the subscription's
 *    renewal would overwrite the tier bought with the prepaid payment;
 *  - buying a lower tier than the current one would take features away that were already paid for.
 * Returns null when the purchase is fine.
 */
export function checkoutBlock(
  state: BillingState,
  request: { plan: "plus" | "ultimate"; method: PaymentMethod },
): Block | null {
  if (RANK[request.plan] < RANK[state.plan]) {
    return { message: "คุณใช้แผนที่สูงกว่านี้อยู่แล้ว" };
  }
  if (state.subscriptionRunning) {
    return {
      message:
        "คุณมีแผนแบบต่ออายุอัตโนมัติด้วยบัตรอยู่ จัดการ เปลี่ยน หรือยกเลิกได้ที่ปุ่ม “จัดการการชำระเงิน”",
      manage: true,
    };
  }
  if (state.prepaidRunning && request.method === "card") {
    return {
      message:
        "คุณมีแผนแบบพร้อมเพย์ที่ยังไม่หมดอายุ ต่ออายุด้วยพร้อมเพย์ได้เลย หรือรอให้หมดอายุก่อนจึงสมัครแบบบัตร",
    };
  }
  return null;
}
