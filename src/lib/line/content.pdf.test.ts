import { describe, expect, it } from "vitest";
import { fetchLinePdf, ImageError, inspectPdf, MAX_PDF_BYTES } from "./content";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("inspectPdf", () => {
  it("accepts a plain PDF", () => {
    expect(inspectPdf(bytes("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n%%EOF"))).toBeNull();
  });
  it("rejects what is not a PDF", () => {
    expect(inspectPdf(bytes("PK\u0003\u0004 zip"))).toBe("not_pdf");
  });
  it("spots a password-protected file", () => {
    expect(inspectPdf(bytes("%PDF-1.6\ntrailer << /Encrypt 12 0 R >>"))).toBe("locked");
  });
  it("counts pages but not the /Pages tree, and refuses long files", () => {
    const page = "<< /Type /Page >>\n";
    expect(inspectPdf(bytes(`%PDF-1.4\n<< /Type /Pages >>\n${page.repeat(10)}`))).toBeNull();
    expect(inspectPdf(bytes(`%PDF-1.4\n<< /Type /Pages >>\n${page.repeat(11)}`))).toBe(
      "too_many_pages",
    );
  });
});

describe("fetchLinePdf", () => {
  it("downloads the file", async () => {
    const f = (async () => new Response(bytes("%PDF-1.4"), { status: 200 })) as typeof fetch;
    expect((await fetchLinePdf("t", "m1", f)).byteLength).toBe(8);
  });
  it("refuses a file over the limit by its declared size", async () => {
    const f = (async () =>
      new Response(bytes("%PDF"), {
        status: 200,
        headers: { "content-length": String(MAX_PDF_BYTES + 1) },
      })) as typeof fetch;
    await expect(fetchLinePdf("t", "m1", f)).rejects.toMatchObject({ reason: "too_large" });
  });
  it("fails on a bad status", async () => {
    const f = (async () => new Response("no", { status: 404 })) as typeof fetch;
    await expect(fetchLinePdf("t", "m1", f)).rejects.toBeInstanceOf(ImageError);
  });
});
