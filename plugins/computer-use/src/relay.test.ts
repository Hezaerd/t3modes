import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vite-plus/test";

import { type ClientFrame, FrameDecoder, dataDirFromHome, encodeFrame, parseClientFrame, pipeName } from "./link.ts";
import { runRelay } from "./relay.ts";

const until = async (ok: () => boolean, what: string) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!ok()) throw new Error(`timed out waiting for ${what}`);
};

describe("runRelay", () => {
  it("closes the backend link and exits once its MCP client goes away", async () => {
    const home = mkdtempSync(join(tmpdir(), "cu-relay-"));
    const dataDir = dataDirFromHome(home);
    mkdirSync(dataDir, { recursive: true });
    const seen: ClientFrame[] = [];
    let linkClosed = false;
    const backend = createServer((socket) => {
      const decoder = new FrameDecoder(parseClientFrame, 1 << 20);
      socket.on("data", (chunk) => {
        for (const frame of decoder.push(chunk) as ClientFrame[]) {
          seen.push(frame);
          if (frame.t === "hello") socket.write(encodeFrame({ t: "welcome", v: 1 }));
        }
      });
      socket.on("close", () => (linkClosed = true));
    });
    await new Promise<void>((resolve) => backend.listen(pipeName(dataDir, process.platform), resolve));
    try {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const exits: number[] = [];
      runRelay({ home, supported: true, stdin, stdout, exit: (code) => exits.push(code) });
      const send = (message: object) => stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
      send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
      send({ method: "notifications/initialized" });
      send({ id: 2, method: "tools/call", params: { name: "act", arguments: { steps: [] } } });
      await until(() => seen.some((f) => f.t === "call"), "the call to reach the backend");

      stdin.end();
      await until(() => linkClosed && exits.length > 0, "the link to close and the relay to exit");
      expect(exits).toEqual([0]);
    } finally {
      backend.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
