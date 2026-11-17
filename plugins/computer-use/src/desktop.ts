import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

import * as xa from "@crowecawcaw/xa11y";

import {
  type Bounds,
  type CaptureFacts,
  type Desktop,
  type ElementHandle,
  type ElementInfo,
  type PointerTarget,
  type Shot,
  type ShotSource,
  type WindowFacts,
  StepError,
  desktopPoint,
  failure,
} from "./batch.ts";
import type { IdentityKey, NodeFacts } from "./outline.ts";
import { BoundedMap } from "./bounded.ts";
import { type Held, HeldJournal } from "./held.ts";
import { encodePng } from "./png.ts";
import type { InvokeAction, StepFailure } from "./tools.ts";

type Element = xa.Element;
const el = (handle: ElementHandle): Element => handle as unknown as Element;
const handle = (element: Element): ElementHandle => element as unknown as ElementHandle;

const REASONS: ReadonlyMap<string, StepFailure["reason"]> = new Map([
  ["XA11Y_SELECTOR_NOT_MATCHED", "not_found"],
  ["XA11Y_ELEMENT_STALE", "stale"],
  ["XA11Y_ACTION_NOT_SUPPORTED", "not_supported"],
  ["XA11Y_TEXT_VALUE_NOT_SUPPORTED", "not_supported"],
  ["XA11Y_UNSUPPORTED", "not_supported"],
  ["XA11Y_INVALID_ACTION_DATA", "invalid"],
  ["XA11Y_NO_ELEMENT_BOUNDS", "invalid"],
  ["XA11Y_INVALID_SELECTOR", "invalid"],
  ["XA11Y_TIMEOUT", "timeout"],
]);

/** Maps an xa11y error to a step failure, keeping xa11y's own word on whether it was delivered. */
const asStepError = (error: unknown): StepError => {
  if (error instanceof StepError) return error;
  const e = error as { code?: string; delivery?: string; message?: string; candidates?: string[] };
  const reason = (e.code && REASONS.get(e.code)) || "platform";
  const message = (e.message ?? String(error)).replace(/^XA11Y_[A-Z_]+:\s*/, "").split("\n")[0]!;
  return failure(reason, message, e.delivery === "not_delivered" ? "none" : "maybe", e.candidates ?? []);
};

const native = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw asStepError(error);
  }
};

const quiet = async <T>(call: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await call();
  } catch {
    return fallback;
  }
};

const rect = (b: xa.Rect | null): Bounds | null =>
  b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;

/** Called once at start, before the pipe opens: lets go of what a killed backend held. */
export async function releaseJournaled(heldPath: string): Promise<Held | null> {
  let held: Held;
  try {
    held = JSON.parse(readFileSync(heldPath, "utf8")) as Held;
  } catch {
    return null;
  }
  const sim = xa.inputSim();
  const up = (release: () => Promise<void>) => quiet(() => release().then(() => true), false);
  const buttons: Array<(typeof held.buttons)[number]> = [];
  const keys: string[] = [];
  for (const button of held.buttons ?? []) if (!(await up(() => sim.mouseUp(button)))) buttons.push(button);
  for (const key of held.keys ?? []) if (!(await up(() => sim.keyUp(key)))) keys.push(key);
  // What couldn't be released stays journaled, so the next start tries again.
  if (buttons.length || keys.length) writeFileSync(heldPath, JSON.stringify({ buttons, keys }));
  else rmSync(heldPath, { force: true });
  return held;
}

const inFront = async (e: Element): Promise<boolean> => {
  const app = await xa.App.foreground({ timeout: 0 }).catch(() => null);
  return app !== null && app.pid === e.pid;
};

/**
 * Windows refuses SetForegroundWindow from a background process while another app is active (the
 * foreground lock), and T3 Code is the active app whenever a user has just sent a message. An
 * accessibility focus gets through that lock, and so does restoring a minimized window. Measured
 * with T3 Code in front: activate was refused, focus and minimize-then-restore each worked.
 */
