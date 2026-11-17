import type { Socket } from "node:net";

import {
  type ClientInfo,
  type ServerFrame,
  FrameDecoder,
  LINK_VERSION,
  MAX_CLIENT_FRAME_BYTES,
  encodeFrame,
  parseClientFrame,
} from "./link.ts";
import type { ToolResult } from "./tools.ts";

export const MAX_CALLS_IN_FLIGHT = 8;

const TOO_MANY: ToolResult = {
  isError: true,
  content: [{ type: "text", text: "Too many computer-use calls at once. Nothing was sent. Wait for the earlier calls to finish." }],
};

export interface ServedSession {
  readonly label: string;
  call(tool: string, args: unknown, cancel: AbortSignal): Promise<ToolResult>;
  close(): void;
}

export function serveConnection(
  socket: Socket,
  openSession: (client: ClientInfo) => ServedSession,
  log: (level: "info" | "warn", message: string) => void,
): void {
  const decoder = new FrameDecoder(parseClientFrame, MAX_CLIENT_FRAME_BYTES);
  const calls = new Map<number, AbortController>();
  let session: ServedSession | null = null;
  const write = (frame: ServerFrame) => {
    if (!socket.destroyed) socket.write(encodeFrame(frame));
  };
  socket.on("data", (chunk) => {
    const frames = decoder.push(chunk);
    if ("error" in frames) {
      log("warn", `Dropped a tool server: ${frames.error}`);
      socket.destroy();
      return;
    }
    for (const frame of frames) {
      if (frame.t === "hello") {
        if (frame.v !== LINK_VERSION) {
          write({ t: "bye", reason: `protocol v${LINK_VERSION} required` });
          socket.end();
          return;
        }
        session ??= openSession(frame.client);
        log("info", `Tool server connected: ${session.label} (pid ${frame.client.pid})`);
        write({ t: "welcome", v: LINK_VERSION });
      } else if (frame.t === "call") {
        if (!session || calls.has(frame.id)) {
          socket.destroy();
          return;
        }
        if (calls.size >= MAX_CALLS_IN_FLIGHT) {
          write({ t: "result", id: frame.id, result: TOO_MANY });
          continue;
        }
        const abort = new AbortController();
        calls.set(frame.id, abort);
        const id = frame.id;
        void session.call(frame.tool, frame.args, abort.signal).then((result) => {
          calls.delete(id);
          write({ t: "result", id, result });
        });
      } else {
        calls.get(frame.id)?.abort(new Error("cancelled"));
      }
    }
  });
  socket.on("error", () => {});
  socket.on("close", () => {
    for (const abort of calls.values()) abort.abort(new Error("disconnected"));
    if (session) {
      log("info", `Tool server left: ${session.label}`);
      session.close();
    }
  });
}
