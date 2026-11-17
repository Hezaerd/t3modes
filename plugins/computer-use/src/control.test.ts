import { describe, expect, it } from "vite-plus/test";

import {
  type AgentLabel,
  type Control,
  type Presence,
  type SessionId,
  LEASE_IDLE_MS,
  PRESENCE_TTL_MS,
  gateOpen,
  initialControl,
  parsePageMessage,
  parseStoppedFile,
  pillModel,
  transition,
  viewOf,
} from "./control.ts";

const a = 1 as SessionId;
const b = 2 as SessionId;
const claude = "Claude · webapp" as AgentLabel;
const codex = "Codex · api" as AgentLabel;
const T = 1_000_000;
const here: Presence = { instance: "p1", lastPong: T };
const idle: Control = { kind: "idle", generation: 0 };

const acquire = (control: Control, session: SessionId, now = T, presence = here) =>
  transition(control, presence, { type: "acquire", session, label: session === a ? claude : codex, now });

describe("transition", () => {
  it("grants control to the first agent and broadcasts", () => {
    const t = acquire(idle, a);
    expect(t.refusal).toBeUndefined();
    expect(t.control).toMatchObject({ kind: "driving", holder: a, label: claude, lastActivity: T });
    expect(t.effects).toEqual([{ type: "broadcast" }]);
  });

  it("refuses without a page answering pings", () => {
    const t = acquire(idle, a, T + PRESENCE_TTL_MS + 1);
    expect(t.refusal).toEqual({ kind: "no-indicator" });
    expect(t.control).toBe(idle);
    expect(acquire(idle, a, T, { instance: null, lastPong: 0 }).refusal).toEqual({ kind: "no-indicator" });
  });

  it("keeps a second agent out while the lease is fresh, then lets it in", () => {
    const driving = acquire(idle, a).control;
    const busy = acquire(driving, b, T + 3_000, { instance: "p1", lastPong: T + 3_000 });
    expect(busy.refusal).toEqual({ kind: "busy", holder: claude, idleMs: 3_000 });
    const later = T + LEASE_IDLE_MS + 1;
    const taken = acquire(driving, b, later, { instance: "p1", lastPong: later });
    expect(taken.control).toMatchObject({ kind: "driving", holder: b });
  });

  it("touches the lease when the holder acquires again or runs a step", () => {
    const driving = acquire(idle, a).control;
    expect(acquire(driving, a, T + 50).control).toMatchObject({ lastActivity: T + 50, since: T });
    const stepped = transition(driving, here, { type: "step", session: a, step: "type 'hi'", now: T + 70 });
    expect(stepped.control).toMatchObject({ step: "type 'hi'", lastActivity: T + 70 });
    expect(transition(driving, here, { type: "step", session: b, step: "x", now: T }).control).toBe(driving);
  });

  it("frees control on release or disconnect by the holder only", () => {
    const driving = acquire(idle, a).control;
    expect(transition(driving, here, { type: "release", session: b }).control).toBe(driving);
    expect(transition(driving, here, { type: "release", session: a }).control.kind).toBe("idle");
    expect(transition(driving, here, { type: "disconnect", session: a }).control.kind).toBe("idle");
  });

  it("expires an idle lease on tick", () => {
    const driving = acquire(idle, a).control;
    expect(transition(driving, here, { type: "tick", now: T + LEASE_IDLE_MS }).control).toBe(driving);
    expect(transition(driving, here, { type: "tick", now: T + LEASE_IDLE_MS + 1 }).control.kind).toBe("idle");
  });

  it("stops from any state, persists before broadcasting, and bumps the generation once", () => {
    const driving = acquire(idle, a).control;
    const stopped = transition(driving, here, { type: "stop", now: T + 5 });
    expect(stopped.control).toEqual({ kind: "stopped", generation: 1, at: T + 5 });
    expect(stopped.effects.map((e) => e.type)).toEqual(["persist-stopped", "abort-running", "broadcast"]);
    const again = transition(stopped.control, here, { type: "stop", now: T + 9 });
    expect(again.control).toBe(stopped.control);
    expect(again.effects).toEqual([]);
    expect(acquire(stopped.control, a).refusal).toEqual({ kind: "stopped" });
  });

  it("resumes to idle, keeping the generation, and ignores resume when not stopped", () => {
    const stopped = transition(idle, here, { type: "stop", now: T }).control;
    const resumed = transition(stopped, here, { type: "resume" });
    expect(resumed.control).toEqual({ kind: "idle", generation: 1 });
    expect(resumed.effects.map((e) => e.type)).toEqual(["clear-stopped", "broadcast"]);
    expect(transition(idle, here, { type: "resume" }).control).toBe(idle);
  });
});

