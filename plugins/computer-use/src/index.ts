// The page side: the "an agent is using your computer" pill with Stop and Resume, the same
// controls in the plugin's settings section, and pongs that tell the backend the pill can show.
// Page messages are cooperative, so this side only ever sends pong, stop and resume.
import { type BackendStatus, type PluginApi, definePlugin } from "@t3mode/plugin-sdk";

import { type DrivingView, type PageToBackend, parseBackendMessage, pillModel } from "./control.ts";

const CSS = `
[data-computer-use-pill] {
  position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
  display: flex; align-items: center; gap: 10px; max-width: min(720px, calc(100vw - 32px));
  padding: 6px 6px 6px 14px; border-radius: 999px; font: 500 13px/1.3 system-ui, sans-serif;
  color: #fff; background: #1d1d1f; box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
  border: 1px solid rgb(255 255 255 / 0.12);
}
[data-computer-use-pill][hidden] { display: none; }
[data-computer-use-pill][data-tone="stopped"] { background: #3d2a05; border-color: #f59e0b; }
[data-computer-use-pill] .cu-dot { width: 9px; height: 9px; flex: none; border-radius: 50%; background: #ef4444; animation: cu-pulse 1.2s ease-in-out infinite; }
[data-computer-use-pill][data-tone="stopped"] .cu-dot { background: #f59e0b; animation: none; }
[data-computer-use-pill] .cu-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-computer-use-pill] .cu-detail { opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-computer-use-pill] button {
  flex: none; padding: 4px 14px; border-radius: 999px; border: 0; cursor: pointer;
  font: 600 13px/1.3 system-ui, sans-serif; color: #fff; background: #dc2626;
}
[data-computer-use-pill][data-tone="stopped"] button { background: #d97706; }
[data-computer-use-pill] button:hover { filter: brightness(1.1); }
@keyframes cu-pulse { 50% { opacity: 0.35; } }
`;

const span = (className: string): HTMLSpanElement => {
  const element = document.createElement("span");
  element.className = className;
  return element;
};

export default definePlugin({
  options: {},
  start(api: PluginApi) {
    const backend = api.backend;
    if (!backend) {
      api.report({ state: "waiting", detail: "Needs a t3mode build with plugin backends (plugin SDK 1.4)." });
      return;
    }
    if (!/Windows/.test(navigator.userAgent)) {
      api.report({ state: "waiting", detail: "Computer use runs on Windows only for now." });
      return;
    }
    const instance = crypto.randomUUID();
    let view: DrivingView | null = null;
    let status: BackendStatus | null = null;
    let next: PageToBackend | null = null;
    const send = () => {
      if (next) void backend.send(next);
    };

    api.css(CSS);
    const pill = api.element("div");
    pill.setAttribute("data-computer-use-pill", "");
    pill.setAttribute("role", "status");
    const dot = span("cu-dot");
    const text = span("cu-text");
    const detail = span("cu-detail");
    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", send);
    pill.append(dot, text, detail, button);
    document.body.append(pill);

    const stateText = document.createElement("span");
    const settingsButton = api.ui.button({ text: "Stop", variant: "outline", onClick: send });
    const group = api.ui.group(
      api.ui.row({ title: "Agents using this computer", description: stateText, control: settingsButton }),
    );
    api.settingsPanel("Computer use", (host) => host.append(group));

    const draw = () => {
      const model = pillModel(view);
      pill.hidden = !model.visible;
      pill.dataset.tone = model.tone;
      text.textContent = model.text;
      detail.textContent = model.detail ?? "";
      detail.hidden = !model.detail;
      next = model.button?.send ?? (view?.mode === "idle" ? { t: "stop" } : null);
      button.textContent = model.button?.text ?? "";
      button.hidden = !model.button;

      const running = status?.state === "running";
      stateText.textContent = !running
        ? "The backend isn't running, so agents can't use this computer."
        : view?.mode === "driving"
          ? model.text + (model.detail ? `: ${model.detail}` : "")
          : view?.mode === "stopped"
            ? model.text
            : "Agents may use this computer while T3 Code is open. Stop blocks them until you resume.";
      settingsButton.textContent = view?.mode === "stopped" ? "Resume" : "Stop";
      settingsButton.disabled = !running;
      api.report(
        !running
          ? { state: "waiting", detail: "Backend not running." }
          : view?.mode === "stopped"
            ? { state: "active", detail: "Stopped. Agents can't act until you resume." }
            : { state: "active", detail: view?.mode === "driving" ? `${view.label} is driving.` : "Ready." },
      );
    };

    backend.onMessage((data) => {
      const message = parseBackendMessage(data);
      if (!message) return;
      // Answered here, never from a timer: Chromium throttles timers in a hidden window, and an
      // agent driving a window over T3 Code is the normal case.
      if (message.t === "ping") {
        void backend.send({ t: "pong", n: message.n, instance });
        return;
      }
      const wasDriving = view?.mode === "driving";
      view = message.view;
      if (!wasDriving && view.mode === "driving") api.toast(`${view.label} is using your computer. Stop is at the top of the window.`);
      draw();
    });
    backend.onStatus((next) => {
      status = next;
      if (next?.state === "running") void backend.send({ t: "pong", n: 0, instance });
      else view = null;
      draw();
    });
    draw();
  },
});
