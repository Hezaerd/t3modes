import { z } from "zod";

import type { Refusal } from "./control.ts";

/** Session-scoped refs. `w` names a top-level window, `e` anything else. */
export type Ref = `w${number}` | `e${number}`;

export interface ImagePoint {
  readonly x: number;
  readonly y: number;
}

export type WindowName = { readonly kind: "ref"; readonly ref: Ref } | { readonly kind: "title"; readonly title: string };

export type Target =
  | { readonly kind: "ref"; readonly ref: Ref }
  | { readonly kind: "sel"; readonly selector: string; readonly win: WindowName | null }
  | { readonly kind: "point"; readonly at: ImagePoint; readonly image: string | null };

export type ElementTarget = Exclude<Target, { kind: "point" }>;

export type MouseButton = "left" | "right" | "middle";
export type Modifier = "Control" | "Shift" | "Alt" | "Meta";

export interface KeyCombo {
  readonly key: string;
  readonly held: ReadonlyArray<Modifier>;
}

export const INVOKE_ACTIONS = [
  "press",
  "toggle",
  "expand",
  "collapse",
  "select",
  "focus",
  "scroll_into_view",
  "activate",
  "maximize",
  "minimize",
  "restore",
  "close",
] as const;
export type InvokeAction = (typeof INVOKE_ACTIONS)[number];

export type Step =
  | {
      readonly do: "click";
      readonly target: Target;
      readonly button: MouseButton;
      readonly count: 1 | 2 | 3;
      readonly mods: ReadonlyArray<Modifier>;
    }
  | { readonly do: "type"; readonly text: string; readonly target: Target | null }
  | { readonly do: "key"; readonly combo: KeyCombo; readonly repeat: number }
  | { readonly do: "scroll"; readonly target: Target; readonly dx: number; readonly dy: number }
  | { readonly do: "drag"; readonly from: Target; readonly to: Target }
  | { readonly do: "invoke"; readonly target: ElementTarget; readonly action: InvokeAction }
  | { readonly do: "set"; readonly target: ElementTarget; readonly value: string }
  | {
      readonly do: "wait";
      readonly until:
        | { readonly kind: "visible" | "gone"; readonly target: ElementTarget }
        | { readonly kind: "time" };
      readonly ms: number;
    }
  | { readonly do: "open"; readonly uri: string };

export type AfterMode = "full" | "outline" | "none";

export interface ActRequest {
  readonly steps: ReadonlyArray<Step>;
  readonly after: AfterMode;
  readonly release: boolean;
}

