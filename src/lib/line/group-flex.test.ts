import { describe, expect, it } from "vitest";
import { summarizePayers } from "@/lib/group";
import { buildGroupSummaryCard } from "./group-flex";

describe("buildGroupSummaryCard", () => {
  const summary = summarizePayers(
    [
      { lineUserId: "Ubob", totalSatang: 120_050, entries: 2 },
      { lineUserId: "Uanna", totalSatang: 35_000, entries: 1 },
    ],
    new Map([
      ["Ubob", "บ๊อบ"],
      ["Uanna", "แอน"],
    ]),
  );
  const json = JSON.stringify(
    buildGroupSummaryCard({ title: "สมุดกลุ่ม · เดือนนี้", subtitle: "18 ต.ค. 69", summary }),
  );

  it("shows the group total and how many entries", () => {
    expect(json).toContain("รวมทั้งกลุ่ม");
    expect(json).toContain("฿1,550.50");
    expect(json).toContain("3 รายการ");
  });

  it("shows who paid what with the share", () => {
    expect(json).toContain("บ๊อบ");
    expect(json).toContain("฿1,200.50 · 77%");
    expect(json).toContain("แอน");
    expect(json).toContain("฿350 · 23%");
  });
});
