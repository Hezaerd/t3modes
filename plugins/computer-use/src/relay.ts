import { connect, type Socket } from "node:net";
import type { Readable, Writable } from "node:stream";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import {
  type ClientInfo,
  type ServerFrame,
  FrameDecoder,
  LINK_VERSION,
  MAX_SERVER_FRAME_BYTES,
  dataDirFromHome,
  encodeFrame,
  parseServerFrame,
  pipeName,
} from "./link.ts";
import { type ToolResult, type Unreachable, TOOL_LIST, renderUnreachable } from "./tools.ts";

const CONNECT_RETRY_MS = 1500;
const VERSION = "1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Link {
  private socket: Socket | null = null;
  private ready: Promise<Unreachable | null> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (result: ToolResult) => void>();
  private readonly sockets = new Set<Socket>();

  constructor(
    private readonly pipe: string,
    private readonly client: () => ClientInfo,
  ) {}

  private open(): Promise<Unreachable | null> {
    return new Promise((resolve) => {
      const deadline = Date.now() + CONNECT_RETRY_MS;
      const attempt = () => {
        const socket = connect(this.pipe);
        this.sockets.add(socket);
        const decoder = new FrameDecoder(parseServerFrame, MAX_SERVER_FRAME_BYTES);
        let welcomed = false;
        socket.once("connect", () => {
          socket.write(encodeFrame({ t: "hello", v: LINK_VERSION, client: this.client() }));
        });
        socket.on("data", (chunk) => {
          const frames = decoder.push(chunk);
          if ("error" in frames) return socket.destroy();
          for (const frame of frames) this.receive(frame, socket, resolve, () => (welcomed = true));
        });
        socket.on("error", (error: NodeJS.ErrnoException) => {
          if (welcomed) return;
          if ((error.code === "ENOENT" || error.code === "EPIPE" || error.code === "ECONNREFUSED") && Date.now() < deadline) {
            void sleep(100).then(attempt);
          } else resolve("no-backend");
        });
        socket.on("close", () => {
          this.sockets.delete(socket);
          if (this.socket === socket) {
            this.socket = null;
            this.ready = null;
          }
          for (const [id, settle] of this.pending) {
            this.pending.delete(id);
            settle(renderUnreachable("backend-died"));
          }
        });
      };
      attempt();
    });
  }

  private receive(frame: ServerFrame, socket: Socket, resolve: (value: Unreachable | null) => void, welcome: () => void) {
    switch (frame.t) {
      case "welcome":
        welcome();
        this.socket = socket;
        resolve(null);
        return;
      case "bye":
        resolve("version-skew");
        socket.destroy();
        return;
      case "result": {
        const settle = this.pending.get(frame.id);
        this.pending.delete(frame.id);
        settle?.(frame.result);
      }
    }
  }

  close(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  async call(tool: string, args: unknown, signal: AbortSignal): Promise<ToolResult> {
    if (!this.socket) {
      this.ready ??= this.open();
      const problem = await this.ready;
      if (problem) {
        this.ready = null;
        return renderUnreachable(problem);
      }
    }
    const socket = this.socket!;
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      signal.addEventListener("abort", () => socket.write(encodeFrame({ t: "cancel", id })), { once: true });
      socket.write(encodeFrame({ t: "call", id, tool, args: args ?? {} }));
    });
  }
}

export interface RelayOptions {
  readonly home: string | undefined;
  readonly supported: boolean;
  readonly stdin: Readable;
  readonly stdout: Writable;
  readonly exit: (code: number) => void;
}

export function runRelay(options: RelayOptions): void {
  const server = new Server({ name: "t3mode-computer-use", version: VERSION }, { capabilities: { tools: {} } });
  const link = options.home
    ? new Link(pipeName(dataDirFromHome(options.home), process.platform), () => {
        const client = server.getClientVersion();
        return { name: client?.name ?? "", version: client?.version ?? "", cwd: process.cwd(), pid: process.pid };
      })
    : null;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOL_LIST] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!options.supported) return { ...renderUnreachable("unsupported-platform") };
    if (!link) return { ...renderUnreachable("no-backend") };
    return { ...(await link.call(request.params.name, request.params.arguments, extra.signal)) };
  });

  let gone = false;
  const clientGone = () => {
    if (gone) return;
    gone = true;
    link?.close();
    options.exit(0);
  };
  options.stdin.once("end", clientGone);
  options.stdin.once("close", clientGone);
  server.onclose = clientGone;

  void server.connect(new StdioServerTransport(options.stdin, options.stdout));
}
