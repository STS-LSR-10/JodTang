import { describe, expect, it } from "vitest";
import { applyOverrides, type CategoryDetail } from "./overrides";

const system: CategoryDetail = {
  id: "food",
  user_id: null,
  type: "expense",
  name: "อาหาร",
  keywords: ["ข้าว"],
  sort_order: 1,
  is_hidden: false,
  icon: "utensils",
  color: "#0F766E",
};
const own: CategoryDetail = { ...system, id: "mine", user_id: "u1", name: "คาเฟ่" };

describe("applyOverrides", () => {
  it("replaces keywords, visibility and order of a system category", () => {
    const [c] = applyOverrides(
      [system],
      [{ category_id: "food", keywords: ["ข้าว", "ก๋วยเตี๋ยว"], is_hidden: true, sort_order: 7 }],
    );
    expect(c).toMatchObject({
      keywords: ["ข้าว", "ก๋วยเตี๋ยว"],
      is_hidden: true,
      sort_order: 7,
      name: "อาหาร",
    });
  });

  it("null override fields keep the original value", () => {
    const [c] = applyOverrides(
      [system],
      [{ category_id: "food", keywords: null, is_hidden: null, sort_order: 3 }],
    );
    expect(c).toMatchObject({ keywords: ["ข้าว"], is_hidden: false, sort_order: 3 });
  });

  it("never overrides the user's own categories", () => {
    const [c] = applyOverrides(
      [own],
      [{ category_id: "mine", keywords: ["x"], is_hidden: true, sort_order: 9 }],
    );
    expect(c).toEqual(own);
  });

  it("does not mutate its input", () => {
    const input = [system];
    applyOverrides(input, [{ category_id: "food", keywords: [], is_hidden: true, sort_order: 2 }]);
    expect(input[0]).toEqual(system);
  });
});
