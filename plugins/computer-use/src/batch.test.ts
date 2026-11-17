import { describe, expect, it } from "vite-plus/test";

import {
  type Bounds,
  type CaptureFacts,
  type Desktop,
  type ElementHandle,
  type PointerTarget,
  type Shot,
  type ShotSource,
  type Timing,
  type WindowFacts,
  desktopPoint,
} from "./batch.ts";
import type { BackendToPage, Control } from "./control.ts";
import type { NodeFacts } from "./outline.ts";
import { Engine, Session } from "./session.ts";
import type { InvokeAction, MouseButton, ToolResult } from "./tools.ts";

const T3 = 100;
const APP = 200;
const OTHER = 300;

interface FakeElement {
  readonly id: string;
  readonly pid: number;
  readonly role: string;
  readonly name: string;
  readonly window: string;
  bounds: Bounds;
  visible: boolean;
  alive: boolean;
}

const timing: Timing = { pollMs: 2, resolveMs: 30, firstSeenMs: 0, dragMoves: 3, dragStepMs: 1, settleCapMs: 10 };

class FakeDesktop implements Desktop {
  readonly t3codePid = T3;
  readonly events: string[] = [];
  readonly finds: Array<{ selector: string; scopePid: number | null }> = [];
  foregroundId = "w-app";
  /** Runs before an input primitive is recorded; tests press Stop from here. */
  beforeInput: (event: string) => void = () => {};
  /** Makes an input primitive reject after it was delivered. */
  failAfter: (event: string) => boolean = () => false;
  onScreenshot: () => void = () => {};
  firstSeen = 0;
  readonly elements = new Map<string, FakeElement>();

  constructor() {
    const add = (e: Omit<FakeElement, "visible" | "alive">) => this.elements.set(e.id, { ...e, visible: true, alive: true });
    add({ id: "w-t3", pid: T3, role: "window", name: "T3 Code", window: "w-t3", bounds: { x: 0, y: 0, width: 500, height: 500 } });
    add({ id: "t3-button", pid: T3, role: "button", name: "Stop", window: "w-t3", bounds: { x: 10, y: 10, width: 20, height: 10 } });
    add({ id: "w-app", pid: APP, role: "window", name: "Probe", window: "w-app", bounds: { x: 1000, y: 100, width: 400, height: 200 } });
    add({ id: "field", pid: APP, role: "text_field", name: "Probe field", window: "w-app", bounds: { x: 1020, y: 120, width: 300, height: 20 } });
    add({ id: "save", pid: APP, role: "button", name: "Save", window: "w-app", bounds: { x: 1020, y: 170, width: 100, height: 40 } });
    add({ id: "w-other", pid: OTHER, role: "window", name: "Other", window: "w-other", bounds: { x: 0, y: 600, width: 300, height: 300 } });
    add({ id: "other-save", pid: OTHER, role: "button", name: "Save", window: "w-other", bounds: { x: 10, y: 610, width: 50, height: 20 } });
  }

  private el(handle: ElementHandle): FakeElement {
    return handle as unknown as FakeElement;
  }
  private handle(id: string): ElementHandle {
    return this.elements.get(id) as unknown as ElementHandle;
  }
  private facts(id: string): WindowFacts {
    const w = this.elements.get(id)!;
    return {
      handle: this.handle(id),
      key: `id:${w.pid}:${id}` as WindowFacts["key"],
      title: w.name,
      app: w.pid === T3 ? "T3 Code" : "app",
      pid: w.pid,
      active: this.foregroundId === id,
      bounds: w.bounds,
      firstSeen: this.firstSeen,
    };
  }
  private input(event: string): void {
    this.beforeInput(event);
    this.events.push(event);
    if (this.failAfter(event)) throw new Error(`${event} failed after delivery`);
  }

