// Runs act steps against the Desktop port, and takes observations. Every native input call is
// preceded by gate.check(), which reads live control state; composite gestures (click, chord,
// drag, typing) are built here from single primitives so Stop lands between any two of them.
import { type IdentityKey, type NodeFacts, RefTable, identityKeys, renderOutline } from "./outline.ts";
import {
  type BatchReport,
  type Delivery,
  type ElementTarget,
  type ImagePoint,
  type InvokeAction,
  type KeyCombo,
  type MouseButton,
  type Observation,
  type ObserveRequest,
  type Ref,
  type Step,
  type StepFailure,
  type Target,
  type WindowLine,
  describeStep,
} from "./tools.ts";

export interface ElementHandle {
  readonly __element: unique symbol;
}

export type DesktopPoint = { readonly x: number; readonly y: number } & { readonly __desktop: unique symbol };

export const desktopPoint = (x: number, y: number): DesktopPoint => ({ x, y }) as DesktopPoint;

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WindowFacts {
  readonly handle: ElementHandle;
  readonly key: IdentityKey;
  readonly title: string;
  readonly app: string;
  readonly pid: number;
  readonly active: boolean;
  readonly bounds: Bounds | null;
  /** When the backend first saw this window, for the lost-click rule. */
  readonly firstSeen: number;
}

export interface CaptureFacts {
  readonly nodes: ReadonlyArray<NodeFacts>;
  readonly handles: ReadonlyArray<ElementHandle>;
  readonly truncated: boolean;
}

export interface Shot {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** The image's own mapping (xa11y Screenshot.imageToDesktop after resize and crop). */
  readonly toDesktop: (p: ImagePoint) => DesktopPoint;
}

export type ShotSource = { readonly kind: "window"; readonly window: ElementHandle } | { readonly kind: "screen" };

export interface ImageFrame extends Shot {
  readonly id: string;
  /** For a window image: the window and its bounds when captured, to validate points against. */
  readonly window: { readonly handle: ElementHandle; readonly bounds: Bounds | null } | null;
}

export type PointerTarget =
  | { readonly kind: "element"; readonly element: ElementHandle }
  | { readonly kind: "point"; readonly at: DesktopPoint };

export interface ElementInfo {
  readonly pid: number | null;
  readonly visible: boolean;
  readonly bounds: Bounds | null;
  readonly label: string;
}

/**
 * The port batch.ts drives. Each input method is one native call, so the gate check before it
 * bounds what a Stop can let through to that one call. Nothing here waits or retries.
 */
export interface Desktop {
  /** T3 Code's main process, which owns its windows: the backend's parent. */
  readonly t3codePid: number;
  windows(): Promise<ReadonlyArray<WindowFacts>>;
  foreground(): Promise<WindowFacts | null>;
  /** One attempt. scopePid null searches every app except T3 Code. */
  find(
    selector: string,
    scopePid: number | null,
  ): Promise<{ readonly element: ElementHandle } | { readonly candidates: ReadonlyArray<string> }>;
  info(element: ElementHandle): ElementInfo;
  windowOf(element: ElementHandle): Promise<WindowFacts | null>;
  alive(element: ElementHandle): Promise<boolean>;
  same(a: ElementHandle, b: ElementHandle): Promise<boolean>;
  /** The window's bounds now, or null when it is gone. */
  boundsNow(window: ElementHandle): Promise<Bounds | null>;
  capture(root: ElementHandle, options: { readonly maxNodes: number; readonly timeoutMs: number }): Promise<CaptureFacts>;
  /** crop is a desktop rectangle, cut out of the full-resolution capture before scaling. */
  screenshot(source: ShotSource, maxLongEdge: number, crop: Bounds | null): Promise<Shot>;
  moveTo(target: PointerTarget): Promise<void>;
  mouseDown(button: MouseButton): Promise<void>;
  mouseUp(button: MouseButton): Promise<void>;
  wheel(target: PointerTarget, dx: number, dy: number): Promise<void>;
  keyDown(key: string): Promise<void>;
  keyUp(key: string): Promise<void>;
  typeChar(char: string): Promise<void>;
  invoke(element: ElementHandle, action: InvokeAction): Promise<void>;
  setValue(element: ElementHandle, value: string): Promise<void>;
  open(uri: string): Promise<void>;
}

