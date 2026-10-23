import { encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { qrPng } from "./qr";
import { qrKey, readQrText } from "./slip-qr";

const SLIP_QR = "004100060000010103014022001234567890ABCDEFG5102TH91047F2E";

/** A PNG decoded to a JPEG, as a camera or a screenshot tool would make it. */
function asJpeg(png: Uint8Array, quality = 90): Uint8Array {
  const raster = PNG.sync.read(Buffer.from(png));
  return encodeJpeg({ data: raster.data, width: raster.width, height: raster.height }, quality)
    .data;
}

describe("readQrText", () => {
  it("reads the QR in a PNG", () => {
    expect(readQrText(qrPng(SLIP_QR), "image/png")).toBe(SLIP_QR);
  });

  it("reads it from a JPEG, which is what LINE hands over", () => {
    expect(readQrText(asJpeg(qrPng(SLIP_QR)), "image/jpeg")).toBe(SLIP_QR);
    expect(readQrText(asJpeg(qrPng(SLIP_QR), 40), "image/jpeg")).toBe(SLIP_QR); // a rough compression too
  });

  it("works out which format it got even when the type says something else", () => {
    expect(readQrText(qrPng(SLIP_QR), "application/octet-stream")).toBe(SLIP_QR);
  });

  it("finds it in a big picture by shrinking it first", () => {
    const qr = QRCode.create(SLIP_QR, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const matrix: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      matrix.push(
        Array.from(
          { length: size },
          (_, x) => (qr.modules.data as ArrayLike<number>)[y * size + x] === 1,
        ),
      );
    }
    // about 9 megapixels
    const big = encodeBigPng(matrix, 70, 4);
    expect(readQrText(big, "image/png")).toBe(SLIP_QR);
  });

  it("is null for a picture with no QR, for a broken file and for nothing", () => {
    const blank = new PNG({ width: 120, height: 120 });
    blank.data.fill(255);
    expect(readQrText(PNG.sync.write(blank), "image/png")).toBeNull();
    expect(readQrText(new Uint8Array([1, 2, 3, 4]), "image/jpeg")).toBeNull();
    expect(readQrText(new Uint8Array(0), "image/png")).toBeNull();
  });
});

describe("qrKey", () => {
  it("is the same for the same slip however it was captured, and different for another slip", () => {
    expect(qrKey(SLIP_QR)).toBe(qrKey(` ${SLIP_QR}\n`));
    expect(qrKey(SLIP_QR)).not.toBe(qrKey(SLIP_QR + "1"));
    expect(qrKey(SLIP_QR)).toMatch(/^[0-9a-f]{64}$/);
  });
});

function encodeBigPng(matrix: boolean[][], scale: number, margin: number): Uint8Array {
  const n = matrix.length;
  const size = (n + margin * 2) * scale;
  const png = new PNG({ width: size, height: size });
  png.data.fill(255);
  for (let y = 0; y < size; y++) {
    const my = Math.floor(y / scale) - margin;
    if (my < 0 || my >= n) continue;
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - margin;
      if (mx < 0 || mx >= n || !matrix[my]![mx]) continue;
      const i = (y * size + x) * 4;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
    }
  }
  return PNG.sync.write(png);
}
