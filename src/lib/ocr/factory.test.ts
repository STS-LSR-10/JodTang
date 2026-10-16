import { describe, expect, it } from "vitest";
import { buildSlipReader, readerOrder } from "./factory";

describe("readerOrder", () => {
  it("default: slip APIs, then the chosen AI, then the other AIs", () => {
    expect(readerOrder({ AI_PROVIDER: "gemini" })).toEqual([
      "easyslip",
      "slip2go",
      "gemini",
      "anthropic",
      "openai",
    ]);
    expect(readerOrder({ AI_PROVIDER: "anthropic" })).toEqual([
      "easyslip",
      "slip2go",
      "anthropic",
      "gemini",
      "openai",
    ]);
  });

  it("SLIP_READERS overrides, ignoring unknown names and duplicates", () => {
    expect(
      readerOrder({ AI_PROVIDER: "gemini", SLIP_READERS: " Gemini, nope, easyslip ,gemini" }),
    ).toEqual(["gemini", "easyslip"]);
  });

  it("an empty/invalid override falls back to the default", () => {
    expect(readerOrder({ AI_PROVIDER: "openai", SLIP_READERS: "nope" })[0]).toBe("easyslip");
  });
});

describe("buildSlipReader", () => {
  it("includes only configured readers, in order", () => {
    const built = buildSlipReader({
      AI_PROVIDER: "gemini",
      EASYSLIP_API_KEY: "e",
      GEMINI_API_KEY: "g",
      OPENAI_API_KEY: "o",
    });
    expect(built.active).toEqual(["easyslip", "gemini", "openai"]);
    expect(built.skipped).toEqual(["slip2go", "anthropic"]);
    expect(built.reader.name).toBe("easyslip > gemini:gemini-3.5-flash-lite > openai:gpt-4o-mini");
  });

  it("works with just an AI key", () => {
    const built = buildSlipReader({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g" });
    expect(built.active).toEqual(["gemini"]);
  });

  it("applies AI_MODEL to the chosen provider only", () => {
    const built = buildSlipReader({
      AI_PROVIDER: "anthropic",
      AI_MODEL: "my-model",
      ANTHROPIC_API_KEY: "a",
      OPENAI_API_KEY: "o",
    });
    expect(built.reader.name).toBe("anthropic:my-model > openai:gpt-4o-mini");
  });

  it("throws when nothing is configured", () => {
    expect(() => buildSlipReader({ AI_PROVIDER: "gemini" })).toThrow(/no slip reader/);
  });
});
