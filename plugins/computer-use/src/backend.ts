// The plugin's backend: the one process that loads xa11y and sends input. It serves tool servers
// over a named pipe derived from its data folder, and talks status and Stop with the page.
import { createServer } from "node:net";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineBackend } from "@t3mode/plugin-sdk";

import { initialControl, parsePageMessage, parseStoppedFile, viewOf } from "./control.ts";
import { loadDesktop, releaseJournaled } from "./desktop.ts";
import { pipeName } from "./link.ts";
import { serveConnection } from "./serve.ts";
import { Engine } from "./session.ts";

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

export default defineBackend({
  async start(api) {
    if (process.platform !== "win32" || process.arch !== "x64") {
      api.log("warn", "computer-use runs on Windows x64 only. It does nothing here.");
      // Staying up keeps the plugin card calm; exiting would count as a crash.
      setInterval(() => {}, 1 << 30);
      return;
    }
    const stoppedPath = join(api.dataDir, "stopped.json");
    const heldPath = join(api.dataDir, "held.json");
    const released = await releaseJournaled(heldPath);
    if (released) api.log("warn", `Released input a previous run held: ${JSON.stringify(released)}`);

    const desktop = loadDesktop(heldPath, (message) => api.log("info", message));
    const engine = new Engine(
      {
        desktop,
        now: Date.now,
        sendPage: (message) => api.send(message),
        persistStopped: (at) => writeFileSync(stoppedPath, JSON.stringify({ at })),
        clearStopped: () => rmSync(stoppedPath, { force: true }),
        log: (message) => api.log("info", message),
      },
      initialControl(parseStoppedFile(readText(stoppedPath))),
    );
    api.onMessage((data) => {
      const message = parsePageMessage(data);
      if (message) engine.page(message);
    });
    setInterval(() => engine.tick(), 1000);

    const pipe = pipeName(api.dataDir, process.platform);
    const server = createServer((socket) =>
      serveConnection(socket, (client) => engine.openSession(client), (level, message) => api.log(level, message)),
    );
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(pipe, () => resolve());
    });
    api.log("info", `Listening on ${pipe}; ${engine.state.kind}`);
    api.send({ t: "state", view: viewOf(engine.state) });
  },
});