/** A step failure carried as an exception inside the runner. */
export class StepError extends Error {
  constructor(readonly failure: StepFailure) {
    super(failure.message);
  }
}

export const failure = (
  reason: StepFailure["reason"],
  message: string,
  delivery: Delivery = "none",
  candidates: ReadonlyArray<string> = [],
): StepError => new StepError({ reason, message, delivery, candidates });

/**
 * check() runs immediately before every native input call and throws a StepError when input
 * isn't allowed. signal only shortens waits; it never decides whether input may be sent.
 */
export interface Gate {
  readonly signal: AbortSignal;
  check(): void;
}

export interface Timing {
  readonly pollMs: number;
  readonly resolveMs: number;
  readonly firstSeenMs: number;
  readonly dragMoves: number;
  readonly dragStepMs: number;
  readonly settleCapMs: number;
}

export const TIMING: Timing = {
  pollMs: 100,
  resolveMs: 3000,
  firstSeenMs: 1000,
  dragMoves: 8,
  dragStepMs: 20,
  settleCapMs: 1500,
};

export interface BatchContext {
  readonly desktop: Desktop;
  readonly gate: Gate;
  readonly refs: RefTable<ElementHandle>;
  readonly latestImage: ImageFrame | null;
  readonly currentWindow: WindowFacts | null;
  readonly onStep: (summary: string) => void;
  readonly now: () => number;
  readonly timing: Timing;
}

export interface BatchResult {
  readonly report: BatchReport;
  /** The session's new current window. */
  readonly lastWindow: WindowFacts | null;
  readonly foregroundChanged: boolean;
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

const isOffLimits = (desktop: Desktop, pid: number | null): boolean => pid !== null && pid === desktop.t3codePid;

const inside = (b: Bounds | null, p: DesktopPoint): boolean =>
  b !== null && p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;

const sameBounds = (a: Bounds | null, b: Bounds | null): boolean =>
  a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const graphemes = (text: string): string[] => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
};

interface Resolved {
  readonly pointer: PointerTarget;
  readonly element: ElementHandle | null;
  readonly window: WindowFacts | null;
  /** Desktop coordinates when known up front, for drag paths. */
  readonly at: DesktopPoint | null;
}

/** Counts the native input calls a step sends, so a failure can say what was delivered. */
class StepRun {
  sent = 0;
  constructor(private readonly ctx: BatchContext) {}

  async input(call: () => Promise<void>): Promise<void> {
    this.ctx.gate.check();
    await call();
    this.sent += 1;
  }

  /** Releases may always run, after Stop too: they let go of what this step holds. */
  async release(call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch {}
  }
}

async function resolveElement(
  target: ElementTarget,
  ctx: BatchContext,
  waitMs: number,
  forWait: boolean,
): Promise<ElementHandle | null> {
  const { desktop } = ctx;
  if (target.kind === "ref") {
    const element = ctx.refs.resolve(target.ref);
    if (!element) throw failure("unknown_ref", `Unknown ref ${target.ref}. Observe again.`);
    if (!(await desktop.alive(element))) {
      if (forWait) return null;
      throw failure("stale", `${target.ref} is gone from the screen. Observe again.`);
    }
    return element;
  }
  let scopePid: number | null = null;
  if (target.win) {
    const win = ctx.refs.resolve(target.win);
    if (!win) throw failure("unknown_ref", `Unknown ref ${target.win}. Observe again.`);
    scopePid = desktop.info(win).pid;
    if (isOffLimits(desktop, scopePid)) throw failure("off_limits", "T3 Code's own window is off limits.");
  } else if (!forWait && ctx.currentWindow) {
    scopePid = ctx.currentWindow.pid;
  }
  const deadline = ctx.now() + waitMs;
  for (;;) {
    const found = await desktop.find(target.selector, scopePid);
    if ("element" in found) return found.element;
    if (forWait) return null;
    if (ctx.now() >= deadline) {
      const where = target.win ? `in ${target.win}` : scopePid === null ? "in any app" : "in the current window's app";
      throw failure("not_found", `Nothing matches ${target.selector} ${where}.`, "none", found.candidates);
    }
    await sleep(ctx.timing.pollMs, ctx.gate.signal);
  }
}