export interface Zoom {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ObserveRequest {
  readonly win: WindowName | null;
  readonly scope: "window" | "screen";
  readonly zoom: Zoom | null;
  readonly outline: boolean;
}

export type ToolCall =
  | { readonly tool: "observe"; readonly request: ObserveRequest }
  | { readonly tool: "act"; readonly request: ActRequest };

export const LIMITS = {
  steps: 20,
  textChars: 2000,
  repeat: 50,
  scrollTicks: 50,
  sleepMs: 5000,
  waitMs: 15000,
  waitDefaultMs: 5000,
} as const;

// Wire shapes. Flat on purpose: no anyOf or oneOf anywhere, because Codex's schema handling isn't
// trusted with unions. The parser below enforces which fields go together.
const TargetWire = z
  .strictObject({
    ref: z.string().optional().describe('A ref from an outline you got, such as "e7" or "w2".'),
    sel: z
      .string()
      .optional()
      .describe('An xa11y selector, such as \'button[name="Save"]\' or \'text_field\'.'),
    win: z.string().optional().describe('With sel: the window whose app to search, as a w-ref ("w2") or its title.'),
    x: z.number().optional().describe("With y: a pixel in the latest image you got."),
    y: z.number().optional(),
    image: z
      .string()
      .optional()
      .describe('With x and y: the id of the image the pixel is in, such as "i3". A point into an older image is refused.'),
  })
  .describe("Exactly one of: ref; sel (with optional win); x and y (with image).");

const STEP_KINDS = ["click", "type", "key", "scroll", "drag", "invoke", "set", "wait", "open"] as const;

const StepWire = z.strictObject({
  do: z.enum(STEP_KINDS),
  target: TargetWire.optional(),
  to: TargetWire.optional().describe("drag: where to release."),
  text: z.string().optional().describe("type: the text to type."),
  keys: z.string().optional().describe('key: a chord such as "ctrl+shift+s", "enter", "alt+f4".'),
  repeat: z.number().int().optional().describe("key: how many times, 1 to 50."),
  button: z.enum(["left", "right", "middle"]).optional().describe("click: default left."),
  count: z.number().int().optional().describe("click: 1 to 3, default 1."),
  mods: z.array(z.string()).optional().describe('click: modifiers held, such as ["ctrl"].'),
  dx: z.number().int().optional().describe("scroll: wheel ticks right (negative: left)."),
  dy: z.number().int().optional().describe("scroll: wheel ticks down (negative: up)."),
  action: z.enum(INVOKE_ACTIONS).optional().describe("invoke: the accessibility action."),
  value: z.string().optional().describe("set: the new text, or a number as text for a slider."),
  gone: z.boolean().optional().describe("wait: wait until the target is gone instead of shown."),
  timeout_ms: z.number().int().optional().describe("wait: up to 15000 with a target, 5000 without."),
  uri: z.string().optional().describe("open: a URI (ms-settings:display, https://…) or an absolute path."),
});

const ActWire = z.strictObject({
  steps: z.array(StepWire).describe("1 to 20 steps, run in order. The batch stops at the first failure."),
  after: z
    .enum(["full", "outline", "none"])
    .optional()
    .describe("What to return after the steps: image and outline (default), outline only, or nothing."),
  release: z.boolean().optional().describe("Give control back when done, so the user's indicator goes away."),
});

const ObserveWire = z.strictObject({
  win: z
    .string()
    .optional()
    .describe('The window to look at: a w-ref ("w2"), or its title, exact or a unique part of it. Default: the window you last acted on, else the active one.'),
  scope: z.enum(["window", "screen"]).optional().describe("window (default) or the whole primary screen."),
  zoom: z
    .strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional()
    .describe("A rectangle in the latest image's pixels to see at full resolution."),
  outline: z.boolean().optional().describe("Include the accessibility outline (default true)."),
});

export interface ToolDefinition {
  readonly name: "observe" | "act";
  readonly description: string;
  readonly inputSchema: { readonly type: "object" } & Readonly<Record<string, unknown>>;
}

const jsonSchema = (schema: z.ZodType): ToolDefinition["inputSchema"] => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  return { ...rest, type: "object" };
};

const OBSERVE_DESCRIPTION = `Look at the Windows desktop without acting: a screenshot of one window, its accessibility outline with refs, and the list of top-level windows.
If you know the window's title, pass it as win to see that window directly.
Refs (e7, w2) stay the same for an element for as long as this chat runs. Points you send to act are pixels in the latest image you got.
You rarely need this before act: act returns the new screen after every batch.`;

const ACT_DESCRIPTION = `Drive the Windows desktop: run 1 to 20 steps in order, then get the new screen (image and outline) in the same result. Batch every step you can predict.
Targets: {"ref":"e7"} from an outline; {"sel":"button[name=\\"Save\\"]","win":"w2"} (an xa11y selector; win is a w-ref or a window title, and without it the search covers the app of the window you last used); {"x":640,"y":212,"image":"i3"} a pixel in image i3. Always pass the image id: if a newer image came since, the batch is refused before anything runs.
Steps (do):
- invoke {target, action}: press, toggle, expand, collapse, select, focus, scroll_into_view, activate, maximize, minimize, restore, close. No pointer, works on covered windows. Prefer it to click.
- set {target, value}: replace a field's text or a slider's value. Prefer it to type when you replace a whole field.
- click {target, button?, count?, mods?}, type {text, target?}, key {keys, repeat?}, scroll {target, dx?, dy?}, drag {target, to}: real mouse and keyboard input. type and key go to the focused control of the active window. When T3 Code may be in front, invoke activate on the target window's w-ref first. Typing into T3 Code is refused, and so is pointing at a spot that a T3 Code window covers.
- wait {target?, gone?, timeout_ms?}: until the target shows (or is gone); without a target, sleep.
- open {uri}: open a URI or path as Explorer would (ms-settings:colors, https://…, C:\\file.txt).
The user sees an indicator with Stop while you drive. If they stop you, don't retry until they resume. Set release: true on your last batch.
T3 Code's own window is off limits.`;

export const TOOL_LIST: ReadonlyArray<ToolDefinition> = [
  { name: "observe", description: OBSERVE_DESCRIPTION, inputSchema: jsonSchema(ObserveWire) },
  { name: "act", description: ACT_DESCRIPTION, inputSchema: jsonSchema(ActWire) },
];

