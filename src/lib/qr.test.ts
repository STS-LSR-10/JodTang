import { inflateSync } from "node:zlib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { encodeBilevelPng } from "./png";
import { promptPayPayload } from "./promptpay";
import { qrPng } from "./qr";

/** Read a PNG back: checks the signature and every chunk's CRC, and returns size and pixel rows. */
function decode(png: Uint8Array) {
  expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  const crcOf = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = new TextDecoder().decode(png.slice(at + 4, at + 8));
    const data = png.slice(at + 8, at + 8 + len);
    expect(view.getUint32(at + 8 + len), `CRC of ${type}`).toBe(
      crcOf(png.slice(at + 4, at + 8 + len)),
    );
    if (type === "IHDR") {
      width = new DataView(data.buffer, data.byteOffset).getUint32(0);
      height = new DataView(data.buffer, data.byteOffset).getUint32(4);
      expect(data[8]).toBe(1); // 1 bit per pixel
      expect(data[9]).toBe(0); // greyscale
    }
    if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rowBytes = Math.ceil(width / 8);
  expect(raw.length).toBe((rowBytes + 1) * height);
  const pixel = (x: number, y: number) => {
    const byte = raw[y * (rowBytes + 1) + 1 + (x >> 3)] as number;
    return (byte >> (7 - (x & 7))) & 1; // 1 = white
  };
  return { width, height, pixel, raw };
}

describe("encodeBilevelPng", () => {
  it("writes a PNG that reads back pixel for pixel (black modules are 0, the quiet zone is white)", () => {
    const matrix = [
      [true, false, true],
      [false, true, false],
      [true, true, false],
    ];
    const { width, height, pixel } = decode(encodeBilevelPng(matrix, 3, 2));
    expect(width).toBe((3 + 4) * 3);
    expect(height).toBe(width);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const mx = Math.floor(x / 3) - 2;
        const my = Math.floor(y / 3) - 2;
        const black = mx >= 0 && mx < 3 && my >= 0 && my < 3 && matrix[my]![mx];
        expect(pixel(x, y), `(${x},${y})`).toBe(black ? 0 : 1);
      }
    }
  });

  it("handles a width that is not a multiple of eight and a picture bigger than one stored block", () => {
    const size = 120;
    const matrix = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => (x + y) % 2 === 0),
    );
    const { width, height, raw } = decode(encodeBilevelPng(matrix, 9, 4));
    expect(width).toBe((size + 8) * 9);
    expect(height).toBe(width);
    expect(raw.length).toBeGreaterThan(65_535); // more than one deflate block
  });
});

describe("qrPng", () => {
  it("draws the QR of a PromptPay payload: finder corner black, quiet zone white, a sensible size", () => {
    const png = qrPng(promptPayPayload({ id: "0812345678", amountSatang: 30_000 }));
    const { width, height, pixel } = decode(png);
    expect(width).toBe(height);
    expect(width).toBeGreaterThan(300);
    expect(width).toBeLessThan(700);
    expect(png.length).toBeLessThan(80_000);
    expect(pixel(0, 0)).toBe(1); // quiet zone
    // the top-left finder pattern starts right after the 4-module quiet zone
    const payload = promptPayPayload({ id: "0812345678", amountSatang: 30_000 });
    const modules = QRCode.create(payload, { errorCorrectionLevel: "M" }).modules.size;
    const scale = Math.max(4, Math.floor(440 / (modules + 8)));
    expect(pixel(4 * scale, 4 * scale)).toBe(0);
    expect(pixel(4 * scale - 1, 4 * scale)).toBe(1);
  });

  it("is different for a different amount (the amount is inside the code)", () => {
    const a = qrPng(promptPayPayload({ id: "0812345678", amountSatang: 30_000 }));
    const b = qrPng(promptPayPayload({ id: "0812345678", amountSatang: 30_001 }));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});
