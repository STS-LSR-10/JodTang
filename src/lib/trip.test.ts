import { describe, expect, it } from "vitest";
import {
  computeSettlement,
  parseSplitClause,
  parseTripCommand,
  participantsOf,
  resolveNames,
  settleTransfers,
  splitAmount,
} from "./trip";

describe("parseTripCommand", () => {
  it.each([
    ["เริ่มทริป เที่ยวเชียงใหม่", { kind: "trip-start", name: "เที่ยวเชียงใหม่" }],
    ["เริ่มทริป  ไป ญี่ปุ่น  2026", { kind: "trip-start", name: "ไป ญี่ปุ่น 2026" }],
    ["ร่วมทริป", { kind: "trip-join" }],
    ["สรุปทริป", { kind: "trip-summary" }],
    ["จบทริป", { kind: "trip-close" }],
    ["ทริปเก่า", { kind: "trip-old" }],
    ["ทริป", { kind: "trip-status" }],
  ])("%s", (input, expected) => {
    expect(parseTripCommand(input)).toEqual(expected);
  });

  it.each(["เริ่มทริป", `เริ่มทริป ${"ก".repeat(41)}`, "ทริปนี้สนุกมาก", "จด ข้าว 100", "สรุป"])(
    "%s is not a trip command",
    (input) => {
      expect(parseTripCommand(input)).toBeNull();
    },
  );
});

describe("parseSplitClause", () => {
  it("หาร: only these people", () => {
    expect(parseSplitClause("ไวน์ 900 หาร แอน บ๊อบ")).toEqual({
      body: "ไวน์ 900",
      mode: "only",
      names: ["แอน", "บ๊อบ"],
    });
  });

  it("ไม่หาร: everyone but these", () => {
    expect(parseSplitClause("ค่าห้อง 3,000 ไม่หาร บ๊อบ")).toEqual({
      body: "ค่าห้อง 3,000",
      mode: "except",
      names: ["บ๊อบ"],
    });
  });

  it("names may be separated by commas", () => {
    expect(parseSplitClause("ข้าว 300 หาร แอน, บ๊อบ").names).toEqual(["แอน", "บ๊อบ"]);
  });

  it.each([
    "ข้าว 300",
    "ค่าหารสอง 100", // หาร glued into a word
    "หาร แอน บ๊อบ", // no amount before it
    "ข้าว 300 หาร", // no names
    "ข้าว 300 หาร 2 คน", // digits are not names
  ])("%s has no split clause", (input) => {
    expect(parseSplitClause(input)).toEqual({ body: input, mode: "all", names: [] });
  });
});

describe("resolveNames", () => {
  const people = [
    { id: "Ua", name: "แอน" },
    { id: "Ub", name: "บ๊อบ" },
    { id: "Uc", name: "บอล" },
  ];

  it("exact name or a unique start, no duplicates", () => {
    expect(resolveNames(["แอน", "บ๊อ", "แอน"], people)).toEqual({ ok: true, ids: ["Ua", "Ub"] });
  });

  it("says which names are unknown or fit several people", () => {
    expect(resolveNames(["แอน", "นก"], people)).toEqual({
      ok: false,
      unknown: ["นก"],
      ambiguous: [],
    });
    expect(resolveNames(["บ"], people)).toEqual({ ok: false, unknown: [], ambiguous: ["บ"] });
  });
});

describe("participantsOf", () => {
  const members = ["Ua", "Ub", "Uc"];
  it("all: everyone on the trip, and the payer even if they have not joined", () => {
    expect(participantsOf("all", [], members, "Ua")).toEqual(members);
    expect(participantsOf("all", [], members, "Ud")).toEqual([...members, "Ud"]);
  });
  it("only: just the named; except: the rest", () => {
    expect(participantsOf("only", ["Ua", "Ub"], members, "Ua")).toEqual(["Ua", "Ub"]);
    expect(participantsOf("except", ["Ub"], members, "Ua")).toEqual(["Ua", "Uc"]);
  });
  it("excluding everyone leaves the payer alone", () => {
    expect(participantsOf("except", members, members, "Ua")).toEqual(["Ua"]);
  });
});

