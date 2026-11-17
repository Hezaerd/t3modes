// RGBA8 to PNG, tuned for screenshots: the Up filter and deflate level 1 are about three times
// faster than xa11y's toPng on a 1280-wide window, and screenshots compress well either way.
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Buffer => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const encodePng = (rgba: Uint8Array, width: number, height: number): Buffer => {
  const stride = width * 4;
  if (rgba.length !== stride * height) throw new Error(`expected ${stride * height} bytes, got ${rgba.length}`);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    const row = y * stride;
    if (y === 0) {
      raw[at] = 0;
      raw.set(rgba.subarray(0, stride), at + 1);
      continue;
    }
    raw[at] = 2;
    for (let x = 0; x < stride; x++) raw[at + 1 + x] = (rgba[row + x]! - rgba[row - stride + x]!) & 0xff;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", new Uint8Array()),
  ]);
};