async function resolve(target: Target, ctx: BatchContext): Promise<Resolved> {
  const { desktop } = ctx;
  if (target.kind === "point") {
    const image = ctx.latestImage;
    if (!image) throw failure("no_image", "There is no image to point into. Observe first.");
    if (image.window) {
      const now = await desktop.boundsNow(image.window.handle);
      if (!sameBounds(now, image.window.bounds)) {
        throw failure("moved", `The window in image ${image.id} moved or closed since. Observe again.`);
      }
    }
    const at = image.toDesktop(target.at);
    const window = image.window ? await desktop.windowOf(image.window.handle) : null;
    return { pointer: { kind: "point", at }, element: null, window, at };
  }
  const element = (await resolveElement(target, ctx, ctx.timing.resolveMs, false))!;
  const info = desktop.info(element);
  if (isOffLimits(desktop, info.pid)) throw failure("off_limits", "T3 Code's own window is off limits.");
  const b = info.bounds;
  const at = b ? desktopPoint(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)) : null;
  return { pointer: { kind: "element", element }, element, window: await desktop.windowOf(element), at };
}

/** The lost-click rule: a pointer step into a window that just appeared waits until it is 1 s old. */
async function settleBefore(window: WindowFacts | null, ctx: BatchContext): Promise<void> {
  if (!window) return;
  const wait = window.firstSeen + ctx.timing.firstSeenMs - ctx.now();
  if (wait > 0) await sleep(wait, ctx.gate.signal);
}

async function refuseKeysIntoT3(ctx: BatchContext): Promise<void> {
  const fg = await ctx.desktop.foreground();
  if (fg && isOffLimits(ctx.desktop, fg.pid)) {
    throw failure(
      "off_limits",
      "Keyboard input refused: T3 Code is the active window. Activate the target window first (invoke activate on its w-ref, or click it).",
    );
  }
}

async function refusePointIntoT3(resolved: Resolved, ctx: BatchContext): Promise<void> {
  if (resolved.pointer.kind !== "point") return;
  const fg = await ctx.desktop.foreground();
  if (fg && isOffLimits(ctx.desktop, fg.pid) && inside(fg.bounds, resolved.pointer.at)) {
    throw failure("off_limits", "That point is on T3 Code's window, which is off limits.");
  }
}

async function click(
  run: StepRun,
  ctx: BatchContext,
  resolved: Resolved,
  button: MouseButton,
  count: number,
  mods: ReadonlyArray<string>,
): Promise<void> {
  const { desktop } = ctx;
  const held: string[] = [];
  try {
    for (const mod of mods) {
      await run.input(() => desktop.keyDown(mod));
      held.push(mod);
    }
    await run.input(() => desktop.moveTo(resolved.pointer));
    for (let i = 0; i < count; i++) {
      await run.input(() => desktop.mouseDown(button));
      await run.release(() => desktop.mouseUp(button));
    }
  } finally {
    for (const mod of held.reverse()) await run.release(() => desktop.keyUp(mod));
  }
}

async function chord(run: StepRun, ctx: BatchContext, combo: KeyCombo): Promise<void> {
  const { desktop } = ctx;
  const held: string[] = [];
  try {
    for (const mod of combo.held) {
      await run.input(() => desktop.keyDown(mod));
      held.push(mod);
    }
    await run.input(() => desktop.keyDown(combo.key));
    await run.release(() => desktop.keyUp(combo.key));
  } finally {
    for (const mod of held.reverse()) await run.release(() => desktop.keyUp(mod));
  }
}

