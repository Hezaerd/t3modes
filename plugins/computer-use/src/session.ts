import { basename } from "node:path";

import {
  type BatchContext,
  type Desktop,
  type ElementHandle,
  type Gate,
  type ImageFrame,
  type Timing,
  type WindowFacts,
  StepError,
  TIMING,
  failure,
  observe,
  runBatch,
  settleAfter,
} from "./batch.ts";
import {
  type AgentLabel,
  type BackendToPage,
  type Control,
  type ControlEvent,
  type PageToBackend,
  type Presence,
  type Refusal,
  type SessionId,
  gateOpen,
  present,
  transition,
  viewOf,
} from "./control.ts";
import type { ClientInfo } from "./link.ts";
import { RefTable } from "./outline.ts";
import { type ActRequest, type Outcome, type ToolResult, parseToolCall, pointProblem, refsOf, renderOutcome } from "./tools.ts";

export const PONG_WAIT_MS = 1500;

export interface EngineIo {
  readonly desktop: Desktop;
  readonly now: () => number;
  readonly sendPage: (message: BackendToPage) => void;
  /** Must finish writing before it returns: Stop is persisted before anyone hears of it. */
  readonly persistStopped: (at: number) => void;
  readonly clearStopped: () => void;
  readonly log: (message: string) => void;
  readonly timing?: Timing;
}

const AGENT_NAMES: ReadonlyMap<string, string> = new Map([
  ["claude-code", "Claude"],
  ["codex-mcp-client", "Codex"],
]);

export const labelFor = (client: ClientInfo): AgentLabel => {
  const who = AGENT_NAMES.get(client.name) ?? (client.name || "An agent");
  const where = client.cwd ? basename(client.cwd) : "";
  return (where ? `${who} · ${where}` : who) as AgentLabel;
};

export class Engine {
  private control: Control;
  private presence: Presence = { instance: null, lastPong: 0 };
  private queue: Promise<unknown> = Promise.resolve();
  private running: { readonly session: SessionId; readonly abort: AbortController } | null = null;
  private pings = 0;
  private readonly waiters = new Set<{ readonly n: number; readonly resolve: () => void }>();
  private nextSession = 1;

  constructor(
    private readonly io: EngineIo,
    initial: Control,
  ) {
    this.control = initial;
  }

  get state(): Control {
    return this.control;
  }

  dispatch(event: ControlEvent): Refusal | undefined {
    const t = transition(this.control, this.presence, event);
    this.control = t.control;
    for (const effect of t.effects) {
      switch (effect.type) {
        case "persist-stopped":
          this.io.persistStopped(effect.at);
          break;
        case "clear-stopped":
          this.io.clearStopped();
          break;
        case "abort-running":
          this.running?.abort.abort(new Error("stopped"));
          break;
        case "broadcast":
          this.io.sendPage({ t: "state", view: viewOf(this.control) });
          break;
      }
    }
    return t.refusal;
  }

  page(message: PageToBackend): void {
    switch (message.t) {
      case "pong": {
        const fresh = message.instance !== this.presence.instance;
        this.presence = { instance: message.instance, lastPong: this.io.now() };
        if (fresh) this.io.sendPage({ t: "state", view: viewOf(this.control) });
        for (const waiter of this.waiters) {
          if (waiter.n <= message.n) {
            this.waiters.delete(waiter);
            waiter.resolve();
          }
        }
        return;
      }
      case "stop":
        this.io.log("Stop pressed");
        this.dispatch({ type: "stop", now: this.io.now() });
        return;
      case "resume":
        this.io.log("Resume pressed");
        this.dispatch({ type: "resume" });
        return;
    }
  }

  tick(): void {
    this.dispatch({ type: "tick", now: this.io.now() });
    if (!this.running) return;
    this.io.sendPage({ t: "ping", n: ++this.pings });
    if (!present(this.presence, this.io.now())) this.running.abort.abort(new Error("no indicator"));
  }