  async windows() {
    return ["w-t3", "w-app", "w-other"].filter((id) => this.elements.get(id)!.alive).map((id) => this.facts(id));
  }
  async foreground() {
    return this.facts(this.foregroundId);
  }
  async find(selector: string, scopePid: number | null) {
    this.finds.push({ selector, scopePid });
    const match = /^(\w+)\[name="(.+)"\]$/.exec(selector);
    for (const e of this.elements.values()) {
      if (!e.alive || (scopePid === null ? e.pid === T3 : e.pid !== scopePid)) continue;
      if (match ? e.role === match[1] && e.name === match[2] : e.role === selector) return { element: this.handle(e.id) };
    }
    return { candidates: ['button "Nope"'] };
  }
  info(handle: ElementHandle) {
    const e = this.el(handle);
    return { pid: e.pid, visible: e.visible, bounds: e.bounds, label: `${e.role} "${e.name}"` };
  }
  async windowOf(handle: ElementHandle) {
    const e = this.el(handle);
    return this.elements.get(e.window)!.alive ? this.facts(e.window) : null;
  }
  async alive(handle: ElementHandle) {
    return this.el(handle).alive;
  }
  async same(a: ElementHandle, b: ElementHandle) {
    return a === b;
  }
  async boundsNow(handle: ElementHandle) {
    const e = this.el(handle);
    return e.alive ? { ...e.bounds } : null;
  }
  async capture(root: ElementHandle): Promise<CaptureFacts> {
    const w = this.el(root);
    const members = [...this.elements.values()].filter((e) => e.window === w.id && e.alive);
    const nodes: NodeFacts[] = members.map((e) => ({
      parent: e.id === w.id ? null : 0,
      role: e.role,
      name: e.name,
      value: null,
      stableId: e.id,
      pid: e.pid,
      visible: e.visible,
      enabled: true,
      focused: false,
      checked: null,
      expanded: null,
      selected: false,
    }));
    return { nodes, handles: members.map((e) => this.handle(e.id)), truncated: false };
  }
  async screenshot(source: ShotSource): Promise<Shot> {
    this.onScreenshot();
    const b = source.kind === "window" ? this.el(source.window).bounds : { x: 0, y: 0, width: 1920, height: 1080 };
    // Half-size image of the window: image (x, y) is desktop (b.x + 2x, b.y + 2y).
    return {
      png: new Uint8Array([137]),
      width: b.width / 2,
      height: b.height / 2,
      toDesktop: (p) => desktopPoint(b.x + 2 * p.x, b.y + 2 * p.y),
    };
  }
  private where(target: PointerTarget): string {
    return target.kind === "point" ? `${target.at.x},${target.at.y}` : this.el(target.element).id;
  }
  async moveTo(target: PointerTarget) {
    this.input(`move ${this.where(target)}`);
  }
  async mouseDown(button: MouseButton) {
    this.input(`down ${button}`);
  }
  async mouseUp(button: MouseButton) {
    this.input(`up ${button}`);
  }
  async wheel(target: PointerTarget, dx: number, dy: number) {
    this.input(`wheel ${this.where(target)} ${dx} ${dy}`);
  }
  async keyDown(key: string) {
    this.input(`keydown ${key}`);
  }
  async keyUp(key: string) {
    this.input(`keyup ${key}`);
  }
  async typeChar(char: string) {
    this.input(`type ${char}`);
  }
  async invoke(handle: ElementHandle, action: InvokeAction) {
    this.input(`${action} ${this.el(handle).id}`);
  }
  async setValue(handle: ElementHandle, value: string) {
    this.input(`set ${this.el(handle).id} ${value}`);
  }
  async open(uri: string) {
    this.input(`open ${uri}`);
  }
}

interface Rig {
  readonly desktop: FakeDesktop;
  readonly engine: Engine;
  readonly page: { answering: boolean; readonly seen: BackendToPage[] };
  readonly persisted: string[];
  readonly clock: { offset: number };
  session(name?: string): Session;
}

const rig = (initial: Control = { kind: "idle", generation: 0 }): Rig => {
  const desktop = new FakeDesktop();
  const page = { answering: true, seen: [] as BackendToPage[] };
  const persisted: string[] = [];
  const clock = { offset: 0 };
  const engine: Engine = new Engine(
    {
      desktop,
      now: () => Date.now() + clock.offset,
      sendPage: (message) => {
        page.seen.push(message);
        if (message.t === "ping" && page.answering) queueMicrotask(() => engine.page({ t: "pong", n: message.n, instance: "page" }));
      },
      persistStopped: (at) => persisted.push(`stopped ${at}`),
      clearStopped: () => persisted.push("cleared"),
      log: () => {},
      timing,
    },
    initial,
  );
  let pid = 1;
  return {
    desktop,
    engine,
    page,
    persisted,
    clock,
    session: (name = "claude-code") => engine.openSession({ name, version: "1", cwd: "D:\\src\\webapp", pid: pid++ }),
  };
};

