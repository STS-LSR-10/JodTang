import QRCode from "qrcode";
import { encodeBilevelPng } from "./png";

/** The QR code of `text` as PNG bytes (about 440 px square, with the quiet zone QR readers need). */
export function qrPng(text: string): Uint8Array {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data as ArrayLike<number>;
  const matrix: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(data[y * size + x] === 1);
    matrix.push(row);
  }
  const scale = Math.max(4, Math.floor(440 / (size + 8)));
  return encodeBilevelPng(matrix, scale, 4);
}
