import { describe, expect, it } from "vite-plus/test";

import {
  type ActRequest,
  type Outcome,
  TOOL_LIST,
  parseKeys,
  parseToolCall,
  refsOf,
  renderOutcome,
  renderUnreachable,
} from "./tools.ts";

const act = (steps: unknown[], extra: Record<string, unknown> = {}) => parseToolCall("act", { steps, ...extra });
const steps = (steps: unknown[]): ActRequest["steps"] => {
  const result = act(steps);
  if (!result.ok) throw new Error(result.message);
  if (result.call.tool !== "act") throw new Error("not act");
  return result.call.request.steps;
};
const error = (result: ReturnType<typeof parseToolCall>) => (result.ok ? null : result.message);

describe("parseToolCall", () => {
  it("parses flat steps into the domain union with defaults", () => {
    expect(
      steps([
        { do: "click", target: { ref: "e7" } },
        { do: "type", text: "hi", target: { sel: "text_field", win: "w2" } },
        { do: "key", keys: "ctrl+shift+s" },
        { do: "scroll", target: { x: 10, y: 20 }, dy: 3 },
        { do: "drag", target: { ref: "e1" }, to: { x: 5, y: 6 } },
        { do: "invoke", target: { ref: "e8" }, action: "expand" },
        { do: "set", target: { sel: "slider" }, value: "40" },
        { do: "wait", target: { sel: "dialog" }, gone: true },
        { do: "wait", timeout_ms: 300 },
        { do: "open", uri: "ms-settings:colors" },
      ]),
    ).toEqual([
      { do: "click", target: { kind: "ref", ref: "e7" }, button: "left", count: 1, mods: [] },
      { do: "type", text: "hi", target: { kind: "sel", selector: "text_field", win: "w2" } },
      { do: "key", combo: { key: "s", held: ["Control", "Shift"] }, repeat: 1 },
      { do: "scroll", target: { kind: "point", at: { x: 10, y: 20 } }, dx: 0, dy: 3 },
      { do: "drag", from: { kind: "ref", ref: "e1" }, to: { kind: "point", at: { x: 5, y: 6 } } },
      { do: "invoke", target: { kind: "ref", ref: "e8" }, action: "expand" },
      { do: "set", target: { kind: "sel", selector: "slider", win: null }, value: "40" },
      { do: "wait", until: { kind: "gone", target: { kind: "sel", selector: "dialog", win: null } }, ms: 5000 },
      { do: "wait", until: { kind: "time" }, ms: 300 },
      { do: "open", uri: "ms-settings:colors" },
    ]);
  });

  it("needs exactly one target form", () => {
    expect(error(act([{ do: "click", target: { ref: "e1", x: 1, y: 2 } }]))).toMatch(/exactly one/);
    expect(error(act([{ do: "click", target: {} }]))).toMatch(/exactly one/);
    expect(error(act([{ do: "click", target: { x: 1 } }]))).toMatch(/both x and y/);
    expect(error(act([{ do: "click", target: { ref: "e1", win: "w1" } }]))).toMatch(/win goes with sel/);
    expect(error(act([{ do: "click", target: { sel: "button", win: "e3" } }]))).toMatch(/window ref/);
    expect(error(act([{ do: "click", target: { ref: "button" } }]))).toMatch(/isn't a ref/);
  });

  it("refuses points where an element is needed, and fields that don't belong to the step", () => {
    expect(error(act([{ do: "invoke", target: { x: 1, y: 1 }, action: "press" }]))).toMatch(/not a point/);
    expect(error(act([{ do: "click", target: { ref: "e1" }, text: "x" }]))).toMatch(/text doesn't apply to click/);
    expect(error(act([{ do: "click", target: { ref: "e1" }, bogus: 1 }]))).toMatch(/Invalid act arguments/);
  });

  it("enforces the static limits before anything runs", () => {
    expect(error(act([]))).toMatch(/1 to 20/);
    expect(error(act(Array.from({ length: 21 }, () => ({ do: "wait", timeout_ms: 1 }))))).toMatch(/1 to 20/);
    expect(error(act([{ do: "wait", timeout_ms: 5001 }]))).toMatch(/1 to 5000/);
    expect(error(act([{ do: "wait", target: { ref: "e1" }, timeout_ms: 15001 }]))).toMatch(/1 to 15000/);
    expect(error(act([{ do: "wait" }]))).toMatch(/timeout_ms/);
    expect(error(act([{ do: "key", keys: "a", repeat: 51 }]))).toMatch(/1 to 50/);
    expect(error(act([{ do: "click", target: { ref: "e1" }, count: 4 }]))).toMatch(/1 to 3/);
    expect(error(act([{ do: "type", text: "x".repeat(2001) }]))).toMatch(/2000/);
    expect(error(act([{ do: "scroll", target: { ref: "e1" } }]))).toMatch(/dx or dy/);
    expect(error(act([{ do: "open", uri: "notepad" }]))).toMatch(/URI/);
    expect(error(act([{ do: "open", uri: "-foo:bar" }]))).toMatch(/URI/);
    expect(error(act([{ do: "wait", timeout_ms: 1 }, { do: "key", keys: "nope" }]))).toMatch(/Step 2 \(key\): Unknown key/);
  });

  it("parses observe with defaults and refuses junk", () => {
    expect(parseToolCall("observe", undefined)).toEqual({
      ok: true,
      call: { tool: "observe", request: { win: null, scope: "window", zoom: null, outline: true } },
    });
    expect(error(parseToolCall("observe", { win: "e2" }))).toMatch(/window ref/);
    expect(error(parseToolCall("observe", { zoom: { x: 0, y: 0, width: 2, height: 40 } }))).toMatch(/8x8/);
    expect(error(parseToolCall("screenshot", {}))).toMatch(/Unknown tool/);
  });

  it("lists every ref a call names", () => {
    const result = act([
      { do: "click", target: { ref: "e1" } },
      { do: "drag", target: { ref: "e2" }, to: { sel: "x", win: "w3" } },
      { do: "wait", target: { ref: "e4" } },
      { do: "key", keys: "a" },
    ]);
    expect(result.ok && refsOf(result.call)).toEqual(["e1", "e2", "w3", "e4"]);
  });
});

describe("parseKeys", () => {
  it("maps aliases to xa11y's key names", () => {
    expect(parseKeys("ctrl+shift+s")).toEqual({ key: "s", held: ["Control", "Shift"] });
    expect(parseKeys("Enter")).toEqual({ key: "Enter", held: [] });
    expect(parseKeys("return")).toEqual({ key: "Enter", held: [] });
    expect(parseKeys("esc")).toEqual({ key: "Escape", held: [] });
    expect(parseKeys("alt+f4")).toEqual({ key: "F4", held: ["Alt"] });
    expect(parseKeys("pgdn")).toEqual({ key: "PageDown", held: [] });
    expect(parseKeys("win")).toEqual({ key: "Meta", held: [] });
    expect(parseKeys("win+r")).toEqual({ key: "r", held: ["Meta"] });
    expect(parseKeys("ctrl+A")).toEqual({ key: "a", held: ["Control"] });
    expect(parseKeys("ctrl++")).toEqual({ key: "+", held: ["Control"] });
    expect(parseKeys("ctrl+ctrl+left")).toEqual({ key: "ArrowLeft", held: ["Control"] });
  });

  it("explains bad chords", () => {
    expect(parseKeys("a+ctrl")).toMatch(/put the key last/);
    expect(parseKeys("hyper")).toMatch(/Unknown key/);
    expect(parseKeys("")).toMatch(/empty/);
  });

  it("reads only its own key and modifier names, never inherited ones", () => {
    expect(parseKeys("ctrl+__proto__")).toMatch(/Unknown key/);
    expect(parseKeys("constructor")).toMatch(/Unknown key/);
    expect(parseKeys("toString+a")).toMatch(/isn't a modifier/);
    expect(error(act([{ do: "click", target: { ref: "e1" }, mods: ["__proto__"] }]))).toMatch(/unknown modifier/);
    expect(error(act([{ do: "wait", timeout_ms: 1 }, { do: "click", target: { ref: "e1" }, mods: ["hasOwnProperty"] }]))).toMatch(
      /Step 2 \(click\): unknown modifier/,
    );
  });
});

describe("TOOL_LIST", () => {
  it("has flat object schemas with no unions", () => {
    expect(TOOL_LIST.map((t) => t.name)).toEqual(["observe", "act"]);
    for (const tool of TOOL_LIST) {
      expect(tool.inputSchema.type).toBe("object");
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(/anyOf|oneOf|allOf|\$schema|"type":\[/);
    }
  });
});

describe("renderOutcome", () => {
  const after = {
    image: { id: "i3", png: new Uint8Array([1, 2, 3]), width: 640, height: 400, of: "window w2" },
    outline: { window: "w2" as const, title: "Probe", text: 'w2 window "Probe"\n  e5 button "Save"', truncated: false },
    windows: null,
    note: null,
  };

  it("reports a finished batch with the after-state and image", () => {
    const result = renderOutcome({ kind: "acted", report: { total: 2, done: 2, failed: null }, after, released: true });
    expect(result.isError).toBe(false);
    expect(result.content[0]).toEqual({
      type: "text",
      text: 'Done 2/2. Control released.\nImage i3: window w2, 640x400. Points you send are pixels in this image.\nOutline of w2 "Probe":\nw2 window "Probe"\n  e5 button "Save"',
    });
    expect(result.content[1]).toEqual({ type: "image", data: "AQID", mimeType: "image/png" });
  });

  it("says where a batch stopped and whether a retry is safe", () => {
    const outcome: Outcome = {
      kind: "acted",
      report: {
        total: 3,
        done: 1,
        failed: {
          step: 2,
          summary: 'invoke select list_item[name="Dark"]',
          failure: { reason: "not_found", message: "not found.", delivery: "none", candidates: ['list_item "Light"'] },
        },
      },
      after: null,
      released: false,
    };
    const result = renderOutcome(outcome);
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: 'Stopped at step 2/3 (invoke select list_item[name="Dark"]): not found.\nNear misses: list_item "Light".\nNothing was sent, so a retry is safe.',
      },
    ]);
  });

  it("renders refusals and unreachable backends as errors", () => {
    expect(renderOutcome({ kind: "refused", refusal: { kind: "stopped" } }).content[0]).toMatchObject({
      text: expect.stringMatching(/press Resume/),
    });
    expect(renderUnreachable("no-backend")).toMatchObject({ isError: true });
  });
});