export type ParseResult =
  | { readonly ok: true; readonly call: ToolCall }
  | { readonly ok: false; readonly message: string };

class Invalid extends Error {}
const fail = (message: string): never => {
  throw new Invalid(message);
};

const isRef = (text: string): text is Ref => /^[we][1-9]\d*$/.test(text);

const parseRef = (text: string, what: string): Ref =>
  isRef(text) ? text : fail(`${what} "${text}" isn't a ref. Refs look like e7 or w2.`);

const parseWindow = (text: string, what: string): WindowName => {
  if (isRef(text)) return text.startsWith("w") ? { kind: "ref", ref: text } : fail(`${what} must be a window ref (w…) or a window title.`);
  const title = text.trim();
  return title ? { kind: "title", title } : fail(`${what} is empty.`);
};

/** An exact title wins, ignoring case; otherwise a unique part of one. Anything else is refused with the list. */
export function pickByTitle<W extends { readonly title: string; readonly app: string }>(
  windows: ReadonlyArray<W>,
  query: string,
): W | string {
  const q = query.toLowerCase();
  const exact = windows.filter((w) => w.title.toLowerCase() === q);
  const matches = exact.length > 0 ? exact : windows.filter((w) => w.title.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0]!;
  const list = windows.map((w) => `${JSON.stringify(w.title)} (${w.app})`).join(" · ") || "none";
  return matches.length === 0
    ? `No window title matches ${JSON.stringify(query)}. Windows: ${list}.`
    : `${matches.length} windows match ${JSON.stringify(query)}; pass more of the title or a w-ref. Windows: ${list}.`;
}

type TargetWire = z.infer<typeof TargetWire>;

const parseTarget = (wire: TargetWire, what: string): Target => {
  const forms = [wire.ref !== undefined, wire.sel !== undefined, wire.x !== undefined || wire.y !== undefined];
  if (forms.filter(Boolean).length !== 1) fail(`${what} needs exactly one of ref, sel, or x and y.`);
  if (wire.win !== undefined && wire.sel === undefined) fail(`${what}: win goes with sel only.`);
  if (wire.image !== undefined && wire.x === undefined) fail(`${what}: image goes with x and y only.`);
  if (wire.ref !== undefined) return { kind: "ref", ref: parseRef(wire.ref, what) };
  if (wire.sel !== undefined) {
    if (!wire.sel.trim()) fail(`${what}: sel is empty.`);
    return { kind: "sel", selector: wire.sel, win: wire.win === undefined ? null : parseWindow(wire.win, `${what}: win`) };
  }
  if (wire.x === undefined || wire.y === undefined) return fail(`${what} needs both x and y.`);
  if (!Number.isFinite(wire.x) || !Number.isFinite(wire.y) || wire.x < 0 || wire.y < 0) {
    fail(`${what}: x and y must be pixels in the latest image.`);
  }
  if (wire.image !== undefined && !/^i[1-9]\d*$/.test(wire.image)) fail(`${what}: image ids look like i3.`);
  return { kind: "point", at: { x: wire.x, y: wire.y }, image: wire.image ?? null };
};

const elementTarget = (target: Target, what: string): ElementTarget =>
  target.kind === "point" ? fail(`${what} must name an element (ref or sel), not a point.`) : target;

const MODIFIERS: ReadonlyMap<string, Modifier> = new Map([
  ["ctrl", "Control"],
  ["control", "Control"],
  ["shift", "Shift"],
  ["alt", "Alt"],
  ["win", "Meta"],
  ["meta", "Meta"],
  ["super", "Meta"],
  ["cmd", "Meta"],
]);

const NAMED_KEYS: ReadonlyMap<string, string> = new Map([
  ["enter", "Enter"],
  ["return", "Enter"],
  ["esc", "Escape"],
  ["escape", "Escape"],
  ["tab", "Tab"],
  ["space", "Space"],
  ["backspace", "Backspace"],
  ["del", "Delete"],
  ["delete", "Delete"],
  ["ins", "Insert"],
  ["insert", "Insert"],
  ["home", "Home"],
  ["end", "End"],
  ["pgup", "PageUp"],
  ["pageup", "PageUp"],
  ["pgdn", "PageDown"],
  ["pagedown", "PageDown"],
  ["up", "ArrowUp"],
  ["arrowup", "ArrowUp"],
  ["down", "ArrowDown"],
  ["arrowdown", "ArrowDown"],
  ["left", "ArrowLeft"],
  ["arrowleft", "ArrowLeft"],
  ["right", "ArrowRight"],
  ["arrowright", "ArrowRight"],
]);