async function bringToFront(e: Element): Promise<void> {
  const refused = await e.activate().then(
    () => null,
    (error: unknown) => error,
  );
  if (refused === null || (await inFront(e))) return;
  await e.focus().catch(() => {});
  if (await inFront(e)) return;
  await e.minimize();
  await e.restore();
  if (!(await inFront(e))) throw refused;
}

const INVOKE: Readonly<Record<InvokeAction, (e: Element) => Promise<void>>> = {
  press: (e) => e.press(),
  toggle: (e) => e.toggle(),
  expand: (e) => e.expand(),
  collapse: (e) => e.collapse(),
  select: (e) => e.select(),
  focus: (e) => e.focus(),
  scroll_into_view: (e) => e.scrollIntoView(),
  activate: bringToFront,
  maximize: (e) => e.maximize(),
  minimize: (e) => e.minimize(),
  restore: (e) => e.restore(),
  close: (e) => e.close(),
};

export function loadDesktop(heldPath: string, log: (message: string) => void): Desktop {
  xa.setDefaultTimeout({ timeout: 0 });
  const sim = xa.inputSim();
  const t3codePid = process.ppid;
  const firstSeen = new BoundedMap<string, number>(1000);
  const appNames = new BoundedMap<number, string>(256);
  const held = new HeldJournal((now) => {
    if (now) writeFileSync(heldPath, JSON.stringify(now));
    else rmSync(heldPath, { force: true });
  });

  const keyOf = (w: Element): IdentityKey =>
    (w.stableId ? `id:${w.pid ?? "?"}:${w.stableId}` : `path:${w.pid ?? "?"}/${w.role}:${w.name ?? ""}`) as IdentityKey;

  const facts = (w: Element, app: string): WindowFacts => {
    const key = keyOf(w);
    const seen = firstSeen.get(key) ?? Date.now();
    firstSeen.set(key, seen);
    return {
      handle: handle(w),
      key,
      title: w.name ?? "",
      app,
      pid: w.pid ?? -1,
      active: w.active,
      bounds: rect(w.bounds),
      firstSeen: seen,
    };
  };

  const appName = async (pid: number | null): Promise<string> => {
    if (pid === null) return "?";
    const known = appNames.get(pid);
    if (known) return known;
    const name = await quiet(async () => (await xa.App.byPid(pid, { timeout: 0 })).name, "?");
    appNames.set(pid, name);
    return name;
  };

  const topLevel = async (element: Element): Promise<Element | null> => {
    let current: Element = element;
    for (let depth = 0; depth < 64; depth++) {
      const parent = await current.parent();
      if (!parent || parent.role === "application") return current;
      current = parent;
    }
    return null;
  };

  const pointer = (target: PointerTarget): number[] | Element =>
    target.kind === "point" ? [target.at.x, target.at.y] : el(target.element);

  return {
    t3codePid,

    async windows() {
      const apps = await quiet(() => xa.App.list(), []);
      const lists = await Promise.all(
        apps.map(async (app) => {
          if (app.pid !== null) appNames.set(app.pid, app.name);
          const windows = await quiet(() => app.windows(), []);
          return windows.map((w) => facts(w, app.name));
        }),
      );
      return lists.flat().filter((w) => w.bounds !== null && w.bounds.width > 0 && w.bounds.height > 0);
    },

    async foreground() {
      const app = await quiet(() => xa.App.foreground({ timeout: 0 }), null);
      if (!app) return null;
      const windows = await quiet(() => app.windows(), []);
      const active = windows.find((w) => w.active) ?? windows[0];
      return active ? facts(active, app.name) : null;
    },

    foregroundPid: async () => (await quiet(() => xa.App.foreground({ timeout: 0 }), null))?.pid ?? null,

    async find(selector, scopePid) {
      const locator = scopePid === null ? xa.locator(selector) : (await native(() => xa.App.byPid(scopePid, { timeout: 0 }))).locator(selector);
      const all = await quiet(() => locator.elements(), [] as Element[]);
      const allowed = all.filter((e) => e.pid !== t3codePid);
      const found = allowed.find((e) => e.visible) ?? allowed[0];
      if (found) return { element: handle(found) };
      try {
        await locator.element();
      } catch (error) {
        return { candidates: (error as { candidates?: string[] }).candidates ?? [] };
      }
      return { candidates: [] };
    },

    info(h): ElementInfo {
      const e = el(h);
      return { pid: e.pid, visible: e.visible, bounds: rect(e.bounds), label: `${e.role} ${JSON.stringify(e.name ?? "")}` };
    },

    async windowOf(h) {
      const top = await quiet(() => topLevel(el(h)), null);
      return top ? facts(top, await appName(top.pid)) : null;
    },

    alive: (h) => quiet(async () => (await el(h).checkAlive(), true), false),

    same: (a, b) => el(a).sameAs(el(b)),

    async boundsNow(h) {
      const w = el(h);
      if (w.pid === null) return null;
      const app = await quiet(() => xa.App.byPid(w.pid!, { timeout: 0 }), null);
      if (!app) return null;
      for (const candidate of await quiet(() => app.windows(), [])) {
        if (await quiet(() => candidate.sameAs(w), false)) return rect(candidate.bounds);
      }
      return null;
    },

    async capture(root, options): Promise<CaptureFacts> {
      const capture = await native(() => el(root).capture({ maxNodes: options.maxNodes, timeout: options.timeoutMs }));
      const nodes: NodeFacts[] = capture.nodes.map((n) => {
        const e = n.element;
        return {
          parent: n.parent ?? null,
          role: e.role,
          name: e.name,
          value: e.value,
          stableId: e.stableId,
          pid: e.pid,
          visible: e.visible,
          enabled: e.enabled,
          focused: e.focused,
          checked: e.checked,
          expanded: e.expanded,
          selected: e.selected,
        };
      });
      const t = capture.truncated;
      return { nodes, handles: capture.nodes.map((n) => handle(n.element)), truncated: t.byNodes || t.byTime || t.byDepth };
    },

    async screenshot(source: ShotSource, maxLongEdge: number, crop: Bounds | null): Promise<Shot> {
      let shot = await native(() => (source.kind === "window" ? xa.screenshot({ element: el(source.window) }) : xa.screenshot()));
      if (crop) {
        const [piece] = shot.desktopRectToImage(crop);
        if (!piece) throw failure("invalid", "The zoom rectangle is off the image.");
        shot = shot.crop(piece);
      }
      const scale = Math.min(1, maxLongEdge / Math.max(shot.width, shot.height));
      if (scale < 1) shot = shot.resize(Math.max(1, Math.round(shot.width * scale)), Math.max(1, Math.round(shot.height * scale)));
      const final = shot;
      return {
        png: encodePng(final.pixels, final.width, final.height),
        width: final.width,
        height: final.height,
        toDesktop: (p) => {
          const [x, y] = final.imageToDesktop(p.x, p.y);
          return desktopPoint(Math.round(x!), Math.round(y!));
        },
      };
    },

    moveTo: (target) => native(() => sim.moveTo(pointer(target))),
    mouseDown: (button) => held.down("button", button, () => native(() => sim.mouseDown(button))),
    mouseUp: (button) => held.up("button", button, () => native(() => sim.mouseUp(button))),
    wheel: (target, dx, dy) => native(() => sim.scroll(pointer(target), dx, dy)),
    keyDown: (key) => held.down("key", key, () => native(() => sim.keyDown(key))),
    keyUp: (key) => held.up("key", key, () => native(() => sim.keyUp(key))),
    typeChar: (char) => native(() => sim.typeText(char)),

    invoke: (h, action) => native(() => INVOKE[action](el(h))),

    setValue: (h, value) =>
      native(() => {
        const e = el(h);
        if (e.numericValue !== null || e.maxValue !== null) {
          const number = Number(value);
          if (!Number.isFinite(number)) throw failure("invalid", `${JSON.stringify(value)} isn't a number, and this control takes one.`);
          return e.setNumericValue(number);
        }
        return e.setValue(value);
      }),

    async open(uri) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn("explorer.exe", [uri], { detached: true, stdio: "ignore", windowsHide: false });
        child.once("error", (error) => reject(failure("platform", `Couldn't open ${uri}: ${error.message}`, "none")));
        child.once("spawn", () => {
          child.unref();
          log(`opened ${uri}`);
          resolve();
        });
      });
    },
  };
}