describe("splitAmount", () => {
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  it("an even split", () => {
    expect([...splitAmount(90_000, ["Ua", "Ub", "Uc"], "Ua").values()]).toEqual([
      30_000, 30_000, 30_000,
    ]);
  });

  it("the shares always add up to the amount; the odd satang go to the payer first", () => {
    const s = splitAmount(10_000, ["Ua", "Ub", "Uc"], "Ub"); // 100.00 / 3
    expect(sum(s)).toBe(10_000);
    expect(s.get("Ub")).toBe(3334);
    expect(s.get("Ua")).toBe(3333);
    expect(s.get("Uc")).toBe(3333);
  });

  it("two odd satang go to the payer and the next person", () => {
    const s = splitAmount(10_001, ["Ua", "Ub", "Uc"], "Ua"); // 3333*3 = 9999, 2 left
    expect(sum(s)).toBe(10_001);
    expect([s.get("Ua"), s.get("Ub"), s.get("Uc")]).toEqual([3334, 3334, 3333]);
  });

  it("a payer who does not share it pays none of it", () => {
    const s = splitAmount(500, ["Ub", "Uc"], "Ua");
    expect(s.has("Ua")).toBe(false);
    expect(sum(s)).toBe(500);
  });

  it("nobody listed: the payer carries it", () => {
    expect(splitAmount(700, [], "Ua")).toEqual(new Map([["Ua", 700]]));
  });
});

describe("settleTransfers", () => {
  it("matches the biggest debts with the biggest credits", () => {
    const t = settleTransfers(
      new Map([
        ["Ua", 50_000],
        ["Ub", -30_000],
        ["Uc", -20_000],
      ]),
    );
    expect(t).toEqual([
      { from: "Ub", to: "Ua", amountSatang: 30_000 },
      { from: "Uc", to: "Ua", amountSatang: 20_000 },
    ]);
  });

  it("uses at most (people - 1) transfers and settles everything", () => {
    const net = new Map([
      ["A", 70_000],
      ["B", 30_000],
      ["C", -45_000],
      ["D", -35_000],
      ["E", -20_000],
    ]);
    const t = settleTransfers(net);
    expect(t.length).toBeLessThanOrEqual(4);
    const after = new Map(net);
    for (const x of t) {
      after.set(x.from, (after.get(x.from) ?? 0) + x.amountSatang);
      after.set(x.to, (after.get(x.to) ?? 0) - x.amountSatang);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it("nothing to do when everyone is even", () => {
    expect(
      settleTransfers(
        new Map([
          ["A", 0],
          ["B", 0],
        ]),
      ),
    ).toEqual([]);
  });
});

describe("computeSettlement", () => {
  it("three friends: Anna paid dinner for all, Bob paid the taxi for Anna and himself only", () => {
    const s = computeSettlement(
      [
        { payer: "Ua", amountSatang: 90_000, participants: ["Ua", "Ub", "Uc"] },
        { payer: "Ub", amountSatang: 20_000, participants: ["Ua", "Ub"] },
      ],
      ["Ua", "Ub", "Uc"],
    );
    expect(s.totalSatang).toBe(110_000);
    const by = Object.fromEntries(s.people.map((p) => [p.id, p]));
    expect(by.Ua).toMatchObject({ paidSatang: 90_000, owedSatang: 40_000, netSatang: 50_000 });
    expect(by.Ub).toMatchObject({ paidSatang: 20_000, owedSatang: 40_000, netSatang: -20_000 });
    expect(by.Uc).toMatchObject({ paidSatang: 0, owedSatang: 30_000, netSatang: -30_000 });
    expect(s.transfers).toEqual([
      { from: "Uc", to: "Ua", amountSatang: 30_000 },
      { from: "Ub", to: "Ua", amountSatang: 20_000 },
    ]);
  });

  it("the nets always add up to zero, even with odd satang", () => {
    const s = computeSettlement(
      [
        { payer: "Ua", amountSatang: 10_001, participants: ["Ua", "Ub", "Uc"] },
        { payer: "Uc", amountSatang: 333, participants: ["Ub", "Uc"] },
      ],
      ["Ua", "Ub", "Uc"],
    );
    expect(s.people.reduce((sum, p) => sum + p.netSatang, 0)).toBe(0);
    expect(s.transfers.reduce((sum, t) => sum + t.amountSatang, 0)).toBe(
      s.people.filter((p) => p.netSatang > 0).reduce((sum, p) => sum + p.netSatang, 0),
    );
  });

  it("a member who paid nothing and shared nothing is listed even", () => {
    const s = computeSettlement(
      [{ payer: "Ua", amountSatang: 100, participants: ["Ua"] }],
      ["Ua", "Ub"],
    );
    expect(s.people.map((p) => p.id).sort()).toEqual(["Ua", "Ub"]);
    expect(s.transfers).toEqual([]);
  });

  it("no entries: nothing to pay", () => {
    expect(computeSettlement([], ["Ua"])).toEqual({
      totalSatang: 0,
      people: [{ id: "Ua", paidSatang: 0, owedSatang: 0, netSatang: 0 }],
      transfers: [],
    });
  });
});