/** "ctrl+shift+s" → { key: "s", held: ["Control", "Shift"] }, in xa11y's key names. */
export function parseKeys(text: string): KeyCombo | string {
  const parts = text
    .split("+")
    .map((part) => part.trim())
    .filter((part, i, all) => part !== "" || (i === all.length - 1 && all.length > 1));
  // "ctrl++" means Control and the plus key.
  const names = parts.map((part) => (part === "" ? "+" : part));
  if (names.length === 0) return "keys is empty.";
  const held: Modifier[] = [];
  let key: string | null = null;
  for (const [i, name] of names.entries()) {
    const lower = name.toLowerCase();
    const modifier = MODIFIERS.get(lower);
    if (modifier && i < names.length - 1) {
      if (!held.includes(modifier)) held.push(modifier);
      continue;
    }
    if (i !== names.length - 1) return `"${name}" isn't a modifier; put the key last, as in ctrl+shift+s.`;
    if (modifier) key = modifier;
    else if (NAMED_KEYS.has(lower)) key = NAMED_KEYS.get(lower)!;
    else if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) key = lower.toUpperCase();
    else if ([...name].length === 1) key = name.length === 1 && /[A-Z]/.test(name) ? lower : name;
    else return `Unknown key "${name}". Use names such as enter, esc, tab, f5, pgdn, left, or one character.`;
  }
  return { key: key!, held };
}

type StepWire = z.infer<typeof StepWire>;

const ALLOWED: Readonly<Record<StepWire["do"], ReadonlyArray<keyof StepWire>>> = {
  click: ["target", "button", "count", "mods"],
  type: ["text", "target"],
  key: ["keys", "repeat"],
  scroll: ["target", "dx", "dy"],
  drag: ["target", "to"],
  invoke: ["target", "action"],
  set: ["target", "value"],
  wait: ["target", "gone", "timeout_ms"],
  open: ["uri"],
};

const need = <T>(value: T | undefined, what: string): T => (value === undefined ? fail(`${what} is required.`) : value);

const intIn = (value: number, min: number, max: number, what: string): number =>
  value < min || value > max ? fail(`${what} must be from ${min} to ${max}.`) : value;

const parseStep = (wire: StepWire, n: number): Step => {
  const at = `Step ${n} (${wire.do})`;
  for (const field of Object.keys(wire) as Array<keyof StepWire>) {
    if (field !== "do" && !ALLOWED[wire.do].includes(field)) fail(`${at}: ${field} doesn't apply to ${wire.do}.`);
  }
  const target = (what = "target") =>
    parseTarget(need(wire[what as "target"], `${at}: ${what}`), `${at} ${what}`);
  switch (wire.do) {
    case "click": {
      const mods = (wire.mods ?? []).map(
        (m) => MODIFIERS.get(m.toLowerCase()) ?? fail(`${at}: unknown modifier "${m}". Use ctrl, shift, alt or win.`),
      );
      return {
        do: "click",
        target: target(),
        button: wire.button ?? "left",
        count: intIn(wire.count ?? 1, 1, 3, `${at}: count`) as 1 | 2 | 3,
        mods: [...new Set(mods)],
      };
    }
    case "type": {
      const text = need(wire.text, `${at}: text`);
      if (text.length === 0) fail(`${at}: text is empty.`);
      if (text.length > LIMITS.textChars) fail(`${at}: text is longer than ${LIMITS.textChars} characters.`);
      return { do: "type", text, target: wire.target ? target() : null };
    }
    case "key": {
      const combo = parseKeys(need(wire.keys, `${at}: keys`));
      if (typeof combo === "string") return fail(`${at}: ${combo}`);
      return { do: "key", combo, repeat: intIn(wire.repeat ?? 1, 1, LIMITS.repeat, `${at}: repeat`) };
    }
    case "scroll": {
      const dx = intIn(wire.dx ?? 0, -LIMITS.scrollTicks, LIMITS.scrollTicks, `${at}: dx`);
      const dy = intIn(wire.dy ?? 0, -LIMITS.scrollTicks, LIMITS.scrollTicks, `${at}: dy`);
      if (dx === 0 && dy === 0) fail(`${at}: set dx or dy.`);
      return { do: "scroll", target: target(), dx, dy };
    }
    case "drag":
      return { do: "drag", from: target(), to: target("to") };
    case "invoke":
      return {
        do: "invoke",
        target: elementTarget(target(), `${at} target`),
        action: need(wire.action, `${at}: action`),
      };
    case "set":
      return { do: "set", target: elementTarget(target(), `${at} target`), value: need(wire.value, `${at}: value`) };
    case "wait": {
      if (!wire.target) {
        if (wire.gone !== undefined) fail(`${at}: gone needs a target.`);
        const ms = intIn(need(wire.timeout_ms, `${at}: timeout_ms (without a target)`), 1, LIMITS.sleepMs, `${at}: timeout_ms`);
        return { do: "wait", until: { kind: "time" }, ms };
      }
      const ms = intIn(wire.timeout_ms ?? LIMITS.waitDefaultMs, 1, LIMITS.waitMs, `${at}: timeout_ms`);
      return {
        do: "wait",
        until: { kind: wire.gone ? "gone" : "visible", target: elementTarget(target(), `${at} target`) },
        ms,
      };
    }
    case "open": {
      const uri = need(wire.uri, `${at}: uri`).trim();
      if (!/^[a-z][a-z0-9+.-]*:/i.test(uri) || /^-/.test(uri)) {
        fail(`${at}: uri must be a URI (ms-settings:…, https://…) or an absolute path (C:\\…).`);
      }
      return { do: "open", uri };
    }
  }
};

