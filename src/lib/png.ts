/**
 * A tiny PNG writer for black-and-white pictures (a QR code), with no dependencies and no zlib:
 * the pixels go in "stored" deflate blocks. Small enough for a QR (about 20 KB), and it runs anywhere.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const v of bytes) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(8 + data.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

/** zlib stream made of stored (uncompressed) deflate blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: number[] = [0x78, 0x01];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const part = raw.subarray(i, Math.min(raw.length, i + 65535));
    const last = i + 65535 >= raw.length ? 1 : 0;
    blocks.push(
      last,
      part.length & 255,
      part.length >>> 8,
      ~part.length & 255,
      (~part.length >>> 8) & 255,
    );
    for (const v of part) blocks.push(v);
    if (raw.length === 0) break;
  }
  blocks.push(...u32(adler32(raw)));
  return Uint8Array.from(blocks);
}

/**
 * `matrix[y][x]` true = black. Each module becomes `scale` pixels, with `margin` white modules around
 * (a QR needs a quiet zone of 4). Returns the PNG bytes (1 bit per pixel).
 */
export function encodeBilevelPng(matrix: boolean[][], scale: number, margin: number): Uint8Array {
  const modules = matrix.length;
  const size = (modules + margin * 2) * scale;
  const rowBytes = Math.ceil(size / 8);
  const raw = new Uint8Array((rowBytes + 1) * size);
  raw.fill(0xff); // every bit white (1 = white in a 1-bit greyscale PNG)
  for (let py = 0; py < size; py++) {
    const rowStart = py * (rowBytes + 1);
    raw[rowStart] = 0; // filter: none
    const my = Math.floor(py / scale) - margin;
    if (my < 0 || my >= modules) continue;
    const row = matrix[my] as boolean[];
    for (let px = 0; px < size; px++) {
      const mx = Math.floor(px / scale) - margin;
      if (mx < 0 || mx >= modules || !row[mx]) continue;
      const idx = rowStart + 1 + (px >> 3);
      raw[idx] = (raw[idx] as number) & ~(0x80 >> (px & 7)); // black = 0
    }
  }
  const ihdr = Uint8Array.from([...u32(size), ...u32(size), 1, 0, 0, 0, 0]); // 1-bit greyscale
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
