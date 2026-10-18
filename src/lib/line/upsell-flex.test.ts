import { describe, expect, it } from "vitest";
import { PRICES } from "@/lib/pricing";
import { buildUpsellCard } from "./upsell-flex";

const json = (m: unknown) => JSON.stringify(m);

describe("upgrade card", () => {
  it("backdate: names the feature, the price, the trial and the 'as today' button", () => {
    const card = json(
      buildUpsellCard({
        feature: "backdate",
        trialAvailable: true,
        upgradeUrl: "https://x.test/upgrade",
        retryText: "เมื่อวาน ข้าวผัด 60",
      }),
    );
    expect(card).toContain("เมื่อวาน");
    expect(card).toContain(`฿${PRICES.plus.monthly}/เดือน`);
    expect(card).toContain("a=trial&p=plus");
    expect(card).toContain("https://x.test/upgrade");
    expect(card).toContain(`a=bdt&t=${encodeURIComponent("เมื่อวาน ข้าวผัด 60")}`);
  });

  it("slip: shows both tiers and no 'as today' button", () => {
    const card = json(buildUpsellCard({ feature: "slip", trialAvailable: true }));
    expect(card).toContain(`฿${PRICES.plus.monthly}`);
    expect(card).toContain(`฿${PRICES.ultimate.monthly}`);
    expect(card).not.toContain("a=bdt");
  });

  it("no trial button once the trial was used, and a too-long text drops the 'as today' button", () => {
    const card = json(
      buildUpsellCard({
        feature: "backdate",
        trialAvailable: false,
        upgradeUrl: "https://x.test/upgrade",
        retryText: "เมื่อวาน " + "ก".repeat(200),
      }),
    );
    expect(card).not.toContain("a=trial");
    expect(card).not.toContain("a=bdt");
    expect(card).toContain("https://x.test/upgrade");
  });
});
