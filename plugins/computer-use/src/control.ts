export type SessionId = number & { readonly __session: unique symbol };
export type AgentLabel = string & { readonly __label: unique symbol };

/**
 * `generation` counts Stops. A batch records it when the backend accepts the call, and its gate
 * fails once it differs, so work accepted before a Stop never runs after a Resume.
 */
export type Control = { readonly generation: number } & (
  | { readonly kind: "idle" }
  | {
      readonly kind: "driving";
      readonly holder: SessionId;
      readonly label: AgentLabel;
      readonly since: number;
      readonly lastActivity: number;
      readonly step: string | null;
    }
  | { readonly kind: "stopped"; readonly at: number }
);

export const LEASE_IDLE_MS = 120_000;

export type ControlEvent =
  | { readonly type: "acquire"; readonly session: SessionId; readonly label: AgentLabel; readonly now: number }
  | { readonly type: "step"; readonly session: SessionId; readonly step: string; readonly now: number }
  | { readonly type: "release"; readonly session: SessionId }
  | { readonly type: "disconnect"; readonly session: SessionId }
  | { readonly type: "tick"; readonly now: number }
  | { readonly type: "stop"; readonly now: number }
  | { readonly type: "resume" };

export type Refusal =
  | { readonly kind: "busy"; readonly holder: AgentLabel; readonly idleMs: number }
  | { readonly kind: "stopped" }
  | { readonly kind: "no-indicator" };

export type ControlEffect =
  | { readonly type: "persist-stopped"; readonly at: number }
  | { readonly type: "clear-stopped" }
  | { readonly type: "abort-running" }
  | { readonly type: "broadcast" };

export interface Transition {
  readonly control: Control;
  readonly effects: ReadonlyArray<ControlEffect>;
  readonly refusal?: Refusal;
}

const same = (control: Control): Transition => ({ control, effects: [] });
const broadcast = (control: Control): Transition => ({ control, effects: [{ type: "broadcast" }] });
const idle = (generation: number): Control => ({ kind: "idle", generation });

export function transition(control: Control, event: ControlEvent): Transition {
  const { generation } = control;
  switch (event.type) {
    case "acquire": {
      if (control.kind === "stopped") return { ...same(control), refusal: { kind: "stopped" } };
      if (control.kind === "driving") {
        const idleMs = event.now - control.lastActivity;
        if (control.holder !== event.session && idleMs <= LEASE_IDLE_MS) {
          return { ...same(control), refusal: { kind: "busy", holder: control.label, idleMs } };
        }
        if (control.holder === event.session) {
          return broadcast({ ...control, lastActivity: event.now });
        }
      }
      return broadcast({
        kind: "driving",
        generation,
        holder: event.session,
        label: event.label,
        since: event.now,
        lastActivity: event.now,
        step: null,
      });
    }
    case "step":
      return control.kind === "driving" && control.holder === event.session
        ? broadcast({ ...control, step: event.step, lastActivity: event.now })
        : same(control);
    case "release":
    case "disconnect":
      return control.kind === "driving" && control.holder === event.session
        ? broadcast(idle(generation))
        : same(control);
    case "tick":
      return control.kind === "driving" && event.now - control.lastActivity > LEASE_IDLE_MS
        ? broadcast(idle(generation))
        : same(control);
    case "stop":
      if (control.kind === "stopped") return same(control);
      return {
        control: { kind: "stopped", generation: generation + 1, at: event.now },
        effects: [{ type: "persist-stopped", at: event.now }, { type: "abort-running" }, { type: "broadcast" }],
      };
    case "resume":
      return control.kind === "stopped"
        ? { control: idle(generation), effects: [{ type: "clear-stopped" }, { type: "broadcast" }] }
        : same(control);
  }
}

/**
 * The input gate, read immediately before every native input call. It decides from live state at
 * the moment of input, never from a snapshot taken when the batch was queued.
 */
export const gateOpen = (
  control: Control,
  indicator: { readonly live: () => boolean } | null,
  session: SessionId,
  generation: number,
): boolean =>
  control.kind === "driving" &&
  control.holder === session &&
  control.generation === generation &&
  indicator?.live() === true;

export const initialControl = (stopped: { readonly at: number } | null): Control =>
  stopped ? { kind: "stopped", generation: 0, at: stopped.at } : idle(0);

export const parseStoppedFile = (text: string | null): { readonly at: number } | null => {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && typeof (value as { at?: unknown }).at === "number") {
      return { at: (value as { at: number }).at };
    }
  } catch {}
  // A stopped.json we can't read still means the user stopped: stay on the safe side.
  return { at: 0 };
};

// The page channel is cooperative, so it carries status and Stop, never an action.
export type PageToBackend =
  | { readonly t: "stop" }
  | { readonly t: "resume" };

export type DrivingView =
  | { readonly mode: "idle" }
  | { readonly mode: "driving"; readonly label: string; readonly step: string | null; readonly since: number }
  | { readonly mode: "stopped"; readonly since: number };

export type BackendToPage = { readonly t: "state"; readonly view: DrivingView };

export const viewOf = (control: Control): DrivingView => {
  switch (control.kind) {
    case "idle":
      return { mode: "idle" };
    case "driving":
      return { mode: "driving", label: control.label, step: control.step, since: control.since };
    case "stopped":
      return { mode: "stopped", since: control.at };
  }
};

export const parsePageMessage = (data: unknown): PageToBackend | null => {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.t === "stop" || m.t === "resume") return { t: m.t };
  return null;
};

export const parseBackendMessage = (data: unknown): BackendToPage | null => {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.t !== "state" || typeof m.view !== "object" || m.view === null) return null;
  const v = m.view as Record<string, unknown>;
  if (v.mode === "idle") return { t: "state", view: { mode: "idle" } };
  if (v.mode === "stopped" && typeof v.since === "number") {
    return { t: "state", view: { mode: "stopped", since: v.since } };
  }
  if (v.mode === "driving" && typeof v.label === "string" && typeof v.since === "number") {
    const step = typeof v.step === "string" ? v.step : null;
    return { t: "state", view: { mode: "driving", label: v.label, step, since: v.since } };
  }
  return null;
};