const never = new AbortController().signal;
const text = (result: ToolResult): string => result.content.map((c) => (c.type === "text" ? c.text : "<image>")).join("\n");
const act = (session: Session, steps: unknown[], extra: Record<string, unknown> = {}) =>
  session.call("act", { steps, after: "outline", ...extra }, never);

/** Observes, then returns the ref the outline gave the element named `name`. */
const refOf = async (session: Session, name: string): Promise<string> => {
  const outline = text(await session.call("observe", {}, never));
  const line = outline.split("\n").find((l) => l.includes(`"${name}"`));
  return /\b([we]\d+)\b/.exec(line!)![1]!;
};

describe("Stop", () => {
  it("halts typing between two characters and refuses input until Resume", async () => {
    const { desktop, engine, session, persisted } = rig();
    const agent = session();
    desktop.beforeInput = (event) => {
      if (event === "type c") engine.page({ t: "stop" });
    };
    const result = await act(agent, [{ do: "type", text: "abcdefgh" }]);
    expect(desktop.events).toEqual(["type a", "type b", "type c"]);
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Stopped at step 1\/1 \(type "abcdefgh"\): The user pressed Stop\. .*3 of 8 characters were typed\./);
    expect(text(result)).toMatch(/Its input was sent/);
    expect(persisted[0]).toMatch(/^stopped /);

    desktop.beforeInput = () => {};
    expect(text(await act(agent, [{ do: "key", keys: "x" }]))).toMatch(/press Resume/);
    expect(desktop.events).toEqual(["type a", "type b", "type c"]);

    engine.page({ t: "resume" });
    expect((await act(agent, [{ do: "key", keys: "x" }])).isError).toBe(false);
    expect(desktop.events.slice(3)).toEqual(["keydown x", "keyup x"]);
  });

  it("lets the native call in flight finish and runs nothing after it", async () => {
    const { desktop, engine, session } = rig();
    const agent = session();
    const save = await refOf(agent, "Save");
    desktop.beforeInput = (event) => {
      if (event.startsWith("press")) engine.page({ t: "stop" });
    };
    const result = await act(agent, [
      { do: "invoke", target: { ref: save }, action: "press" },
      { do: "key", keys: "enter" },
    ]);
    expect(text(result)).toMatch(/Stopped at step 2\/2 \(key Enter\): The user pressed Stop/);
    expect(text(result)).toMatch(/Nothing was sent/);
    expect(desktop.events).toEqual(["press save"]);
  });

  it("releases a held modifier and button after Stop", async () => {
    const { desktop, engine, session } = rig();
    const agent = session();
    const save = await refOf(agent, "Save");
    desktop.beforeInput = (event) => {
      if (event.startsWith("move")) engine.page({ t: "stop" });
    };
    await act(agent, [{ do: "click", target: { ref: save }, mods: ["ctrl", "shift"] }]);
    expect(desktop.events).toEqual(["keydown Control", "keydown Shift", "move save", "keyup Shift", "keyup Control"]);

    engine.page({ t: "resume" });
    desktop.events.length = 0;
    let moves = 0;
    desktop.beforeInput = (event) => {
      if (event.startsWith("move") && ++moves === 3) engine.page({ t: "stop" });
    };
    await act(agent, [{ do: "drag", target: { ref: save }, to: { x: 10, y: 10 } }]);
    expect(desktop.events.at(-1)).toBe("up left");
    expect(desktop.events.filter((e) => e === "down left")).toHaveLength(1);
  });

  it("sends nothing more once the call is cancelled", async () => {
    const { desktop, session } = rig();
    const agent = session();
    const cancel = new AbortController();
    desktop.beforeInput = (event) => {
      if (event === "type c") cancel.abort(new Error("cancelled"));
    };
    const result = await agent.call("act", { steps: [{ do: "type", text: "abcdefgh" }], after: "none" }, cancel.signal);
    expect(desktop.events).toEqual(["type a", "type b", "type c"]);
    expect(text(result)).toMatch(/The call was cancelled\. 3 of 8 characters were typed\./);
  });

  it("releases a key or button whose down call rejected after delivering it", async () => {
    const { desktop, session } = rig();
    const agent = session();
    const save = await refOf(agent, "Save");
    desktop.failAfter = (event) => event === "keydown Shift";
    await act(agent, [{ do: "click", target: { ref: save }, mods: ["ctrl", "shift"] }]);
    expect(desktop.events).toEqual(["keydown Control", "keydown Shift", "keyup Shift", "keyup Control"]);

    desktop.events.length = 0;
    desktop.failAfter = (event) => event === "down left";
    expect(text(await act(agent, [{ do: "click", target: { ref: save }, mods: ["ctrl"] }]))).toMatch(/may have been sent/);
    expect(desktop.events).toEqual(["keydown Control", "move save", "down left", "up left", "keyup Control"]);

    desktop.events.length = 0;
    desktop.failAfter = (event) => event === "keydown x";
    await act(agent, [{ do: "key", keys: "ctrl+x" }]);
    expect(desktop.events).toEqual(["keydown Control", "keydown x", "keyup x", "keyup Control"]);
  });

  it("sends no key-up for a key the gate refused to press", async () => {
    const { desktop, engine, session } = rig();
    const agent = session();
    desktop.beforeInput = (event) => {
      if (event === "keydown Control") engine.page({ t: "stop" });
    };
    await act(agent, [{ do: "key", keys: "ctrl+shift+x" }]);
    expect(desktop.events).toEqual(["keydown Control", "keyup Control"]);
  });

  it("drops a batch accepted before Stop even after Resume", async () => {
    const { desktop, engine, session } = rig();
    const first = session();
    const second = session("codex-mcp-client");
    const slow = act(first, [{ do: "wait", timeout_ms: 200 }], { release: true });
    const queued = act(second, [{ do: "key", keys: "enter" }]);
    await new Promise((r) => setTimeout(r, 20));
    engine.page({ t: "stop" });
    engine.page({ t: "resume" });
    expect(text(await slow)).toMatch(/Stopped at step 1\/1 \(wait 200 ms\): The user pressed Stop/);
    expect(text(await queued)).toMatch(/dropped and nothing was sent/);
    expect(desktop.events).toEqual([]);
    expect((await act(second, [{ do: "key", keys: "enter" }])).isError).toBe(false);
  });
});