  /** Pings the page and waits for a pong sent after it. */
  async confirmPresence(signal: AbortSignal): Promise<boolean> {
    const n = ++this.pings;
    const answered = new Promise<boolean>((resolve) => {
      const finish = (present: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        this.waiters.delete(waiter);
        resolve(present);
      };
      const waiter = { n, resolve: () => finish(true) };
      const onAbort = () => finish(false);
      const timer = setTimeout(() => finish(false), PONG_WAIT_MS);
      this.waiters.add(waiter);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    this.io.sendPage({ t: "ping", n });
    return answered;
  }

  enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Marks a batch as running so Stop and presence lapses can cut its waits short. */
  async whileRunning<T>(session: SessionId, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const abort = new AbortController();
    this.running = { session, abort };
    try {
      return await work(abort.signal);
    } finally {
      this.running = null;
    }
  }

  abortSession(session: SessionId): void {
    if (this.running?.session === session) this.running.abort.abort(new Error("disconnected"));
  }

  gateFor(session: SessionId, generation: number, signal: AbortSignal): Gate {
    return {
      signal,
      check: () => {
        const control = this.control;
        if (gateOpen(control, this.presence, session, generation, this.io.now())) {
          if (signal.aborted) throw failure("aborted", "The call was cancelled.");
          return;
        }
        if (control.kind === "stopped" || control.generation !== generation) {
          throw failure("stopped", "The user pressed Stop. Don't retry until they resume.");
        }
        if (!present(this.presence, this.io.now())) {
          throw failure("no_indicator", "T3 Code stopped answering, so input was halted.");
        }
        throw failure("not_holder", "This chat no longer holds control of the computer.");
      },
    };
  }

  openSession(client: ClientInfo): Session {
    return new Session((this.nextSession++) as SessionId, labelFor(client), this, this.io);
  }
}

export class Session {
  private readonly refs: RefTable<ElementHandle>;
  private latestImage: ImageFrame | null = null;
  private currentWindow: WindowFacts | null = null;
  private images = 0;
  private readonly calls = new Set<AbortController>();
  private closed = false;

  constructor(
    readonly id: SessionId,
    readonly label: AgentLabel,
    private readonly engine: Engine,
    private readonly io: EngineIo,
  ) {
    this.refs = new RefTable((a, b) => io.desktop.same(a, b));
  }

  private get timing(): Timing {
    return this.io.timing ?? TIMING;
  }

  private observeContext() {
    return {
      desktop: this.io.desktop,
      refs: this.refs,
      currentWindow: this.currentWindow,
      latestImage: this.latestImage,
      nextImageId: () => `i${++this.images}`,
    };
  }

  /** Never throws: every failure becomes a rendered result. */
  async call(tool: string, args: unknown, cancel: AbortSignal): Promise<ToolResult> {
    const parsed = parseToolCall(tool, args);
    if (!parsed.ok) return renderOutcome({ kind: "refused", refusal: { kind: "invalid", message: parsed.message } });
    const unknown = refsOf(parsed.call).filter((ref) => !this.refs.has(ref));
    if (unknown.length) {
      const message = `Unknown ref ${unknown.join(", ")}. Refs come from this chat's outlines; observe again.`;
      return renderOutcome({ kind: "refused", refusal: { kind: "invalid", message } });
    }
    const call = parsed.call;
    const generation = this.engine.state.generation;
    const controller = new AbortController();
    const onCancel = () => controller.abort(new Error("cancelled"));
    cancel.addEventListener("abort", onCancel);
    this.calls.add(controller);
    try {
      const outcome = await this.engine.enqueue(async (): Promise<Outcome> => {
        if (this.closed || controller.signal.aborted) {
          return { kind: "refused", refusal: { kind: "invalid", message: "The call was cancelled." } };
        }
        if (call.tool === "observe") {
          const observed = await observe(call.request, this.observeContext(), { windows: true, image: true });
          if (observed.frame) this.latestImage = observed.frame;
          if (observed.window) this.currentWindow = observed.window;
          return { kind: "observed", observation: observed.observation };
        }
        const problem = pointProblem(call.request, this.latestImage);
        if (problem) return { kind: "refused", refusal: { kind: "invalid", message: problem } };
        return this.act(call.request, generation, controller.signal);
      });
      return renderOutcome(outcome);
    } catch (error) {
      const message = error instanceof StepError ? error.failure.message : error instanceof Error ? error.message : String(error);
      this.io.log(`call ${tool} failed: ${message}`);
      return { isError: true, content: [{ type: "text", text: `Computer use failed: ${message}` }] };
    } finally {
      cancel.removeEventListener("abort", onCancel);
      this.calls.delete(controller);
    }
  }

  private async act(
    request: ActRequest,
    generation: number,
    cancel: AbortSignal,
  ): Promise<Outcome> {
    if (this.engine.state.generation !== generation) return { kind: "refused", refusal: { kind: "dropped" } };
    if (!(await this.engine.confirmPresence(cancel))) return { kind: "refused", refusal: { kind: "no-indicator" } };
    const refusal = this.engine.dispatch({ type: "acquire", session: this.id, label: this.label, now: this.io.now() });
    if (refusal) return { kind: "refused", refusal };
    if (this.engine.state.kind !== "driving" || this.engine.state.generation !== generation) {
      return { kind: "refused", refusal: { kind: "dropped" } };
    }
    return this.engine.whileRunning(this.id, async (stopSignal) => {
      const signal = AbortSignal.any([stopSignal, cancel]);
      const ctx: BatchContext = {
        desktop: this.io.desktop,
        gate: this.engine.gateFor(this.id, generation, signal),
        refs: this.refs,
        latestImage: this.latestImage,
        currentWindow: this.currentWindow,
        onStep: (step) => this.engine.dispatch({ type: "step", session: this.id, step, now: this.io.now() }),
        now: this.io.now,
        timing: this.timing,
      };
      const result = await runBatch(request.steps, ctx);
      this.currentWindow = result.lastWindow;
      let after = null;
      if (request.after !== "none") {
        try {
          await settleAfter(this.currentWindow, ctx, signal);
        } catch {}
        const observed = await observe(
          { win: null, scope: "window", zoom: null, outline: true },
          this.observeContext(),
          { windows: result.foregroundChanged, image: request.after === "full" },
        );
        if (observed.frame) this.latestImage = observed.frame;
        if (observed.window) this.currentWindow = observed.window;
        after = observed.observation;
      }
      if (request.release) this.engine.dispatch({ type: "release", session: this.id });
      return { kind: "acted", report: result.report, after, released: request.release };
    });
  }

  close(): void {
    this.closed = true;
    for (const call of this.calls) call.abort(new Error("disconnected"));
    this.engine.abortSession(this.id);
    this.engine.dispatch({ type: "disconnect", session: this.id });
  }
}
