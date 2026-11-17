import { describe, expect, it } from "vite-plus/test";

import { type NodeFacts, RefTable, identityKeys, renderOutline } from "./outline.ts";
import type { Ref } from "./tools.ts";

const node = (parent: number | null, role: string, name: string | null, extra: Partial<NodeFacts> = {}): NodeFacts => ({
  parent,
  role,
  name,
  value: null,
  stableId: null,
  pid: 7,
  visible: true,
  enabled: true,
  focused: false,
  checked: null,
  expanded: null,
  selected: false,
  ...extra,
});

const form: NodeFacts[] = [
  node(null, "window", "Probe", { stableId: "hwnd:1" }),
  node(0, "pane", null),
  node(1, "text_field", "Probe field", { value: "abc", focused: true }),
  node(1, "button", "Save"),
  node(1, "button", "Save"),
  node(0, "group", null, { visible: false }),
  node(5, "button", "Hidden"),
  node(0, "combo_box", "Mode", { value: "Light", expanded: false }),
  node(0, "check_box", "Sync", { checked: "on", enabled: false }),
];
const refs = form.map((_, i) => `e${i + 1}` as Ref);

describe("renderOutline", () => {
  it("drops invisible subtrees, hides unnamed wrappers and prints states", () => {
    expect(renderOutline(form, refs).text).toBe(
      [
        'e1 window "Probe"',
        '  e3 text_field "Probe field" value="abc" focused',
        '  e4 button "Save"',
        '  e5 button "Save"',
        '  e8 combo_box "Mode" value="Light" collapsed',
        '  e9 check_box "Sync" disabled checked=on',
      ].join("\n"),
    );
  });

  it("reports truncation at the line and character caps", () => {
    expect(renderOutline(form, refs, { maxLines: 2, maxChars: 10_000 })).toEqual({
      text: 'e1 window "Probe"\n  e3 text_field "Probe field" value="abc" focused',
      truncated: true,
    });
    expect(renderOutline(form, refs, { maxLines: 300, maxChars: 30 }).truncated).toBe(true);
  });
});

describe("identityKeys", () => {
  it("prefers the platform id and tells same-named siblings apart by index", () => {
    const keys = identityKeys(form, "root");
    expect(keys[0]).toBe("id:7:hwnd:1");
    expect(keys[3]).not.toBe(keys[4]);
    expect(identityKeys(form, "root")).toEqual(keys);
  });
});

interface Handle {
  readonly node: string;
}

describe("RefTable", () => {
  const sameNode = async (a: Handle, b: Handle) => a.node === b.node;

  it("gives the same element the same ref across captures, and windows w refs", async () => {
    const table = new RefTable<Handle>(sameNode);
    const keys = identityKeys(form.slice(0, 4), "root");
    const first = await table.adopt(keys, [true, false, false, false], [{ node: "a" }, { node: "b" }, { node: "c" }, { node: "d" }]);
    expect(first).toEqual(["w1", "e2", "e3", "e4"]);
    const second = await table.adopt(keys, [true, false, false, false], [{ node: "a" }, { node: "b" }, { node: "c" }, { node: "d" }]);
    expect(second).toEqual(first);
    expect(table.resolve("e3")).toEqual({ node: "c" });
  });

  it("never rebinds a ref to a different node that merely has the same path", async () => {
    const table = new RefTable<Handle>(sameNode);
    const keys = identityKeys(form.slice(0, 4), "root");
    await table.adopt(keys, [true, false, false, false], [{ node: "a" }, { node: "b" }, { node: "c" }, { node: "d" }]);
    const again = await table.adopt(keys, [true, false, false, false], [{ node: "a" }, { node: "b" }, { node: "X" }, { node: "d" }]);
    expect(again).toEqual(["w1", "e2", "e5", "e4"]);
    expect(table.resolve("e3")).toEqual({ node: "c" });
    expect(table.resolve("e5")).toEqual({ node: "X" });
  });

  it("treats a stale comparison as a different node", async () => {
    let stale = false;
    const table = new RefTable<Handle>(async (a, b) => {
      if (stale) throw new Error("evicted");
      return a.node === b.node;
    });
    const keys = identityKeys(form.slice(0, 1), "root");
    await table.adopt(keys, [true], [{ node: "a" }]);
    stale = true;
    expect(await table.adopt(keys, [true], [{ node: "a" }])).toEqual(["w2"]);
  });
});