describe("control between agents", () => {
  it("keeps a second agent out until the holder releases", async () => {
    const { desktop, session } = rig();
    const claude = session();
    const codex = session("codex-mcp-client");
    expect((await act(claude, [{ do: "key", keys: "a" }])).isError).toBe(false);
    const busy = await act(codex, [{ do: "key", keys: "b" }]);
    expect(text(busy)).toMatch(/Another agent is using the computer \(Claude · webapp, idle \d+ s\)/);
    expect((await act(claude, [{ do: "key", keys: "c" }], { release: true })).isError).toBe(false);
    expect((await act(codex, [{ do: "key", keys: "d" }])).isError).toBe(false);
    expect(desktop.events.filter((e) => e.startsWith("keydown"))).toEqual(["keydown a", "keydown c", "keydown d"]);
  });

  it("frees control when the holder's chat disconnects", async () => {
    const { session } = rig();
    const claude = session();
    const codex = session("codex-mcp-client");
    await act(claude, [{ do: "key", keys: "a" }]);
    claude.close();
    expect((await act(codex, [{ do: "key", keys: "b" }])).isError).toBe(false);
  });

  it("refuses to act when the page doesn't answer, and halts when its answers lapse", async () => {
    const { desktop, page, session, clock } = rig();
    const agent = session();
    page.answering = false;
    expect(text(await act(agent, [{ do: "key", keys: "a" }]))).toMatch(/isn't showing the computer-use indicator/);
    page.answering = true;
    desktop.beforeInput = (event) => {
      if (event === "type b") clock.offset += 10_000;
    };
    expect(text(await act(agent, [{ do: "type", text: "abc" }]))).toMatch(/T3 Code stopped answering/);
    expect(desktop.events).toEqual(["type a", "type b"]);
  });
});

describe("targets", () => {
  it("maps an image point through that image and refuses it once the window moved", async () => {
    const { desktop, session } = rig();
    const agent = session();
    await agent.call("observe", {}, never);
    expect((await act(agent, [{ do: "click", target: { x: 10, y: 20 } }])).isError).toBe(false);
    expect(desktop.events).toEqual(["move 1020,140", "down left", "up left"]);

    desktop.elements.get("w-app")!.bounds = { x: 900, y: 100, width: 400, height: 200 };
    const moved = await act(agent, [{ do: "click", target: { x: 10, y: 20 } }]);
    expect(text(moved)).toMatch(/moved or closed since\. Observe again\.\nNothing was sent/);
    expect(desktop.events).toHaveLength(3);
    await agent.call("observe", {}, never);
    expect(text(await act(agent, [{ do: "click", target: { x: 500, y: 20 } }]))).toMatch(/outside image/);
  });

  it("refuses a point into an image that isn't the latest before any step runs", async () => {
    const { desktop, session } = rig();
    const agent = session();
    expect(text(await agent.call("observe", {}, never))).toMatch(/Image i1/);
    expect((await act(agent, [{ do: "click", target: { x: 10, y: 20, image: "i1" } }])).isError).toBe(false);
    expect(text(await agent.call("observe", {}, never))).toMatch(/Image i2/);
    desktop.events.length = 0;
    const stale = await act(agent, [{ do: "key", keys: "a" }, { do: "click", target: { x: 10, y: 20, image: "i1" } }]);
    expect(text(stale)).toMatch(/i1 isn't the latest image \(i2\)\. Observe again\..*Nothing was sent/s);
    const outside = await act(agent, [{ do: "key", keys: "a" }, { do: "click", target: { x: 500, y: 20 } }]);
    expect(text(outside)).toMatch(/outside image i2/);
    expect(desktop.events).toEqual([]);
  });

  it("refuses a point on a T3 Code window unless the image's own window is in front", async () => {
    const { desktop, session } = rig();
    const agent = session();
    desktop.elements.get("w-app")!.bounds = { x: 100, y: 100, width: 400, height: 200 };
    desktop.foregroundId = "w-other";
    const app = /(w\d+) "Probe"/.exec(text(await agent.call("observe", {}, never)))![1]!;
    await agent.call("observe", { win: app }, never);
    expect(text(await act(agent, [{ do: "click", target: { x: 10, y: 20 } }]))).toMatch(/on a T3 Code window, which is off limits/);
    expect(text(await act(agent, [{ do: "scroll", target: { x: 10, y: 20 }, dy: 1 }]))).toMatch(/off limits/);
    expect(desktop.events).toEqual([]);

    desktop.foregroundId = "w-app";
    expect((await act(agent, [{ do: "click", target: { x: 10, y: 20 } }])).isError).toBe(false);
    expect(desktop.events).toEqual(["move 120,140", "down left", "up left"]);

    desktop.events.length = 0;
    await agent.call("observe", { scope: "screen" }, never);
    expect(text(await act(agent, [{ do: "click", target: { x: 60, y: 60 } }]))).toMatch(/off limits/);
    const t3 = /(w\d+) "T3 Code"/.exec(text(await agent.call("observe", {}, never)))![1]!;
    await agent.call("observe", { win: t3 }, never);
    desktop.foregroundId = "w-t3";
    expect(text(await act(agent, [{ do: "click", target: { x: 10, y: 10 } }]))).toMatch(/off limits/);
    expect(desktop.events).toEqual([]);
  });

  it("refuses a pointer step on an element that lies under a T3 Code window", async () => {
    const { desktop, session } = rig();
    const agent = session();
    const save = await refOf(agent, "Save");
    desktop.elements.get("w-app")!.bounds = { x: 100, y: 100, width: 400, height: 200 };
    desktop.elements.get("save")!.bounds = { x: 120, y: 170, width: 100, height: 40 };
    desktop.foregroundId = "w-other";
    expect(text(await act(agent, [{ do: "click", target: { ref: save } }]))).toMatch(/on a T3 Code window, which is off limits/);
    expect((await act(agent, [{ do: "invoke", target: { ref: save }, action: "press" }])).isError).toBe(false);
    desktop.foregroundId = "w-app";
    expect((await act(agent, [{ do: "click", target: { ref: save } }])).isError).toBe(false);
    expect(desktop.events).toEqual(["press save", "move save", "down left", "up left"]);
  });

  it("checks the image's window right before the first primitive, after the settle wait", async () => {
    const { desktop, session } = rig();
    const agent = session();
    await agent.call("observe", {}, never);
    desktop.firstSeen = Date.now() + 150;
    setTimeout(() => (desktop.elements.get("w-app")!.bounds = { x: 900, y: 100, width: 400, height: 200 }), 30);
    expect(text(await act(agent, [{ do: "click", target: { x: 10, y: 20 } }]))).toMatch(/moved or closed since/);
    expect(desktop.events).toEqual([]);
  });

  it("refuses points into an image whose window moved while it was captured", async () => {
    const { desktop, session } = rig();
    const agent = session();
    desktop.onScreenshot = () => (desktop.elements.get("w-app")!.bounds = { x: 900, y: 100, width: 400, height: 200 });
    expect(text(await agent.call("observe", {}, never))).toMatch(/moved while it was captured/);
    desktop.onScreenshot = () => {};
    expect(text(await act(agent, [{ do: "click", target: { x: 10, y: 20 } }]))).toMatch(/moved or closed since/);
    expect(desktop.events).toEqual([]);
  });

  it("searches the current window's app for a selector without win, and every app but T3 Code for a wait", async () => {
    const { desktop, session } = rig();
    const agent = session();
    await agent.call("observe", {}, never);
    await act(agent, [
      { do: "invoke", target: { sel: 'button[name="Save"]' }, action: "press" },
      { do: "wait", target: { sel: 'button[name="Stop"]' }, timeout_ms: 20 },
    ]);
    expect(desktop.events).toEqual(["press save"]);
    expect(desktop.finds[0]).toEqual({ selector: 'button[name="Save"]', scopePid: APP });
    expect(desktop.finds.at(-1)).toEqual({ selector: 'button[name="Stop"]', scopePid: null });
  });

  it("checks every ref in the batch before the first effect", async () => {
    const { desktop, session } = rig();
    const agent = session();
    await agent.call("observe", {}, never);
    const result = await act(agent, [{ do: "key", keys: "a" }, { do: "invoke", target: { ref: "e99" }, action: "press" }]);
    expect(text(result)).toMatch(/Unknown ref e99/);
    expect(desktop.events).toEqual([]);
  });

  it("keeps T3 Code off limits", async () => {
    const { desktop, session } = rig();
    const agent = session();
    const windows = text(await agent.call("observe", {}, never));
    expect(windows).toMatch(/"T3 Code" \(T3 Code, off limits\)/);
    const t3 = /(w\d+) "T3 Code"/.exec(windows)![1]!;
    expect(text(await act(agent, [{ do: "invoke", target: { sel: "button", win: t3 }, action: "press" }]))).toMatch(/off limits/);
    desktop.foregroundId = "w-t3";
    expect(text(await act(agent, [{ do: "key", keys: "enter" }]))).toMatch(/T3 Code is the active window/);
    expect(text(await act(agent, [{ do: "type", text: "hi" }]))).toMatch(/T3 Code is the active window/);
    expect(desktop.events).toEqual([]);
  });
});

describe("results", () => {
  it("stops at the first failure and still returns the screen", async () => {
    const { desktop, session } = rig();
    const agent = session();
    await agent.call("observe", {}, never);
    const result = await act(
      agent,
      [
        { do: "key", keys: "a" },
        { do: "invoke", target: { sel: 'button[name="Missing"]' }, action: "press" },
        { do: "key", keys: "b" },
      ],
      { after: "full" },
    );
    expect(text(result)).toMatch(/Stopped at step 2\/3 .*Nothing matches/);
    expect(text(result)).toMatch(/Near misses: button "Nope"/);
    expect(text(result)).toMatch(/Outline of w\d+ "Probe"/);
    expect(result.content.at(-1)).toMatchObject({ type: "image" });
    expect(desktop.events).toEqual(["keydown a", "keyup a"]);
  });

  it("keeps refs stable across observations", async () => {
    const { session } = rig();
    const agent = session();
    const first = text(await agent.call("observe", {}, never));
    const second = text(await agent.call("observe", {}, never));
    const outline = (t: string) => t.slice(t.indexOf("Outline"));
    expect(outline(second)).toBe(outline(first));
  });
});
