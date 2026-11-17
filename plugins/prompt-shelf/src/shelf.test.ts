import { describe, expect, it } from "vite-plus/test";

import { type Snippet, addTexts, decodeShelf, emptyShelf, parseImport, rank, shelfToken } from "./shelf.ts";

const snippet = (text: string, extra: Partial<Snippet> = {}): Snippet => ({
  id: text,
  text,
  uses: 0,
  lastUsedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...extra,
});

const DISCORD = `Collection of goated prompts:

“Exercise abstract thinking when considering this task”

“Reduce this problem to its irreducible constraints and rebuild it from zero.”

“What would a principal architect immediately rewrite before even starting this?”

“Design the single test that breaks this design on day one.”

“What higher-level abstraction would make this entire problem disappear?”`;

describe("decodeShelf", () => {
  it("reads no file as an empty shelf and a valid file as is", () => {
    expect(decodeShelf(undefined)).toEqual(emptyShelf);
    const shelf = { version: 1, snippets: [snippet("a", { uses: 2 })] };
    expect(decodeShelf(shelf)).toEqual(shelf);
  });

  it("refuses any other shape, so the plugin never writes over it", () => {
    expect(decodeShelf(null)).toBeNull();
    expect(decodeShelf({ version: 2, snippets: [] })).toBeNull();
    expect(decodeShelf({ version: 1, snippets: [{ ...snippet("a"), uses: -1 }] })).toBeNull();
    expect(decodeShelf({ version: 1, snippets: [{ text: "no id" }] })).toBeNull();
  });
});

describe("rank", () => {
  it("orders by uses, then last use, then newest", () => {
    const shelf = [
      snippet("old", { createdAt: "2026-01-01T00:00:00.000Z" }),
      snippet("new", { createdAt: "2026-02-01T00:00:00.000Z" }),
      snippet("used", { uses: 1, lastUsedAt: "2026-03-01T00:00:00.000Z" }),
      snippet("used lately", { uses: 1, lastUsedAt: "2026-04-01T00:00:00.000Z" }),
      snippet("favorite", { uses: 9 }),
    ];
    expect(rank(shelf, "").map((item) => item.text)).toEqual([
      "favorite",
      "used lately",
      "used",
      "new",
      "old",
    ]);
  });

  it("keeps snippets containing every word, ignoring case", () => {
    const shelf = [snippet("Rebuild it from zero"), snippet("Rebuild the test"), snippet("Zero")];
    expect(rank(shelf, "  ZERO rebuild ").map((item) => item.text)).toEqual([
      "Rebuild it from zero",
    ]);
  });
});

describe("parseImport", () => {
  it("splits the Discord message into its six pieces, unquoted", () => {
    expect(parseImport(DISCORD)).toEqual([
      "Collection of goated prompts:",
      "Exercise abstract thinking when considering this task",
      "Reduce this problem to its irreducible constraints and rebuild it from zero.",
      "What would a principal architect immediately rewrite before even starting this?",
      "Design the single test that breaks this design on day one.",
      "What higher-level abstraction would make this entire problem disappear?",
    ]);
  });

  it("strips one pair of quotes of each kind and drops empty pieces", () => {
    expect(parseImport(`"a"\n\n‘b’\n \n'c'\n\n""quoted""\n\n“”`)).toEqual([
      "a",
      "b",
      "c",
      '"quoted"',
    ]);
  });
});

describe("addTexts", () => {
  it("skips texts already on the shelf or repeated in the import", () => {
    let id = 0;
    const start = { version: 1 as const, snippets: [snippet("a")] };
    const { shelf, added } = addTexts(start, ["a", "b", "b", "c"], "now", () => `id${++id}`);
    expect(added).toBe(2);
    expect(shelf.snippets.map((item) => [item.id, item.text])).toEqual([
      ["a", "a"],
      ["id1", "b"],
      ["id2", "c"],
    ]);
  });
});

describe("shelfToken", () => {
  it.each([
    ["foo ;abc", { start: 4, query: "abc" }],
    [";", { start: 0, query: "" }],
    [";query", { start: 0, query: "query" }],
    ["a;b", null],
    ["foo ;abc ", null],
    ["x\n;q", { start: 2, query: "q" }],
    ["x\t;q", { start: 2, query: "q" }],
    ["x\r;q", { start: 2, query: "q" }],
    ["x ;q", { start: 2, query: "q" }],
    ["", null],
    ["foo", null],
    [";abc\n", null],
    [";abc\t", null],
    [";abc\r", null],
    [";one ;two", { start: 5, query: "two" }],
    ["x\u00a0;q", null],
  ])("recognizes the caret token in %j", (text, expected) => {
    expect(shelfToken(text)).toEqual(expected);
  });
});