async function drag(run: StepRun, ctx: BatchContext, from: Resolved, to: Resolved): Promise<void> {
  const { desktop } = ctx;
  await run.input(() => desktop.moveTo(from.pointer));
  await run.input(() => desktop.mouseDown("left"));
  try {
    if (from.at && to.at) {
      const moves = ctx.timing.dragMoves;
      for (let i = 1; i < moves; i++) {
        const at = desktopPoint(
          Math.round(from.at.x + ((to.at.x - from.at.x) * i) / moves),
          Math.round(from.at.y + ((to.at.y - from.at.y) * i) / moves),
        );
        await sleep(ctx.timing.dragStepMs, ctx.gate.signal);
        await run.input(() => desktop.moveTo({ kind: "point", at }));
      }
    }
    await sleep(ctx.timing.dragStepMs, ctx.gate.signal);
    await run.input(() => desktop.moveTo(to.pointer));
  } finally {
    await run.release(() => desktop.mouseUp("left"));
  }
}

/** Runs one step. Returns the window it acted in, or null for steps with no target. */
async function runStep(step: Step, run: StepRun, ctx: BatchContext): Promise<WindowFacts | null> {
  const { desktop } = ctx;
  switch (step.do) {
    case "click": {
      const resolved = await resolve(step.target, ctx);
      await refusePointIntoT3(resolved, ctx);
      await settleBefore(resolved.window, ctx);
      await click(run, ctx, resolved, step.button, step.count, step.mods);
      return resolved.window;
    }
    case "type": {
      let window: WindowFacts | null = null;
      if (step.target) {
        const resolved = await resolve(step.target, ctx);
        await refusePointIntoT3(resolved, ctx);
        await settleBefore(resolved.window, ctx);
        await click(run, ctx, resolved, "left", 1, []);
        window = resolved.window;
      }
      await refuseKeysIntoT3(ctx);
      const chars = graphemes(step.text);
      for (const [i, char] of chars.entries()) {
        try {
          await run.input(() => desktop.typeChar(char));
        } catch (error) {
          if (error instanceof StepError && i > 0) {
            throw failure(error.failure.reason, `${error.failure.message} ${i} of ${chars.length} characters were typed.`, "sent");
          }
          throw error;
        }
      }
      return window;
    }
    case "key":
      await refuseKeysIntoT3(ctx);
      for (let i = 0; i < step.repeat; i++) await chord(run, ctx, step.combo);
      return null;
    case "scroll": {
      const resolved = await resolve(step.target, ctx);
      await refusePointIntoT3(resolved, ctx);
      await settleBefore(resolved.window, ctx);
      for (let i = 0; i < Math.abs(step.dy); i++) await run.input(() => desktop.wheel(resolved.pointer, 0, Math.sign(step.dy)));
      for (let i = 0; i < Math.abs(step.dx); i++) await run.input(() => desktop.wheel(resolved.pointer, Math.sign(step.dx), 0));
      return resolved.window;
    }
    case "drag": {
      const from = await resolve(step.from, ctx);
      const to = await resolve(step.to, ctx);
      await refusePointIntoT3(from, ctx);
      await refusePointIntoT3(to, ctx);
      await settleBefore(from.window, ctx);
      await drag(run, ctx, from, to);
      return to.window ?? from.window;
    }
    case "invoke":
    case "set": {
      const resolved = await resolve(step.target, ctx);
      const element = resolved.element!;
      await run.input(() => (step.do === "invoke" ? desktop.invoke(element, step.action) : desktop.setValue(element, step.value)));
      return resolved.window;
    }
    case "wait": {
      if (step.until.kind === "time") {
        await sleep(step.ms, ctx.gate.signal);
        return null;
      }
      const deadline = ctx.now() + step.ms;
      const wantGone = step.until.kind === "gone";
      for (;;) {
        const element = await resolveElement(step.until.target, ctx, 0, true);
        const shown = element !== null && desktop.info(element).visible;
        if (shown && isOffLimits(desktop, desktop.info(element).pid)) {
          throw failure("off_limits", "That element is in T3 Code, which is off limits.");
        }
        if (wantGone ? !shown : shown) return element ? await desktop.windowOf(element) : null;
        if (ctx.now() >= deadline) {
          throw failure("timeout", `Still ${wantGone ? "shown" : "not shown"} after ${step.ms} ms.`);
        }
        await sleep(ctx.timing.pollMs, ctx.gate.signal);
      }
    }
    case "open":
      await run.input(() => desktop.open(step.uri));
      return null;
  }
}