const zodMessage = (error: z.ZodError): string =>
  error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join("");
      return `${path ? path.slice(path.startsWith(".") ? 1 : 0) + ": " : ""}${issue.message}`;
    })
    .join("; ");

/** The whole call is checked before any effect. */
export function parseToolCall(tool: string, args: unknown): ParseResult {
  try {
    const raw = args ?? {};
    if (tool === "observe") {
      const parsed = ObserveWire.safeParse(raw);
      if (!parsed.success) return { ok: false, message: `Invalid observe arguments: ${zodMessage(parsed.error)}` };
      const w = parsed.data;
      const win = w.win === undefined ? null : parseWindow(w.win, "win");
      if (w.zoom && (w.zoom.width < 8 || w.zoom.height < 8 || w.zoom.x < 0 || w.zoom.y < 0)) {
        fail("zoom must be a rectangle of at least 8x8 pixels inside the latest image.");
      }
      return {
        ok: true,
        call: {
          tool: "observe",
          request: { win, scope: w.scope ?? "window", zoom: w.zoom ?? null, outline: w.outline ?? true },
        },
      };
    }
    if (tool === "act") {
      const parsed = ActWire.safeParse(raw);
      if (!parsed.success) return { ok: false, message: `Invalid act arguments: ${zodMessage(parsed.error)}` };
      const { steps, after, release } = parsed.data;
      if (steps.length < 1 || steps.length > LIMITS.steps) fail(`steps must hold 1 to ${LIMITS.steps} steps.`);
      return {
        ok: true,
        call: {
          tool: "act",
          request: { steps: steps.map((s, i) => parseStep(s, i + 1)), after: after ?? "full", release: release ?? false },
        },
      };
    }
    return { ok: false, message: `Unknown tool ${tool}.` };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, message: error.message };
    throw error;
  }
}

const targetsOf = (step: Step): ReadonlyArray<Target> => {
  switch (step.do) {
    case "drag":
      return [step.from, step.to];
    case "wait":
      return step.until.kind === "time" ? [] : [step.until.target];
    case "type":
      return step.target ? [step.target] : [];
    case "key":
    case "open":
      return [];
    default:
      return [step.target];
  }
};

export const refsOf = (call: ToolCall): ReadonlyArray<Ref> => {
  if (call.tool === "observe") return call.request.win?.kind === "ref" ? [call.request.win.ref] : [];
  return call.request.steps.flatMap(targetsOf).flatMap((target) => {
    if (target.kind === "ref") return [target.ref];
    if (target.kind === "sel" && target.win?.kind === "ref") return [target.win.ref];
    return [];
  });
};

