import { type BackendStatus, type PluginApi, definePlugin } from "@t3mode/plugin-sdk";

import { type DrivingView, type PageToBackend, parseBackendMessage } from "./control.ts";

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
    let view: DrivingView | null = null;
    let status: BackendStatus | null = null;
    let next: PageToBackend | null = null;
    const send = () => {
      if (next) void backend.send(next);
    };

    const stateText = document.createElement("span");
    const settingsButton = api.ui.button({ text: "Stop", variant: "outline", onClick: send });
    const group = api.ui.group(
      api.ui.row({ title: "Agents using this computer", description: stateText, control: settingsButton }),
    );
    api.settingsPanel("Computer use", (host) => host.append(group));

    const draw = () => {
      next = view?.mode === "stopped" ? { t: "resume" } : { t: "stop" };
      const running = status?.state === "running";
      stateText.textContent = !running
        ? "The backend isn't running, so agents can't use this computer."
        : view?.mode === "driving"
          ? `${view.label} is using your computer${view.step ? `: ${view.step}` : ""}`
          : view?.mode === "stopped"
            ? "Computer use stopped. Agents can't act until you resume."
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
      const wasDriving = view?.mode === "driving";
      view = message.view;
      if (!wasDriving && view.mode === "driving") api.toast(`${view.label} is using your computer. Stop is at the top of your screen.`);
      draw();
    });
    backend.onStatus((current) => {
      status = current;
      if (current?.state !== "running") view = null;
      draw();
    });
    draw();
  },
});
