// A "Disk usage" section in the thread details card, drawn with T3 Code's own usage-limit rows,
// and a "Disk usage" item in the card's "Show in thread details" menu to hide it.
import { type PluginApi, definePlugin } from "@t3mode/plugin-sdk";

import { type Disk, type DiskRow, diskRows } from "./disks.ts";

// Captured from T3 Code 0.1.10-nightly.20261116.4800.
const look = {
  section:
    "px-2 pt-2 pb-2.5 has-[>div:last-child:empty]:hidden border-border/65 [section:not(:has(>div:last-child:empty))~&]:border-t",
  grid: "grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs",
  row: "col-span-3 grid h-6 cursor-default grid-cols-subgrid items-center rounded-lg px-2.5 outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/[0.08]",
  label: "max-w-28 truncate text-muted-foreground",
  track: "relative h-[3px] rounded-full bg-muted-foreground/30 dark:bg-muted-foreground/20",
  fill: {
    error: "absolute inset-y-0 left-0 rounded-full bg-error",
    warning: "absolute inset-y-0 left-0 rounded-full bg-warning",
    none: "absolute inset-y-0 left-0 rounded-full bg-foreground/80",
  },
  value: {
    error: "text-end font-medium tabular-nums text-error-foreground",
    warning: "text-end font-medium tabular-nums text-warning-foreground",
    none: "text-end font-medium tabular-nums text-foreground/80",
  },
  check: "M5.252 12.7 10.2 18.63 18.748 5.37",
} as const;

const selectors = {
  card: "[data-thread-details-card]",
  /** The card's list of sections. Its last child is the "Choose what to show" placeholder. */
  items: ".group\\/details-items",
  menuGroup: '[role="menu"] [role="group"]',
  menuLabel: '[data-slot="menu-label"]',
  menuCheckbox: '[role="menuitemcheckbox"]',
  menuItem: '[role="menuitem"]',
} as const;

const MENU_LABEL = "Show in thread details";
const RESET_LABEL = "Reset to default";
const REFRESH_MS = 60_000;
const SVG_NS = "http://www.w3.org/2000/svg";

type ReadDisks = () => Promise<ReadonlyArray<Disk>>;

/** `api.disks` arrived in plugin SDK 1.3.0; older t3mode builds don't have it. */
const readDisks = (api: PluginApi): ReadDisks | undefined =>
  (api as PluginApi & { readonly disks?: ReadDisks }).disks;

const setClass = (element: Element, value: string) => {
  if (element.getAttribute("class") !== value) element.setAttribute("class", value);
};
const setText = (element: Element, value: string) => {
  if (element.textContent !== value) element.textContent = value;
};
const setAttr = (element: Element, name: string, value: string) => {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};

const span = (className: string) => {
  const element = document.createElement("span");
  element.className = className;
  return element;
};

const buildRow = () => {
  const row = document.createElement("div");
  row.tabIndex = 0;
  row.className = look.row;
  const fill = span(look.fill.none);
  const track = span(look.track);
  track.append(fill);
  row.append(span(look.label), track, span(look.value.none));
  return row;
};

const drawRow = (row: HTMLElement, data: DiskRow) => {
  const [label, track, value] = row.children;
  const fill = track?.firstElementChild;
  if (!label || !fill || !value) return;
  const tone = data.tone ?? "none";
  setAttr(row, "aria-label", `${data.label}: ${data.spoken}, ${data.detail}`);
  setAttr(row, "title", `${data.key} ${data.detail}`);
  setText(label, data.label);
  setClass(fill, look.fill[tone]);
  const width = `max(${data.percent}%, 6px)`;
  if ((fill as HTMLElement).style.width !== width) (fill as HTMLElement).style.width = width;
  setClass(value, look.value[tone]);
  setText(value, data.value);
};

const checkIndicator = () => {
  const indicator = span("col-start-1");
  indicator.setAttribute("aria-hidden", "true");
  indicator.dataset["checked"] = "";
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    fill: "none",
    height: "24",
    width: "24",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": "1.75",
  })) {
    svg.setAttribute(name, value);
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", look.check);
  svg.append(path);
  indicator.append(svg);
  return indicator;
};

