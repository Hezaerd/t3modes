import { describe, expect, it } from "vite-plus/test";

import { BoundedMap } from "./bounded.ts";

describe("BoundedMap", () => {
  it("keeps the most recently set entries", () => {
    const map = new BoundedMap<string, number>(2);
    map.set("a", 1).set("b", 2).set("a", 3).set("c", 4);
    expect([...map]).toEqual([
      ["a", 3],
      ["c", 4],
    ]);
  });
});