describe("gateOpen", () => {
  const driving = acquire(idle, a).control;

  it("opens only for the holder, at the generation it was accepted in, while the page answers", () => {
    expect(gateOpen(driving, here, a, 0, T)).toBe(true);
    expect(gateOpen(driving, here, b, 0, T)).toBe(false);
    expect(gateOpen(driving, here, a, 1, T)).toBe(false);
    expect(gateOpen(driving, here, a, 0, T + PRESENCE_TTL_MS + 1)).toBe(false);
    expect(gateOpen(idle, here, a, 0, T)).toBe(false);
  });

  it("stays shut after Stop and Resume for a batch accepted before the Stop", () => {
    const stopped = transition(driving, here, { type: "stop", now: T }).control;
    expect(gateOpen(stopped, here, a, 0, T)).toBe(false);
    const resumed = transition(stopped, here, { type: "resume" }).control;
    const again = acquire(resumed, a).control;
    expect(gateOpen(again, here, a, 0, T)).toBe(false);
    expect(gateOpen(again, here, a, 1, T)).toBe(true);
  });
});

describe("start state and messages", () => {
  it("starts stopped whenever stopped.json exists, even unreadable", () => {
    expect(initialControl(parseStoppedFile(null))).toEqual({ kind: "idle", generation: 0 });
    expect(initialControl(parseStoppedFile('{"at":42}'))).toEqual({ kind: "stopped", generation: 0, at: 42 });
    expect(initialControl(parseStoppedFile("garbage"))).toMatchObject({ kind: "stopped" });
  });

  it("parses only status and stop messages from the page", () => {
    expect(parsePageMessage({ t: "stop" })).toEqual({ t: "stop" });
    expect(parsePageMessage({ t: "resume", extra: 1 })).toEqual({ t: "resume" });
    expect(parsePageMessage({ t: "pong", n: 3, instance: "x" })).toEqual({ t: "pong", n: 3, instance: "x" });
    expect(parsePageMessage({ t: "act", steps: [] })).toBeNull();
    expect(parsePageMessage({ t: "pong", n: "3", instance: "x" })).toBeNull();
    expect(parsePageMessage("stop")).toBeNull();
  });

  it("shows the pill's state", () => {
    const driving = transition(acquire(idle, a).control, here, { type: "step", session: a, step: "click", now: T });
    expect(viewOf(driving.control)).toEqual({ mode: "driving", label: claude, step: "click", since: T });
    expect(viewOf({ kind: "stopped", generation: 2, at: 7 })).toEqual({ mode: "stopped", since: 7 });
    expect(viewOf(idle)).toEqual({ mode: "idle" });
  });
});

describe("pillModel", () => {
  it("shows who drives with Stop, and Resume once stopped", () => {
    expect(pillModel({ mode: "driving", label: "Claude · webapp", step: "click e7", since: 1 })).toEqual({
      visible: true,
      tone: "driving",
      text: "Claude · webapp is using your computer",
      detail: "click e7",
      button: { text: "Stop", send: { t: "stop" } },
    });
    expect(pillModel({ mode: "stopped", since: 1 })).toMatchObject({ visible: true, button: { text: "Resume", send: { t: "resume" } } });
  });

  it("draws nothing when idle or with no backend", () => {
    expect(pillModel({ mode: "idle" }).visible).toBe(false);
    expect(pillModel(null).visible).toBe(false);
  });
});