/** Checks every point against the session's latest image, which a batch can't change. */
export const pointProblem = (
  request: ActRequest,
  image: { readonly id: string; readonly width: number; readonly height: number } | null,
): string | null => {
  for (const [i, step] of request.steps.entries()) {
    for (const target of targetsOf(step)) {
      if (target.kind !== "point") continue;
      const at = `Step ${i + 1} (${step.do})`;
      if (!image) return `${at}: there is no image to point into. Observe first.`;
      if (target.image !== null && target.image !== image.id) {
        return `${at}: ${target.image} isn't the latest image (${image.id}). Observe again.`;
      }
      if (target.at.x >= image.width || target.at.y >= image.height) {
        return `${at}: (${target.at.x}, ${target.at.y}) is outside image ${image.id} (${image.width}x${image.height}).`;
      }
    }
  }
  return null;
};

const quote = (text: string, max = 24): string => {
  const flat = text.replace(/\s+/g, " ");
  return JSON.stringify(flat.length > max ? flat.slice(0, max - 1) + "…" : flat);
};

export const windowText = (win: WindowName): string => (win.kind === "ref" ? win.ref : JSON.stringify(win.title));

export const describeTarget = (target: Target): string => {
  switch (target.kind) {
    case "ref":
      return target.ref;
    case "sel":
      return `${target.selector}${target.win ? ` in ${windowText(target.win)}` : ""}`;
    case "point":
      return `(${Math.round(target.at.x)}, ${Math.round(target.at.y)})`;
  }
};

const comboText = (combo: KeyCombo): string => [...combo.held, combo.key].join("+");

export const describeStep = (step: Step): string => {
  switch (step.do) {
    case "click":
      return `${step.count === 2 ? "double-" : step.count === 3 ? "triple-" : ""}${step.button === "left" ? "" : step.button + " "}click ${describeTarget(step.target)}`;
    case "type":
      return `type ${quote(step.text)}${step.target ? ` into ${describeTarget(step.target)}` : ""}`;
    case "key":
      return `key ${comboText(step.combo)}${step.repeat > 1 ? ` ×${step.repeat}` : ""}`;
    case "scroll":
      return `scroll ${describeTarget(step.target)}`;
    case "drag":
      return `drag ${describeTarget(step.from)} to ${describeTarget(step.to)}`;
    case "invoke":
      return `${step.action} ${describeTarget(step.target)}`;
    case "set":
      return `set ${describeTarget(step.target)} to ${quote(step.value)}`;
    case "wait":
      return step.until.kind === "time"
        ? `wait ${step.ms} ms`
        : `wait until ${describeTarget(step.until.target)} is ${step.until.kind === "gone" ? "gone" : "shown"}`;
    case "open":
      return `open ${quote(step.uri, 48)}`;
  }
};

export type McpContent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly data: string; readonly mimeType: "image/png" };

export interface ToolResult {
  readonly isError: boolean;
  readonly content: ReadonlyArray<McpContent>;
}

/**
 * What a failed step may have done. `none`: refused before any native call, so a retry is safe.
 * `maybe`: a native call failed or was cut short. `sent`: the native calls returned; that is all
 * the backend can know, not that the target received them.
 */
export type Delivery = "none" | "maybe" | "sent";

export interface StepFailure {
  readonly reason:
    | "not_found"
    | "stale"
    | "unknown_ref"
    | "not_supported"
    | "invalid"
    | "timeout"
    | "platform"
    | "off_limits"
    | "no_image"
    | "moved"
    | "stopped"
    | "no_indicator"
    | "not_holder"
    | "aborted";
  readonly message: string;
  readonly delivery: Delivery;
  readonly candidates: ReadonlyArray<string>;
}

export interface WindowLine {
  readonly ref: Ref;
  readonly title: string;
  readonly app: string;
  readonly active: boolean;
  readonly offLimits: boolean;
}

export interface Observation {
  readonly image: { readonly id: string; readonly png: Uint8Array; readonly width: number; readonly height: number; readonly of: string } | null;
  readonly outline: { readonly window: Ref; readonly title: string; readonly text: string; readonly truncated: boolean } | null;
  readonly windows: ReadonlyArray<WindowLine> | null;
  readonly note: string | null;
}

export interface BatchReport {
  readonly total: number;
  readonly done: number;
  readonly failed: { readonly step: number; readonly summary: string; readonly failure: StepFailure } | null;
}

