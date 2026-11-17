import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import { labelFor } from "./session.ts";
import { parseThreadTitle, threadTitle } from "./title.ts";

const ID = "dc1d0e89-c86b-4d33-a441-c4aa6c29efe1";
const dir = mkdtempSync(join(tmpdir(), "cu title "));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fakeCli = (json: string): string => {
  const windows = process.platform === "win32";
  const path = join(dir, windows ? "t3.cmd" : "t3");
  const body = windows ? `@echo off\r\necho ${json}\r\n` : `#!/bin/sh\necho '${json}'\n`;
  writeFileSync(path, body, { mode: 0o755 });
  return path;
};

describe("threadTitle", () => {
  it("asks T3 Code's CLI, from a folder with a space in its path", async () => {
    const cli = fakeCli(`{"thread":{"threadId":"${ID}","title":"Book a flight to Lisbon"},"messages":[]}`);
    expect(await threadTitle({ T3CODE_THREAD_ID: ID, T3CODE_CLI_PATH: cli })).toBe("Book a flight to Lisbon");
  });

  it("gives up without running anything outside T3 Code or on an id that isn't one", async () => {
    const cli = fakeCli(`{"thread":{"title":"never"}}`);
    expect(await threadTitle({})).toBe("");
    expect(await threadTitle({ T3CODE_THREAD_ID: ID })).toBe("");
    expect(await threadTitle({ T3CODE_THREAD_ID: `${ID} & calc`, T3CODE_CLI_PATH: cli })).toBe("");
  });

  it("gives up when the CLI fails", async () => {
    expect(await threadTitle({ T3CODE_THREAD_ID: ID, T3CODE_CLI_PATH: join(dir, "missing.cmd") })).toBe("");
  });
});

describe("parseThreadTitle", () => {
  it("reads the title and ignores anything else", () => {
    expect(parseThreadTitle(`{"thread":{"title":"  Tidy the desktop "}}`)).toBe("Tidy the desktop");
    expect(parseThreadTitle(`{"thread":{"title":3}}`)).toBe("");
    expect(parseThreadTitle("null")).toBe("");
    expect(parseThreadTitle("T3 Code isn't running")).toBe("");
  });
});

describe("labelFor", () => {
  const client = { name: "claude-code", version: "2", cwd: String.raw`C:\Users\Me\.t3\scratch\2026-11-17-book-a-flight-d0fc5367`, pid: 1 };

  it("names the chat by its thread's title", () => {
    expect(labelFor({ ...client, title: "Book a flight to Lisbon" })).toBe("Claude · Book a flight to Lisbon");
  });

  it("falls back to the folder outside T3 Code", () => {
    expect(labelFor({ ...client, name: "codex-mcp-client", title: "" })).toBe("Codex · 2026-11-17-book-a-flight-d0fc5367");
  });
});
