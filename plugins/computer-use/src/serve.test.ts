import { randomUUID } from "node:crypto";
import { type Server, type Socket, connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { type ServerFrame, FrameDecoder, MAX_CLIENT_FRAME_BYTES, encodeFrame, parseServerFrame } from "./link.ts";
import { MAX_CALLS_IN_FLIGHT, serveConnection } from "./serve.ts";

const scratchPipe = () =>
  process.platform === "win32" ? `\\\\.\\pipe\\t3mode-cu-test-${randomUUID()}` : join(tmpdir(), `cu-test-${randomUUID()}.sock`);

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function connectToServed(): Promise<{ socket: Socket; frames: ServerFrame[]; closed: Promise<void> }> {
  const pipe = scratchPipe();
  const server = createServer((socket) =>
    serveConnection(socket, () => ({ label: "test", call: () => new Promise(() => {}), close: () => {} }), () => {}),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(pipe, resolve));
  const socket = connect(pipe);
  const frames: ServerFrame[] = [];
  const decoder = new FrameDecoder(parseServerFrame, 1 << 20);
  socket.on("data", (chunk) => frames.push(...(decoder.push(chunk) as ServerFrame[])));
  const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()));
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(encodeFrame({ t: "hello", v: 1, client: { name: "test", version: "1", cwd: "", pid: 1, title: "" } }));
  return { socket, frames, closed };
}

const until = async (ok: () => boolean, what: string) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!ok()) throw new Error(`timed out waiting for ${what}`);
};

describe("serveConnection", () => {
  it("refuses a call past the in-flight cap and keeps the link", async () => {
    const { socket, frames } = await connectToServed();
    for (let id = 1; id <= MAX_CALLS_IN_FLIGHT + 1; id++) socket.write(encodeFrame({ t: "call", id, tool: "observe", args: {} }));
    await until(() => frames.some((f) => f.t === "result"), "a refusal");
    const results = frames.filter((f) => f.t === "result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: MAX_CALLS_IN_FLIGHT + 1, result: { isError: true } });
    expect(JSON.stringify(results[0])).toMatch(/Too many computer-use calls at once/);
    expect(socket.destroyed).toBe(false);
    socket.destroy();
  });

  it("drops a link that sends an oversized frame", async () => {
    const { socket, closed } = await connectToServed();
    socket.write(new Uint8Array(MAX_CLIENT_FRAME_BYTES + 1).fill(0x20));
    await closed;
  });
});
