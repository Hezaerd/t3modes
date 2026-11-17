import { describe, expect, it } from "vite-plus/test";

import {
  type ClientFrame,
  FrameDecoder,
  dataDirFromHome,
  encodeFrame,
  parseClientFrame,
  parseServerFrame,
  pipeName,
} from "./link.ts";

describe("pipeName", () => {
  it("agrees between the backend's dataDir and a tool server's T3MODE_HOME", () => {
    const backend = pipeName("C:\\Users\\Me\\.t3\\t3mode\\plugin-data\\computer-use", "win32");
    for (const home of ["C:\\Users\\Me\\.t3\\t3mode", "c:/users/me/.t3/t3mode/", "C:\\Users\\ME\\.t3\\t3mode\\"]) {
      expect(pipeName(dataDirFromHome(home), "win32")).toBe(backend);
    }
    expect(backend).toMatch(/^\\\\\.\\pipe\\t3mode-computer-use-[0-9a-f]{16}$/);
  });

  it("gives the sandbox and the real home different pipes", () => {
    expect(pipeName("D:\\repo\\.sandbox\\home\\plugin-data\\computer-use", "win32")).not.toBe(
      pipeName("C:\\Users\\Me\\.t3\\t3mode\\plugin-data\\computer-use", "win32"),
    );
  });

  it("uses a socket in the data folder elsewhere", () => {
    expect(pipeName("/home/me/.t3/t3mode/plugin-data/computer-use/", "linux")).toBe(
      "/home/me/.t3/t3mode/plugin-data/computer-use/link.sock",
    );
  });
});

describe("FrameDecoder", () => {
  const frames: ClientFrame[] = [
    { t: "hello", v: 1, client: { name: "claude-code", version: "2", cwd: "D:\\src\\é", pid: 9 } },
    { t: "call", id: 1, tool: "act", args: { steps: [] } },
    { t: "cancel", id: 1 },
  ];
  const bytes = new TextEncoder().encode(frames.map(encodeFrame).join(""));

  it("reassembles frames split anywhere, even inside a UTF-8 character", () => {
    for (const cut of [1, 7, bytes.indexOf(0xc3) + 1, bytes.length - 1]) {
      const decoder = new FrameDecoder(parseClientFrame);
      const first = decoder.push(bytes.subarray(0, cut));
      const second = decoder.push(bytes.subarray(cut));
      expect([...(first as ClientFrame[]), ...(second as ClientFrame[])]).toEqual(frames);
    }
  });

  it("returns several frames from one chunk", () => {
    expect(new FrameDecoder(parseClientFrame).push(bytes)).toEqual(frames);
  });

  it("rejects junk and wrong shapes", () => {
    expect(new FrameDecoder(parseClientFrame).push(new TextEncoder().encode("nope\n"))).toHaveProperty("error");
    expect(new FrameDecoder(parseClientFrame).push(new TextEncoder().encode('{"t":"call","id":-1}\n'))).toHaveProperty(
      "error",
    );
  });

  it("parses server frames", () => {
    expect(parseServerFrame({ t: "result", id: 2, result: { isError: false, content: [] } })).toEqual({
      t: "result",
      id: 2,
      result: { isError: false, content: [] },
    });
    expect(parseServerFrame({ t: "result", id: 2, result: {} })).toBeNull();
    expect(parseServerFrame({ t: "bye", reason: "skew" })).toEqual({ t: "bye", reason: "skew" });
  });
});