const asFailure = (error: unknown, gate: Gate, sent: number): StepFailure => {
  if (error instanceof StepError) {
    if (sent > 0 && error.failure.delivery === "none") return { ...error.failure, delivery: "sent" };
    return error.failure;
  }
  // An abort ended a wait: report why from the live gate.
  if (gate.signal.aborted) {
    try {
      gate.check();
    } catch (gateError) {
      if (gateError instanceof StepError) return { ...gateError.failure, delivery: sent > 0 ? "sent" : "none" };
    }
    return { reason: "aborted", message: "The call was cancelled.", delivery: sent > 0 ? "sent" : "none", candidates: [] };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { reason: "platform", message, delivery: sent > 0 ? "maybe" : "none", candidates: [] };
};

export async function runBatch(steps: ReadonlyArray<Step>, ctx: BatchContext): Promise<BatchResult> {
  const before = await ctx.desktop.foreground();
  let lastWindow = ctx.currentWindow;
  let done = 0;
  let failed: BatchReport["failed"] = null;
  for (const [i, step] of steps.entries()) {
    const summary = describeStep(step);
    ctx.onStep(summary);
    const run = new StepRun(ctx);
    try {
      const window = await runStep(step, run, { ...ctx, currentWindow: lastWindow });
      if (window && !isOffLimits(ctx.desktop, window.pid)) lastWindow = window;
      else if (!window && step.do !== "wait") {
        const fg = await ctx.desktop.foreground();
        if (fg && !isOffLimits(ctx.desktop, fg.pid)) lastWindow = fg;
      }
      done += 1;
    } catch (error) {
      failed = { step: i + 1, summary, failure: asFailure(error, ctx.gate, run.sent) };
      break;
    }
  }
  const after = await ctx.desktop.foreground();
  return {
    report: { total: steps.length, done, failed },
    lastWindow,
    foregroundChanged: (before?.key ?? null) !== (after?.key ?? null),
  };
}

/** After a batch: wait until the window's bounds read the same twice, up to the cap. */
export async function settleAfter(window: WindowFacts | null, ctx: Pick<BatchContext, "desktop" | "now" | "timing">, signal: AbortSignal): Promise<void> {
  if (!window) return;
  const deadline = ctx.now() + ctx.timing.settleCapMs;
  let last = await ctx.desktop.boundsNow(window.handle);
  while (ctx.now() < deadline) {
    await sleep(ctx.timing.pollMs, signal);
    const now = await ctx.desktop.boundsNow(window.handle);
    if (sameBounds(last, now) || now === null) return;
    last = now;
  }
}

export interface ObserveContext {
  readonly desktop: Desktop;
  readonly refs: RefTable<ElementHandle>;
  readonly currentWindow: WindowFacts | null;
  readonly latestImage: ImageFrame | null;
  readonly nextImageId: () => string;
}

export interface Observed {
  readonly observation: Observation;
  readonly frame: ImageFrame | null;
  readonly window: WindowFacts | null;
}

export const MAX_LONG_EDGE = 1280;
const CAPTURE = { maxNodes: 600, timeoutMs: 400 } as const;

const windowKey = (w: WindowFacts): IdentityKey => w.key;

async function pickWindow(request: ObserveRequest, ctx: ObserveContext): Promise<WindowFacts | null | "t3-only"> {
  const { desktop } = ctx;
  if (request.win) {
    const handle = ctx.refs.resolve(request.win);
    if (!handle) throw failure("unknown_ref", `Unknown ref ${request.win}. Observe again.`);
    const facts = await desktop.windowOf(handle);
    if (!facts) throw failure("stale", `${request.win} is gone from the screen.`);
    return facts;
  }
  if (ctx.currentWindow && (await desktop.alive(ctx.currentWindow.handle))) {
    return (await desktop.windowOf(ctx.currentWindow.handle)) ?? ctx.currentWindow;
  }
  const fg = await desktop.foreground();
  if (fg && isOffLimits(desktop, fg.pid)) return "t3-only";
  return fg;
}

/** Desktop rectangle for a zoom given in the latest image's pixels. */
const zoomRect = (zoom: NonNullable<ObserveRequest["zoom"]>, image: ImageFrame): Bounds => {
  const a = image.toDesktop({ x: zoom.x, y: zoom.y });
  const b = image.toDesktop({ x: Math.min(zoom.x + zoom.width, image.width), y: Math.min(zoom.y + zoom.height, image.height) });
  return { x: a.x, y: a.y, width: Math.max(1, b.x - a.x), height: Math.max(1, b.y - a.y) };
};

export async function observe(
  request: ObserveRequest,
  ctx: ObserveContext,
  include: { readonly windows: boolean; readonly image: boolean },
): Promise<Observed> {
  const { desktop } = ctx;
  const picked = await pickWindow(request, ctx);
  const window = picked === "t3-only" ? null : picked;
  let note: string | null = picked === "t3-only" ? "T3 Code is the active window. Pass win to look at another window, or open an app." : null;
  if (picked === null && request.scope === "window") note = "No window is active.";

  const crop = request.zoom
    ? ctx.latestImage
      ? zoomRect(request.zoom, ctx.latestImage)
      : (() => {
          throw failure("no_image", "There is no image to zoom into. Observe first.");
        })()
    : null;
  const zoomSource: ShotSource | null =
    request.zoom && ctx.latestImage ? (ctx.latestImage.window ? { kind: "window", window: ctx.latestImage.window.handle } : { kind: "screen" }) : null;
  const source: ShotSource | null =
    zoomSource ?? (request.scope === "screen" ? { kind: "screen" } : window ? { kind: "window", window: window.handle } : null);

  const [shot, capture, windows] = await Promise.all([
    include.image && source ? desktop.screenshot(source, MAX_LONG_EDGE, crop) : null,
    request.outline && window ? desktop.capture(window.handle, CAPTURE) : null,
    include.windows ? desktop.windows() : null,
  ]);

  let outline: Observation["outline"] = null;
  if (capture && window) {
    const keys = identityKeys(capture.nodes, windowKey(window));
    const refs = await ctx.refs.adopt(keys, capture.nodes.map((n) => n.parent === null), capture.handles);
    const rendered = renderOutline(capture.nodes, refs);
    outline = { window: refs[0]!, title: window.title, text: rendered.text, truncated: rendered.truncated || capture.truncated };
  }

  let windowLines: WindowLine[] | null = null;
  if (windows) {
    const refs = await ctx.refs.adopt(windows.map(windowKey), windows.map(() => true), windows.map((w) => w.handle));
    windowLines = windows.map((w, i) => ({
      ref: refs[i]!,
      title: w.title,
      app: w.app,
      active: w.active,
      offLimits: isOffLimits(desktop, w.pid),
    }));
  }

  let frame: ImageFrame | null = null;
  let windowRef: Ref | null = outline?.window ?? null;
  if (shot && source) {
    const shotWindow = source.kind === "window" ? source.window : null;
    if (shotWindow && !windowRef) {
      const facts = await desktop.windowOf(shotWindow);
      if (facts) [windowRef] = await ctx.refs.adopt([facts.key], [true], [facts.handle]);
    }
    frame = {
      ...shot,
      id: ctx.nextImageId(),
      window: shotWindow ? { handle: shotWindow, bounds: await desktop.boundsNow(shotWindow) } : null,
    };
  }
  const of = request.zoom ? `zoom of ${ctx.latestImage!.id}` : source?.kind === "screen" ? "primary screen" : `window ${windowRef ?? "?"}`;
  return {
    observation: {
      image: frame ? { id: frame.id, png: frame.png, width: frame.width, height: frame.height, of } : null,
      outline,
      windows: windowLines,
      note,
    },
    frame,
    window,
  };
}
