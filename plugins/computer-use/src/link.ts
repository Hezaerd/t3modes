import { createHash } from "node:crypto";
import * as path from "node:path";

import type { ToolResult } from "./tools.ts";

export const LINK_VERSION = 1;
export const PLUGIN_ID = "computer-use";

/** What t3mode passes the backend as `api.dataDir`, rebuilt from a tool server's T3MODE_HOME. */
export const dataDirFromHome = (home: string): string => path.join(home, "plugin-data", PLUGIN_ID);

const normalize = (dir: string, platform: NodeJS.Platform): string => {
  const p = platform === "win32" ? path.win32 : path.posix;
  const resolved = p.resolve(dir).replace(/[\\/]+$/, "");
  return platform === "win32" ? resolved.toLowerCase() : resolved;
};

/** Both sides derive the name from the plugin's data folder, so no endpoint file can go stale. */
export const pipeName = (dataDir: string, platform: NodeJS.Platform): string => {
  const normalized = normalize(dataDir, platform);
  if (platform !== "win32") return path.posix.join(normalized, "link.sock");
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `\\\\.\\pipe\\t3mode-computer-use-${digest}`;
};

export interface ClientInfo {
  readonly name: string;
  readonly version: string;
  readonly cwd: string;
  readonly pid: number;
}

export type ClientFrame =
  | { readonly t: "hello"; readonly v: number; readonly client: ClientInfo }
  | { readonly t: "call"; readonly id: number; readonly tool: string; readonly args: unknown }
  | { readonly t: "cancel"; readonly id: number };

export type ServerFrame =
  | { readonly t: "welcome"; readonly v: number }
  | { readonly t: "result"; readonly id: number; readonly result: ToolResult }
  | { readonly t: "bye"; readonly reason: string };

/** A tool server sends arguments; the backend sends screenshots, so its frames may be far larger. */
export const MAX_CLIENT_FRAME_BYTES = 1 << 20;
export const MAX_SERVER_FRAME_BYTES = 64 << 20;

export const encodeFrame = (frame: ClientFrame | ServerFrame): string => JSON.stringify(frame) + "\n";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isString = (value: unknown): value is string => typeof value === "string";

export const parseClientFrame = (value: unknown): ClientFrame | null => {
  if (!isRecord(value)) return null;
  switch (value.t) {
    case "hello": {
      const c = value.client;
      if (!isId(value.v) || !isRecord(c)) return null;
      if (!isString(c.name) || !isString(c.version) || !isString(c.cwd) || !isId(c.pid)) return null;
      return { t: "hello", v: value.v, client: { name: c.name, version: c.version, cwd: c.cwd, pid: c.pid } };
    }
    case "call":
      return isId(value.id) && isString(value.tool)
        ? { t: "call", id: value.id, tool: value.tool, args: value.args }
        : null;
    case "cancel":
      return isId(value.id) ? { t: "cancel", id: value.id } : null;
    default:
      return null;
  }
};

const isToolResult = (value: unknown): value is ToolResult =>
  isRecord(value) && typeof value.isError === "boolean" && Array.isArray(value.content);

export const parseServerFrame = (value: unknown): ServerFrame | null => {
  if (!isRecord(value)) return null;
  switch (value.t) {
    case "welcome":
      return isId(value.v) ? { t: "welcome", v: value.v } : null;
    case "result":
      return isId(value.id) && isToolResult(value.result)
        ? { t: "result", id: value.id, result: value.result }
        : null;
    case "bye":
      return isString(value.reason) ? { t: "bye", reason: value.reason } : null;
    default:
      return null;
  }
};

/** A bad or oversized line is an error: close the link. */
export class FrameDecoder<F> {
  private pending = "";
  private pendingBytes = 0;
  private readonly utf8 = new TextDecoder();

  constructor(
    private readonly parse: (value: unknown) => F | null,
    private readonly maxBytes: number,
  ) {}

  push(chunk: Uint8Array): ReadonlyArray<F> | { readonly error: string } {
    const lastNewline = chunk.lastIndexOf(0x0a);
    this.pendingBytes = lastNewline < 0 ? this.pendingBytes + chunk.length : chunk.length - lastNewline - 1;
    if (this.pendingBytes > this.maxBytes) return { error: `a frame is over ${this.maxBytes} bytes` };
    this.pending += this.utf8.decode(chunk, { stream: true });
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    const frames: F[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        return { error: "a frame is not JSON" };
      }
      const frame = this.parse(value);
      if (frame === null) return { error: "a frame has the wrong shape" };
      frames.push(frame);
    }
    return frames;
  }
}