export type Outcome =
  | { readonly kind: "refused"; readonly refusal: Refusal | { readonly kind: "invalid"; readonly message: string } | { readonly kind: "dropped" } }
  | { readonly kind: "observed"; readonly observation: Observation }
  | { readonly kind: "acted"; readonly report: BatchReport; readonly after: Observation | null; readonly released: boolean };

const DELIVERY_TEXT: Readonly<Record<Delivery, string>> = {
  none: "Nothing was sent, so a retry is safe.",
  maybe: "Input may have been sent. Look at the screen before retrying.",
  sent: "Its input was sent (the native calls returned). Look at the screen before retrying.",
};

const refusalText = (refusal: Refusal | { readonly kind: "invalid"; readonly message: string } | { readonly kind: "dropped" }): string => {
  switch (refusal.kind) {
    case "busy":
      return `Another agent is using the computer (${refusal.holder}, idle ${Math.round(refusal.idleMs / 1000)} s). Control frees up after 120 s idle. Don't loop: tell the user or try later.`;
    case "stopped":
      return "The user stopped computer use. Ask them to press Resume in T3 Code. Don't retry until they say so.";
    case "no-indicator":
      return "T3 Code isn't showing the computer-use indicator, so no input is allowed. Ask the user to check that T3 Code is open with the computer-use plugin on; don't retry in a loop.";
    case "invalid":
      return `${refusal.message} Nothing was sent.`;
    case "dropped":
      return "The user pressed Stop after this call was sent, so it was dropped and nothing was sent. Act again only if the user wants you to continue.";
  }
};

const windowLineText = (w: WindowLine): string =>
  `${w.ref} ${JSON.stringify(w.title)} (${w.app}${w.offLimits ? ", off limits" : w.active ? ", active" : ""})`;

const observationText = (o: Observation): string[] => {
  const lines: string[] = [];
  if (o.note) lines.push(o.note);
  if (o.windows) lines.push(`Windows: ${o.windows.map(windowLineText).join(" · ") || "none"}`);
  if (o.image) {
    lines.push(`Image ${o.image.id}: ${o.image.of}, ${o.image.width}x${o.image.height}. Points you send are pixels in this image.`);
  }
  if (o.outline) {
    lines.push(`Outline of ${o.outline.window} ${JSON.stringify(o.outline.title)}${o.outline.truncated ? " (truncated)" : ""}:`);
    lines.push(o.outline.text);
  }
  return lines;
};

const imageContent = (o: Observation | null): McpContent[] =>
  o?.image ? [{ type: "image", data: Buffer.from(o.image.png).toString("base64"), mimeType: "image/png" }] : [];

export function renderOutcome(outcome: Outcome): ToolResult {
  switch (outcome.kind) {
    case "refused":
      return { isError: true, content: [{ type: "text", text: refusalText(outcome.refusal) }] };
    case "observed":
      return {
        isError: false,
        content: [{ type: "text", text: observationText(outcome.observation).join("\n") }, ...imageContent(outcome.observation)],
      };
    case "acted": {
      const { report, after } = outcome;
      const lines: string[] = [];
      if (report.failed) {
        const { step, summary, failure } = report.failed;
        lines.push(`Stopped at step ${step}/${report.total} (${summary}): ${failure.message}`);
        if (failure.candidates.length) lines.push(`Near misses: ${failure.candidates.slice(0, 8).join(", ")}.`);
        lines.push(DELIVERY_TEXT[failure.delivery]);
      } else lines.push(`Done ${report.done}/${report.total}.${outcome.released ? " Control released." : ""}`);
      if (after) lines.push(...observationText(after));
      return {
        isError: report.failed !== null,
        content: [{ type: "text", text: lines.join("\n") }, ...imageContent(after)],
      };
    }
  }
}

export type Unreachable = "no-backend" | "backend-died" | "version-skew" | "unsupported-platform";

const UNREACHABLE_TEXT: Readonly<Record<Unreachable, string>> = {
  "no-backend":
    "Computer use needs T3 Code open with the computer-use plugin on. It isn't reachable (T3 Code closed, in safe mode, or the plugin's backend stopped). Ask the user; don't retry in a loop.",
  "backend-died":
    "The computer-use backend stopped during the call; some steps may have run. Observe before acting again.",
  "version-skew": "The computer-use plugin was updated. Restart this chat to pick up the new version.",
  "unsupported-platform": "Computer use works on Windows x64 only for now.",
};

export const renderUnreachable = (reason: Unreachable): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: UNREACHABLE_TEXT[reason] }],
});
