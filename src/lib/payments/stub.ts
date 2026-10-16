import type { PaymentProvider } from "./provider";

export const PAYMENTS_UNAVAILABLE_TEXT =
  "ยังไม่เปิดให้ชำระเงิน ตอนนี้แลกวันใช้ Plus ด้วยตังสะสมได้ที่หน้าตั้งค่านะ";

/** Placeholder until a real provider (Stripe / PromptPay) is connected. */
export const stubPaymentProvider: PaymentProvider = {
  name: "stub",
  available: false,
  async createCheckout() {
    return { status: "unavailable", message: PAYMENTS_UNAVAILABLE_TEXT };
  },
  async listPayments() {
    return [];
  },
  async handleWebhook() {
    return { handled: false };
  },
};

export function getPaymentProvider() {
  return stubPaymentProvider;
}
