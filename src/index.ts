// Closes the thread details card when a thread opens, by pressing T3 Code's own toggle.
// T3 Code remembers the card's state per thread, so reopening it with the toggle sticks:
// in "first visit" mode t3mode never closes a thread's card twice.
import { definePlugin } from "@t3mode/plugin-sdk";

// Checked against T3 Code 0.1.10-nightly.20261114.4669 and upstream main.
const selectors = {
  /** The toggle in the chat header. Upstream main wraps it in [data-thread-panel-toggle]. */
  threadDetailsToggle: [
    "[data-thread-panel-toggle] button",
    'button[aria-label="Toggle thread details panel"]',
  ],
  /** The open card when it sits beside the chat (wide windows). */
  threadDetailsInline: '[data-thread-details-panel="inline"]',
  /** The card carries the thread it belongs to as `details:<environmentId>:<threadId>`. */
  threadDetailsFocusKeyAttribute: "data-workspace-focus-key",
} as const;

const SEEN_LIMIT = 5000;

export default definePlugin({
  options: {
    when: {
      type: "select",
      label: "When to close it",
      description:
        "The first time each thread opens, so a card you reopen stays open; or every time a thread opens.",
      choices: [
        { value: "first-visit", label: "First visit only" },
        { value: "every-visit", label: "Every visit" },
      ],
      default: "first-visit",
    },
  },
  start(api) {
    const seen = new Set(api.storage.get<ReadonlyArray<string>>("closed", []));
    let route: string | null = null;
    let handled: string | null = null;
    let closedCount = 0;

    const remember = (key: string) => {
      seen.delete(key);
      seen.add(key);
      api.storage.set("closed", [...seen].slice(-SEEN_LIMIT));
    };

    const check = () => {
      if (location.hash !== route) {
        route = location.hash;
        handled = null;
      }
      const panel = document.querySelector(selectors.threadDetailsInline);
      if (!panel) return;
      // The card names its thread. New threads (drafts) get a thread id before their route does,
      // so the card's key is the one T3 Code uses everywhere, and the route is only a cross-check.
      const owner = panel.getAttribute(selectors.threadDetailsFocusKeyAttribute);
      const key = owner?.startsWith("details:") ? owner.slice("details:".length) : null;
      if (key === null || key === handled) return;
      // Right after a route change the previous thread's card can stay on screen for a frame.
      const routeKey = api.currentThreadKey(route);
      if (routeKey !== null && !routeKey.startsWith("draft:") && routeKey !== key) return;

      handled = key;
      if (api.options.when === "first-visit" && seen.has(key)) return;
      const toggle = api.queryFirst<HTMLButtonElement>(selectors.threadDetailsToggle);
      if (!toggle) {
        api.report({ state: "waiting", detail: "T3 Code's thread details button was not found" });
        return;
      }
      if (toggle.getAttribute("aria-pressed") === "false") return;
      remember(key);
      toggle.click();
      closedCount++;
      api.report({
        state: "active",
        detail: `closed the card on ${closedCount} thread(s) this session`,
      });
    };

    api.report({ state: "active", detail: "watching for threads" });
    api.observe(check);
  },
});
