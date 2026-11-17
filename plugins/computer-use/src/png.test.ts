import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vite-plus/test";

import { crc32, encodePng } from "./png.ts";

interface Chunk {
  readonly type: string;
  readonly data: Buffer;
  readonly crcOk: boolean;
}

const readChunks = (png: Buffer): Chunk[] => {
  const chunks: Chunk[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString("latin1", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    const crcOk = png.readUInt32BE(at + 8 + length) === crc32(png.subarray(at + 4, at + 8 + length));
    chunks.push({ type, data, crcOk });
    at += 12 + length;
  }
  return chunks;
};

const unfilter = (raw: Buffer, width: number, height: number): Buffer => {
  const stride = width * 4;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const up = y > 0 ? out[(y - 1) * stride + x]! : 0;
      out[y * stride + x] = filter === 2 ? (value + up) & 0xff : value;
    }
  }
  return out;
};

describe("encodePng", () => {
  const width = 7;
  const height = 5;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + (i >> 3)) & 0xff;

  it("writes a valid PNG whose pixels round-trip", () => {
    const png = encodePng(rgba, width, height);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const header = chunks[0]!.data;
    expect([header.readUInt32BE(0), header.readUInt32BE(4), header[8], header[9]]).toEqual([width, height, 8, 6]);
    expect(unfilter(inflateSync(chunks[1]!.data), width, height)).toEqual(rgba);
  });

  it("matches the standard CRC-32", () => {
    expect(crc32(Buffer.from("IEND"))).toBe(0xae426082);
  });

  it("refuses a buffer of the wrong size", () => {
    expect(() => encodePng(rgba.subarray(4), width, height)).toThrow();
  });
});
