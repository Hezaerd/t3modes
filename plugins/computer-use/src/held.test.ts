import { describe, expect, it } from "vite-plus/test";

import { type Held, HeldJournal } from "./held.ts";

describe("HeldJournal", () => {
  it("writes a hold before its down call and clears it after its up call", async () => {
    const saved: Array<Held | null> = [];
    const journal = new HeldJournal((held) => saved.push(held));
    await journal.down("key", "Control", async () => {
      expect(saved.at(-1)).toEqual({ keys: ["Control"], buttons: [] });
    });
    await journal.down("button", "left", async () => {});
    await journal.up("button", "left", async () => {});
    await journal.up("key", "Control", async () => {});
    expect(saved.at(-1)).toBeNull();
  });

  it("keeps a hold whose down or up call failed, for the next start to release", async () => {
    const saved: Array<Held | null> = [];
    const journal = new HeldJournal((held) => saved.push(held));
    await expect(journal.down("key", "Shift", () => Promise.reject(new Error("down failed")))).rejects.toThrow();
    expect(saved.at(-1)).toEqual({ keys: ["Shift"], buttons: [] });
    await expect(journal.up("key", "Shift", () => Promise.reject(new Error("up failed")))).rejects.toThrow();
    expect(saved.at(-1)).toEqual({ keys: ["Shift"], buttons: [] });
    await journal.up("key", "Shift", async () => {});
    expect(saved.at(-1)).toBeNull();
  });
});
