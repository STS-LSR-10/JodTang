import { createHash } from "node:crypto";
import { decode as decodeJpeg } from "jpeg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";

/** Pictures bigger than this many pixels are shrunk before the QR is looked for (it is slow on huge ones). */
const MAX_PIXELS = 2_500_000;

interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function decodeImage(bytes: Uint8Array, mimeType: string): Raster | null {
  try {
    if (mimeType.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
      const png = PNG.sync.read(Buffer.from(bytes));
      return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
    }
    const jpeg = decodeJpeg(Buffer.from(bytes), { useTArray: true, maxMemoryUsageInMB: 256 });
    return { data: new Uint8ClampedArray(jpeg.data), width: jpeg.width, height: jpeg.height };
  } catch {
    return null;
  }
}

/** Shrink by a whole factor (averaging nothing: a plain pick is enough to keep a QR readable). */
function shrink(r: Raster, factor: number): Raster {
  const width = Math.floor(r.width / factor);
  const height = Math.floor(r.height / factor);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * factor * r.width + x * factor) * 4;
      data.set(r.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

/** The text of the QR code in a picture (the slip's own QR), or null when there is none we can read. */
export function readQrText(bytes: Uint8Array, mimeType: string): string | null {
  const raster = decodeImage(bytes, mimeType);
  if (!raster) return null;
  const pixels = raster.width * raster.height;
  const factor = pixels > MAX_PIXELS ? Math.ceil(Math.sqrt(pixels / MAX_PIXELS)) : 1;
  const first = factor > 1 ? shrink(raster, factor) : raster;
  const hit = jsQR(first.data, first.width, first.height, { inversionAttempts: "attemptBoth" });
  if (hit?.data) return hit.data;
  // a QR can be too small to survive the shrinking: one more try at full size when it is not huge
  if (factor > 1 && pixels <= MAX_PIXELS * 4) {
    const again = jsQR(raster.data, raster.width, raster.height, {
      inversionAttempts: "dontInvert",
    });
    if (again?.data) return again.data;
  }
  return null;
}

/** A stable key for a slip's QR: the same slip, photographed or screenshotted again, gives the same one. */
export function qrKey(qrText: string): string {
  return createHash("sha256").update(qrText.trim()).digest("hex");
}