export default definePlugin({
  options: {
    display: {
      type: "select",
      label: "Show",
      description:
        "Space used fills the bar as the drive fills, like the context window. Space left empties it, like the usage limits.",
      choices: [
        { value: "used", label: "Space used" },
        { value: "left", label: "Space left" },
      ],
      default: "used",
    },
  },
  start(api) {
    const read = readDisks(api);
    if (!read) {
      api.report({ state: "waiting", detail: "needs a t3mode build with api.disks (SDK 1.3.0)" });
      return;
    }

    let visible = api.storage.get("visible", true);
    let rows: ReadonlyArray<DiskRow> | null = null;
    let fetchedAt = 0;
    let loading = false;
    let stopped = false;
    api.onCleanup(() => {
      stopped = true;
    });

    const section = api.element("section");
    section.setAttribute("aria-label", "Disk usage");
    section.dataset["t3modeDiskUsage"] = "";
    const grid = document.createElement("div");
    grid.className = look.grid;
    section.append(grid);

    const item = api.element("div");
    item.dataset["t3modeDiskUsage"] = "";
    item.setAttribute("role", "menuitemcheckbox");
    item.tabIndex = -1;
    item.dataset["slot"] = "menu-checkbox-item";
    const indicator = checkIndicator();
    const itemLabel = span("col-start-2");
    itemLabel.textContent = "Disk usage";
    item.append(itemLabel);

    const setVisible = (next: boolean) => {
      visible = next;
      api.storage.set("visible", next);
      check();
    };
    api.listen(item, "click", () => setVisible(!visible));
    api.listen(item, "pointerenter", () => item.setAttribute("data-highlighted", ""));
    api.listen(item, "pointerleave", () => item.removeAttribute("data-highlighted"));
    // T3 Code's own items stay highlighted until the pointer reaches another one of them.
    api.listen(item, "pointermove", () => {
      for (const other of item.parentElement?.querySelectorAll("[data-highlighted]") ?? []) {
        if (other !== item) other.removeAttribute("data-highlighted");
      }
    });
    // T3 Code's "Reset to default" brings back its defaults; the section's default is on.
    api.listen(
      document,
      "click",
      (event) => {
        const target =
          event.target instanceof Element ? event.target.closest(selectors.menuItem) : null;
        if (target?.textContent?.trim() === RESET_LABEL && item.isConnected && !visible) {
          setVisible(true);
        }
      },
      { capture: true },
    );

    const refresh = () => {
      if (loading || Date.now() - fetchedAt < REFRESH_MS) return;
      loading = true;
      read().then(
        (disks) => {
          if (stopped) return;
          rows = diskRows(disks, api.options.display);
          fetchedAt = Date.now();
          loading = false;
          api.report({ state: "active", detail: `${rows.length} drive(s)` });
          check();
        },
        (error: unknown) => {
          if (stopped) return;
          fetchedAt = Date.now();
          loading = false;
          api.report({ state: "waiting", detail: `could not read the drives: ${String(error)}` });
        },
      );
    };

    const drawSection = (items: Element) => {
      if (!visible || rows === null || rows.length === 0) {
        section.remove();
        return;
      }
      const sibling = [...items.children].findLast(
        (child) => child.tagName === "SECTION" && child !== section,
      );
      setClass(section, sibling?.getAttribute("class") ?? look.section);
      while (grid.children.length > rows.length) grid.lastElementChild?.remove();
      while (grid.children.length < rows.length) grid.append(buildRow());
      rows.forEach((row, index) => drawRow(grid.children[index] as HTMLElement, row));
      if (sibling) {
        if (sibling.nextElementSibling !== section) sibling.after(section);
      } else if (items.firstElementChild !== section) {
        items.prepend(section);
      }
    };

    const drawItem = () => {
      const group = [...document.querySelectorAll(selectors.menuGroup)].find(
        (candidate) => candidate.querySelector(selectors.menuLabel)?.textContent === MENU_LABEL,
      );
      const template = [...(group?.querySelectorAll(selectors.menuCheckbox) ?? [])].findLast(
        (candidate) => candidate !== item,
      );
      if (!group || !template) {
        item.remove();
        return;
      }
      setClass(item, template.getAttribute("class") ?? "");
      setAttr(item, "aria-checked", String(visible));
      item.toggleAttribute("data-checked", visible);
      item.toggleAttribute("data-unchecked", !visible);
      if (visible && indicator.parentElement !== item) item.prepend(indicator);
      if (!visible) indicator.remove();
      if (template.nextElementSibling !== item) template.after(item);
    };

    const check = () => {
      if (stopped) return;
      drawItem();
      const items = document.querySelector(selectors.card)?.querySelector(selectors.items);
      if (!items) {
        section.remove();
        return;
      }
      if (visible) refresh();
      drawSection(items);
    };

    api.report({ state: "active", detail: "waiting for the thread details card" });
    api.observe(check);
    api.interval(check, REFRESH_MS);
  },
});
