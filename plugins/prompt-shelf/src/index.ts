// Prompt shelf: a durable library of prompt snippets, kept in the plugin's storage file. A "Shelf"
// tab sits on the composer next to T3 Code's Stash and opens a drawer like the Stash's, where a
// snippet goes in at the caret with one key. Stash holds drafts for a while; the shelf keeps
// prompts for good. Snippets are edited and imported on the plugin's settings page.
import { definePlugin } from "@t3mode/plugin-sdk";

import {
  composerForm,
  editorIn,
  editorRange,
  insertSnippet,
  promptText,
  restoreCaret,
  sel,
} from "./composer.ts";
import { h } from "./dom.ts";
import { type IconName, type Look, MENU, currentLook, svgIcon } from "./look.ts";
import {
  type Shelf,
  type Snippet,
  addTexts,
  decodeShelf,
  parseImport,
  rank,
  removeSnippet,
  shelfToken,
  updateSnippet,
} from "./shelf.ts";

const SHELF_KEY = "shelf";

type Store =
  | { readonly kind: "ready"; readonly shelf: Shelf }
  | { readonly kind: "unreadable"; readonly reason: string };

/** A row the drawer's highlight can land on. */
type Entry = { readonly kind: "snippet"; readonly snippet: Snippet } | { readonly kind: "shelve" };

interface Drawer {
  readonly layer: HTMLElement;
  readonly search: HTMLInputElement;
  readonly list: HTMLElement;
  readonly footer: HTMLElement;
  readonly count: HTMLElement;
  /** Where the caret was in the composer when the drawer opened. */
  readonly caret: Range | null;
  entries: ReadonlyArray<Entry>;
  rows: ReadonlyArray<HTMLElement>;
  highlighted: number;
}

interface Picker {
  readonly layer: HTMLElement;
  readonly list: HTMLElement;
  readonly scroll: HTMLElement;
  node: Text;
  start: number;
  query: string;
  snippets: ReadonlyArray<Snippet>;
  rows: ReadonlyArray<HTMLElement>;
  highlighted: number;
}

const isMac = /mac|iphone|ipad/i.test(navigator.platform);

/**
 * Ctrl+Alt+S, or Cmd+Alt+S on macOS. The physical S key counts too, because Alt changes `key`
 * on some layouts.
 */
const isOpenShortcut = (event: KeyboardEvent) =>
  event.altKey &&
  !event.shiftKey &&
  event.ctrlKey === !isMac &&
  event.metaKey === isMac &&
  (event.key.toLowerCase() === "s" || event.code === "KeyS");

/** The Stash tab's gap to its neighbor (`gap-1`). */
const TAB_GAP = 4;
const ATTR = "data-t3mode-prompt-shelf";

const CSS = `
[${ATTR}=tab] { position: fixed; z-index: 39; overflow: hidden; }
[${ATTR}=search] {
  width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent;
  color: var(--foreground); font: inherit;
}
[${ATTR}=search]::placeholder { color: var(--muted-foreground); }
[${ATTR}=panel] textarea {
  box-sizing: border-box; width: 100%; min-height: 2.5rem; padding: 6px 8px; resize: vertical;
  border: 1px solid var(--input); border-radius: var(--radius-lg, 8px); background: transparent;
  color: var(--foreground); font: inherit; font-size: var(--text-sm, 13px); line-height: 1.45;
}
[${ATTR}=panel] textarea:focus { outline: none; border-color: var(--ring); }
[${ATTR}=panel] .shelf-import { display: flex; flex-direction: column; gap: 8px; }
[${ATTR}=panel] .shelf-import-foot { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
[${ATTR}=panel] .shelf-path { font-family: var(--font-mono, ui-monospace, monospace); word-break: break-all; }
`;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

const setStyle = (element: HTMLElement, property: string, value: string) => {
  if (element.style.getPropertyValue(property) !== value) {
    element.style.setProperty(property, value);
  }
};
const setText = (element: Element, text: string) => {
  if (element.textContent !== text) element.textContent = text;
};
const setAttr = (element: Element, name: string, value: string) => {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};

/** A CSS length in px, for the rem and px values T3 Code uses. */
const toPx = (value: string): number | null => {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return null;
  if (value.trim().endsWith("rem")) {
    return amount * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  }
  return value.trim().endsWith("px") ? amount : null;
};

const preventPointer = (event: Event) => event.preventDefault();

export default definePlugin({
  options: {},
  start(api) {
    const { button, group, row } = api.ui;
    const readShelf = (): Store => {
      if (!api.storage.readable) return { kind: "unreadable", reason: "It isn't valid JSON." };
      const shelf = decodeShelf(api.storage.get<unknown>(SHELF_KEY, undefined));
      if (shelf) return { kind: "ready", shelf };
      api.log("warn", `${api.storage.path} doesn't hold a shelf; leaving it untouched`);
      return { kind: "unreadable", reason: "It doesn't hold a shelf." };
    };
    let store = readShelf();
    let drawer: Drawer | null = null;
    let picker: Picker | null = null;
    let dismissed: { node: Text; start: number } | null = null;
    let panelHost: HTMLElement | null = null;
    let panelKey = "";
    let importText = "";
    api.css(CSS);

    const readOnlyMessage = () =>
      `The shelf file can't be read, so the shelf is read-only. Fix or remove ${api.storage.path}, then reload T3 Code with Ctrl+R.`;

    const setStore = (next: Store) => {
      store = next;
      if (next.kind === "ready") {
        api.report({ state: "active", detail: plural(next.shelf.snippets.length, "snippet") });
      } else if (next.kind === "unreadable") {
        api.report({ state: "waiting", detail: `Shelf file unreadable: ${api.storage.path}` });
      }
      syncTab();
      if (drawer) renderEntries(drawer);
      syncPicker(true);
      renderPanel(false);
    };

    /** Every change goes through here. Nothing is written unless the file was read. */
    const save = (change: (shelf: Shelf) => Shelf): boolean => {
      if (store.kind !== "ready") {
        api.toast(readOnlyMessage(), "error");
        return false;
      }
      const shelf = change(store.shelf);
      setStore({ kind: "ready", shelf });
      api.storage.set(SHELF_KEY, shelf);
      return true;
    };

    const now = () => new Date().toISOString();
    const newId = () => crypto.randomUUID();
    const recordUse = (id: string) =>
      save((shelf) =>
        updateSnippet(shelf, id, (item) => ({
          ...item,
          uses: item.uses + 1,
          lastUsedAt: now(),
        })),
      );

    const iconSlot = (look: Look, name: IconName | null) =>
      h(
        "span",
        {
          className: look.icon,
          attrs: { "aria-hidden": "true", "data-slot": "composer-banner-icon" },
        },
        name ? svgIcon(name) : null,
      );

    const tab = api.element("div");
    tab.setAttribute(ATTR, "tab");
    tab.style.display = "none";
    const tabCount = h("span");
    const tabButton = h("button", {
      attrs: {
        type: "button",
        "data-composer-banner-row": "true",
        "data-composer-banner-layout": "inline",
        "aria-expanded": "false",
      },
      on: {
        pointerdown: preventPointer,
        click: () => (drawer ? closeDrawer(true) : openDrawer()),
      },
    });
    const tabSurface = h(
      "div",
      {
        attrs: {
          "data-composer-banner-surface": "attached",
          "data-variant": "default",
          "data-slot": "composer-banner",
          "data-composer-banner-width": "content",
        },
      },
      tabButton,
    );
    tab.append(tabSurface);
    document.body.append(tab);
    let tabLookKey = "";

    const syncTabLook = () => {
      const look = currentLook();
      const key = `${look.tabSurface}\n${look.row}\n${look.icon}\n${look.content}\n${look.count}`;
      if (key === tabLookKey) return;
      tabLookKey = key;
      tabSurface.className = look.tabSurface;
      tabButton.className = `${look.row} transition-colors duration-200 text-muted-foreground hover:text-foreground`;
      tabCount.className = look.count;
      tabButton.replaceChildren(
        iconSlot(look, "library"),
        h("span", {
          className: look.content,
          attrs: { "data-slot": "composer-banner-content" },
          text: "Shelf",
        }),
        h(
          "span",
          { className: look.actions, attrs: { "data-slot": "composer-banner-actions" } },
          tabCount,
        ),
      );
    };

    const syncTab = () => {
      const count = store.kind === "ready" ? String(store.shelf.snippets.length) : "!";
      setText(tabCount, count);
      setAttr(
        tabButton,
        "aria-label",
        store.kind === "unreadable"
          ? "Prompt shelf: the file can't be read. Open shelf."
          : `Prompt shelf: ${plural(store.kind === "ready" ? store.shelf.snippets.length : 0, "snippet")}. Open shelf.`,
      );
      setAttr(tabButton, "aria-expanded", String(drawer !== null));
    };

    /**
     * Places the tab on the composer's top edge, left of the Stash tab or at the right edge
     * without one, and the open drawer where T3 Code puts the Stash's. Both are fixed overlays;
     * T3 Code's nodes are only measured.
     */
    const position = () => {
      const form = composerForm();
      const surface = form?.querySelector<HTMLElement>(sel.surface);
      if (!form || !surface || surface.getClientRects().length === 0) {
        setStyle(tab, "display", "none");
        if (drawer) closeDrawer(false);
        closePicker();
        return;
      }
      const viewport = document.documentElement;
      const top = surface.getBoundingClientRect().top;
      const formRect = form.getBoundingClientRect();
      const inset =
        toPx(getComputedStyle(form).getPropertyValue("--chat-composer-drawer-inset")) ?? 22;
      const overlap = (toPx("1rem") ?? 16) + 1;
      const stashTab = form
        .querySelector(sel.stashTab)
        ?.closest<HTMLElement>("[data-composer-banner-surface]");
      const right = stashTab
        ? stashTab.getBoundingClientRect().left - TAB_GAP
        : formRect.right - inset;
      // Other banners over the composer take the tab's place; Ctrl+Alt+S still opens the drawer.
      const crowded = (form.querySelector(sel.banners)?.childElementCount ?? 0) > 0;

      syncTabLook();
      setStyle(tab, "display", crowded ? "none" : "block");
      setStyle(tab, "right", `${viewport.clientWidth - right}px`);
      setStyle(tab, "bottom", `${viewport.clientHeight - top}px`);
      setStyle(tabSurface, "margin-bottom", `-${overlap}px`);

      const place = (layer: HTMLElement, rect: DOMRect, height: number, minimum: number) => {
        const bottom = rect.top + overlap;
        setStyle(layer, "bottom", `${height - bottom}px`);
        setStyle(layer, "left", `${rect.left + inset}px`);
        setStyle(layer, "width", `${rect.width - 2 * inset}px`);
        setStyle(layer, "max-height", `${Math.max(minimum, bottom - 24)}px`);
      };
      if (drawer) {
        place(
          drawer.layer,
          new DOMRect(formRect.left, top, formRect.width, 0),
          viewport.clientHeight,
          120,
        );
      }
      if (picker) {
        place(picker.layer, surface.getBoundingClientRect(), innerHeight, 96);
        scrollFade(picker);
      }
    };

    const listRow = (look: Look, ...children: ReadonlyArray<Node>) =>
      h(
        "li",
        {
          className: `${look.row} relative rounded-sm`,
          attrs: { "data-composer-banner-row": "true", "data-composer-banner-layout": "inline" },
        },
        ...children,
      );

    const content = (look: Look, ...children: ReadonlyArray<Node | string>) =>
      h(
        "span",
        { className: look.content, attrs: { "data-slot": "composer-banner-content" } },
        ...children,
      );

    const actions = (look: Look, ...children: ReadonlyArray<Node>) =>
      h(
        "span",
        { className: look.actions, attrs: { "data-slot": "composer-banner-actions" } },
        ...children,
      );

    const highlight = (state: Drawer, index: number) => {
      state.highlighted = index;
      state.rows.forEach((rowElement, i) => {
        const on = i === index;
        if (rowElement.hasAttribute("data-highlighted") === on) return;
        rowElement.toggleAttribute("data-highlighted", on);
        rowElement.classList.toggle("bg-accent", on);
        rowElement.classList.toggle("text-accent-foreground", on);
      });
      state.rows[index]?.scrollIntoView({ block: "nearest" });
    };

    const renderEntries = (state: Drawer) => {
      const look = currentLook();
      const query = state.search.value;
      const snippets = store.kind === "ready" ? rank(store.shelf.snippets, query) : [];
      setText(state.count, store.kind === "ready" ? String(store.shelf.snippets.length) : "");

      const rows = snippets.map((snippet, index) =>
        h(
          "li",
          {
            className: `${look.row} relative rounded-sm`,
            attrs: {
              "data-composer-banner-row": "true",
              "data-composer-banner-layout": "inline",
              "data-shelf-snippet": snippet.id,
            },
            on: { mousemove: () => state.highlighted !== index && highlight(state, index) },
          },
          iconSlot(look, "file-text"),
          content(
            look,
            h("button", {
              className: look.restore,
              text: oneLine(snippet.text),
              title: snippet.text,
              attrs: { type: "button", "aria-label": `Insert prompt: ${oneLine(snippet.text)}` },
              on: { pointerdown: preventPointer, click: () => insert(snippet) },
            }),
          ),
          actions(
            look,
            h("span", { className: look.time, text: `${snippet.uses}×` }),
            h(
              "button",
              {
                className: look.dismiss,
                attrs: {
                  type: "button",
                  "data-slot": "button",
                  "aria-label": "Delete prompt from the shelf",
                },
                on: {
                  pointerdown: preventPointer,
                  click: (event) => {
                    event.stopPropagation();
                    save((shelf) => removeSnippet(shelf, snippet.id));
                    state.search.focus();
                  },
                },
              },
              svgIcon("x", "size-3.5"),
            ),
          ),
        ),
      );

      const message =
        store.kind === "unreadable"
          ? readOnlyMessage()
          : store.shelf.snippets.length === 0
            ? "Nothing on the shelf yet. Shelve a prompt, or import some on Settings / Plugins / Prompt shelf."
            : rows.length === 0
              ? `No prompt on the shelf matches "${query.trim()}".`
              : null;
      state.list.replaceChildren(
        ...rows,
        ...(message
          ? [
              listRow(
                look,
                iconSlot(look, null),
                h("span", {
                  className: `${look.content} text-muted-foreground`,
                  attrs: { "data-slot": "composer-banner-content" },
                  text: message,
                }),
              ),
            ]
          : []),
      );

      const form = composerForm();
      const editor = form && editorIn(form);
      const canShelve = store.kind === "ready" && editor !== null && promptText(editor) !== "";
      const shelveRow = listRow(
        look,
        iconSlot(look, "plus"),
        content(
          look,
          h("button", {
            className: look.restore,
            text: "Shelve the current prompt",
            attrs: {
              type: "button",
              ...(canShelve ? {} : { "aria-disabled": "true" }),
            },
            style: canShelve ? {} : { opacity: "0.5", cursor: "default" },
            on: { pointerdown: preventPointer, click: () => shelve() },
          }),
        ),
      );
      shelveRow.addEventListener("mousemove", () => {
        if (state.highlighted !== rows.length) highlight(state, rows.length);
      });
      state.footer.replaceChildren(shelveRow);

      state.entries = [
        ...snippets.map((snippet) => ({ kind: "snippet", snippet }) as const),
        { kind: "shelve" } as const,
      ];
      state.rows = [...rows, shelveRow];
      state.highlighted = -1;
      highlight(state, 0);
    };

    const openDrawer = () => {
      const form = composerForm();
      const editor = form && editorIn(form);
      if (!form || !editor) return false;
      // Settings and other dialogs cover the composer without unmounting it.
      const box = editor.getBoundingClientRect();
      if (
        !form.contains(
          document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
        )
      ) {
        return false;
      }
      closePicker();
      const look = currentLook();
      const list = h("ul", {
        className: look.list,
        attrs: { role: "list", "aria-label": "Shelved prompts" },
      });
      const footer = h("ul", { className: look.list, attrs: { role: "list" } });
      const count = h("span", { className: look.count });
      const search = h("input", {
        attrs: {
          [ATTR]: "search",
          type: "text",
          placeholder: "Search the shelf",
          "aria-label": "Search the shelf",
          autocomplete: "off",
          spellcheck: "false",
        },
        on: { input: () => drawer && renderEntries(drawer) },
      });
      const header = h(
        "button",
        {
          className: look.row,
          attrs: {
            type: "button",
            "data-composer-banner-row": "true",
            "data-composer-banner-layout": "inline",
            "aria-label": "Close shelf",
            "aria-expanded": "true",
          },
          on: { pointerdown: preventPointer, click: () => closeDrawer(true) },
        },
        iconSlot(look, "library"),
        h("span", {
          className: `${look.content} text-muted-foreground`,
          attrs: { "data-slot": "composer-banner-content" },
          text: "Shelf",
        }),
        actions(
          look,
          count,
          h(
            "span",
            {
              className: look.chevron,
              attrs: { "aria-hidden": "true", "data-slot": "button", tabindex: "-1" },
            },
            svgIcon("chevron-down", "size-3.5"),
          ),
        ),
      );
      const layer = h(
        "div",
        { className: look.layer, attrs: { [ATTR]: "drawer" } },
        h(
          "div",
          {
            className: look.drawerSurface,
            attrs: {
              "data-composer-banner-surface": "attached",
              "data-variant": "default",
              "data-slot": "composer-banner",
              "data-composer-banner-width": "fill",
            },
          },
          header,
          h(
            "ul",
            { className: look.list, attrs: { role: "list" } },
            listRow(look, iconSlot(look, "search"), content(look, search)),
          ),
          h(
            "div",
            { className: look.scroll, attrs: { role: "presentation" } },
            h(
              "div",
              { className: look.viewport, style: { overflow: "auto" } },
              h("div", { className: look.viewportInner }, list),
            ),
          ),
          footer,
        ),
      );
      drawer = {
        layer,
        search,
        list,
        footer,
        count,
        caret: editorRange(editor),
        entries: [],
        rows: [],
        highlighted: 0,
      };
      document.body.append(layer);
      renderEntries(drawer);
      position();
      syncTab();
      search.focus();
      return true;
    };

    const closeDrawer = (returnToComposer: boolean) => {
      const state = drawer;
      if (!state) return;
      drawer = null;
      state.layer.remove();
      syncTab();
      if (!returnToComposer) return;
      const form = composerForm();
      const editor = form && editorIn(form);
      if (editor) restoreCaret(editor, state.caret);
    };
    api.onCleanup(() => closeDrawer(false));

    const insert = (snippet: Snippet) => {
      const caret = drawer?.caret ?? null;
      closeDrawer(false);
      const form = composerForm();
      const editor = form && editorIn(form);
      if (!editor || !insertSnippet(editor, caret, snippet.text)) {
        api.toast("The prompt could not be inserted into the composer.", "error");
        return;
      }
      recordUse(snippet.id);
    };

    const pickerLayer = api.element("div");
    pickerLayer.className = MENU.layer;
    pickerLayer.setAttribute(ATTR, "picker");
    pickerLayer.setAttribute("data-composer-drawer-layer", "true");
    const pickerList = h("div", {
      className: MENU.list,
      attrs: {
        role: "listbox",
        "data-slot": "command-list",
        "aria-label": "Shelf prompts",
        tabindex: "-1",
      },
    });
    const pickerScroll = h(
      "div",
      {
        className: MENU.viewport,
        attrs: { "data-slot": "scroll-area-viewport", tabindex: "0" },
        style: { overflow: "auto" },
      },
      pickerList,
    );
    const pickerRoot = h(
      "div",
      { className: MENU.root, attrs: { role: "presentation" } },
      pickerScroll,
    );
    pickerLayer.append(
      h(
        "div",
        {
          className: MENU.surface,
          attrs: {
            "data-composer-banner-surface": "attached",
            "data-variant": "default",
            "data-composer-command-drawer": "true",
          },
        },
        pickerRoot,
      ),
    );

    const tooltip = api.element("div");
    tooltip.className = MENU.tooltipPositioner;
    for (const [name, value] of Object.entries({
      "data-open": "",
      "data-side": "top",
      "data-align": "center",
      role: "presentation",
      "data-slot": "tooltip-positioner",
    }))
      tooltip.setAttribute(name, value);
    tooltip.style.position = "fixed";
    let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
    const hideTooltip = () => {
      if (tooltipTimer !== null) clearTimeout(tooltipTimer);
      tooltipTimer = null;
      tooltip.remove();
    };
    const showTooltip = (text: HTMLElement, prompt: string) => {
      hideTooltip();
      tooltipTimer = setTimeout(() => {
        tooltipTimer = null;
        if (!picker || !text.isConnected || text.scrollWidth <= text.clientWidth) return;
        const rect = text.getBoundingClientRect();
        tooltip.style.setProperty("--available-width", `${Math.max(0, innerWidth - 16)}px`);
        tooltip.style.setProperty("--available-height", `${Math.max(0, rect.top - 12)}px`);
        tooltip.style.setProperty("--anchor-width", `${rect.width}px`);
        tooltip.style.setProperty("--anchor-height", `${rect.height}px`);
        tooltip.style.setProperty("--transform-origin", "center calc(100% + 4px)");
        tooltip.replaceChildren(
          h(
            "div",
            {
              className: MENU.tooltipPopup,
              attrs: {
                "data-open": "",
                "data-side": "top",
                "data-align": "center",
                tabindex: "-1",
                "data-base-ui-focusable": "",
                "data-slot": "tooltip-popup",
              },
            },
            h("div", {
              className: MENU.tooltipViewport,
              attrs: { "data-slot": "tooltip-viewport" },
              text: prompt,
            }),
          ),
        );
        document.body.append(tooltip);
        const box = tooltip.getBoundingClientRect();
        tooltip.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - box.width) / 2, innerWidth - box.width - 8))}px`;
        tooltip.style.top = `${Math.max(8, Math.min(rect.top - box.height - 4, innerHeight - box.height - 8))}px`;
      }, 600);
    };
    const closePicker = () => {
      hideTooltip();
      picker = null;
      pickerLayer.remove();
    };
    api.onCleanup(closePicker);

    const liveToken = () => {
      const form = composerForm();
      const editor = form && editorIn(form);
      const selection = getSelection();
      if (
        !editor ||
        !editor.contains(document.activeElement) ||
        !selection?.isCollapsed ||
        !(selection.anchorNode instanceof Text) ||
        !editor.contains(selection.anchorNode)
      )
        return null;
      const node = selection.anchorNode;
      const caret = selection.anchorOffset;
      const token = shelfToken(node.data.slice(0, caret));
      return token ? { node, caret, ...token } : null;
    };
    const scrollFade = (state: Picker) => {
      const { scroll } = state;
      const end = Math.max(0, scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
      setStyle(scroll, "--scroll-area-overflow-y-start", `${scroll.scrollTop}px`);
      setStyle(scroll, "--scroll-area-overflow-y-end", `${end}px`);
      setStyle(scroll, "--scroll-area-overflow-x-start", "0px");
      setStyle(scroll, "--scroll-area-overflow-x-end", "0px");
      const overflow = scroll.scrollHeight > scroll.clientHeight;
      if (scroll.hasAttribute("data-has-overflow-y") !== overflow) {
        scroll.toggleAttribute("data-has-overflow-y", overflow);
        pickerRoot.toggleAttribute("data-has-overflow-y", overflow);
      }
    };
    const highlightPicker = (state: Picker, index: number) => {
      state.highlighted = index;
      state.rows.forEach((element, i) => {
        const active = i === index;
        if (active) {
          setAttr(element, "aria-selected", "true");
          setAttr(element, "data-active", "true");
        } else {
          element.removeAttribute("aria-selected");
          element.removeAttribute("data-active");
        }
        element.classList.toggle("bg-accent!", active);
        element.classList.toggle("text-accent-foreground!", active);
      });
      state.rows[index]?.scrollIntoView({ block: "nearest" });
      scrollFade(state);
    };
    const renderPicker = (state: Picker) => {
      hideTooltip();
      const rows = state.snippets.map((snippet) =>
        h(
          "div",
          {
            className: MENU.item,
            attrs: { role: "option", "data-slot": "command-item" },
          },
          h(
            "span",
            { className: MENU.content },
            h("span", {
              className: MENU.text,
              text: oneLine(snippet.text),
              attrs: { "data-slot": "tooltip-trigger" },
            }),
            h(
              "span",
              { className: MENU.badge, attrs: { "data-slot": "badge" } },
              svgIcon("library", "text-current"),
              "Prompt",
            ),
          ),
        ),
      );
      state.rows = rows;
      state.list.replaceChildren(
        rows.length
          ? h(
              "div",
              {
                className: MENU.group,
                attrs: { role: "group", "data-slot": "command-group" },
              },
              ...rows,
            )
          : h("div", {
              className: "px-2 py-1.5 text-xs text-muted-foreground",
              attrs: { "data-slot": "command-empty" },
              text:
                store.kind === "unreadable"
                  ? readOnlyMessage()
                  : "Nothing on the shelf yet. Shelve a prompt, or import some on Settings / Plugins / Prompt shelf.",
            }),
      );
      state.scroll.scrollTop = 0;
      highlightPicker(state, 0);
    };
    const syncPicker = (force = false) => {
      const token = liveToken();
      if (!token) dismissed = null;
      else if (dismissed && (dismissed.node !== token.node || dismissed.start !== token.start))
        dismissed = null;
      if (!token || dismissed || drawer) {
        closePicker();
        return;
      }
      if (
        picker &&
        !force &&
        picker.node === token.node &&
        picker.start === token.start &&
        picker.query === token.query
      )
        return;
      const snippets = store.kind === "ready" ? rank(store.shelf.snippets, token.query) : [];
      if (token.query !== "" && snippets.length === 0) {
        closePicker();
        return;
      }
      picker = {
        layer: pickerLayer,
        list: pickerList,
        scroll: pickerScroll,
        node: token.node,
        start: token.start,
        query: token.query,
        snippets,
        rows: [],
        highlighted: 0,
      };
      document.body.append(pickerLayer);
      renderPicker(picker);
      position();
    };
    const insertFromPicker = (snippet: Snippet) => {
      const token = liveToken();
      closePicker();
      let inserted = false;
      if (token) {
        const range = document.createRange();
        range.setStart(token.node, token.start);
        range.setEnd(token.node, token.caret);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        const suffix = /^[ \n\t\r]/.test(token.node.data.slice(token.caret)) ? "" : " ";
        try {
          inserted = document.execCommand("insertText", false, snippet.text + suffix);
        } catch {
          inserted = false;
        }
      }
      if (inserted) recordUse(snippet.id);
      else api.toast("The prompt could not be inserted into the composer.", "error");
    };
    const pickerRow = (event: Event) => {
      const target = event.target;
      const row = target instanceof Element ? target.closest<HTMLElement>('[role="option"]') : null;
      const index = row && picker ? picker.rows.indexOf(row) : -1;
      return index >= 0 ? index : null;
    };
    api.listen(pickerLayer, "mousemove", (event) => {
      const index = pickerRow(event);
      if (picker && index !== null && picker.highlighted !== index) highlightPicker(picker, index);
    });
    api.listen(pickerLayer, "mousedown", preventPointer);
    api.listen(pickerLayer, "click", (event) => {
      const index = pickerRow(event);
      const snippet = index !== null ? picker?.snippets[index] : null;
      if (snippet) insertFromPicker(snippet);
    });
    api.listen(pickerLayer, "pointerover", (event) => {
      const index = pickerRow(event);
      const snippet = index !== null ? picker?.snippets[index] : null;
      const text = event.target;
      if (snippet && text instanceof HTMLElement && text.dataset.slot === "tooltip-trigger")
        showTooltip(text, snippet.text);
    });
    api.listen(pickerLayer, "pointerout", hideTooltip);
    api.listen(pickerScroll, "scroll", () => {
      hideTooltip();
      if (picker) scrollFade(picker);
    });
    api.listen(document, "selectionchange", () => syncPicker());
    api.listen(document, "input", (event) => {
      if (event.target instanceof Element && event.target.closest(`${sel.form} ${sel.editor}`))
        syncPicker();
    });
    api.listen(document, "focusin", () => syncPicker());
    api.listen(document, "focusout", () => closePicker());

    const shelve = () => {
      const form = composerForm();
      const editor = form && editorIn(form);
      const text = editor ? promptText(editor) : "";
      if (text === "") return;
      if (store.kind === "ready" && store.shelf.snippets.some((snippet) => snippet.text === text)) {
        closeDrawer(true);
        api.toast("Already on the shelf");
        return;
      }
      closeDrawer(true);
      if (save((shelf) => addTexts(shelf, [text], now(), newId).shelf)) api.toast("Shelved");
    };

    const activate = (state: Drawer) => {
      const entry = state.entries[state.highlighted];
      if (entry?.kind === "snippet") insert(entry.snippet);
      else if (entry?.kind === "shelve") shelve();
    };

    api.listen<KeyboardEvent>(
      window,
      "keydown",
      (event) => {
        if (!event.repeat && isOpenShortcut(event)) {
          if (drawer) closeDrawer(true);
          else if (!openDrawer()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (
          picker &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.isComposing
        ) {
          syncPicker();
          const state = picker;
          if (!state) return;
          if (event.key === "Escape") {
            const token = liveToken();
            dismissed = token ? { node: token.node, start: token.start } : null;
            closePicker();
          } else if (state.rows.length === 0) return;
          else if (event.key === "ArrowDown")
            highlightPicker(state, (state.highlighted + 1) % state.rows.length);
          else if (event.key === "ArrowUp")
            highlightPicker(state, (state.highlighted + state.rows.length - 1) % state.rows.length);
          else if (event.key === "Enter" || event.key === "Tab") {
            const snippet = state.snippets[state.highlighted];
            if (snippet) insertFromPicker(snippet);
          } else return;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const state = drawer;
        if (!state || !state.layer.contains(document.activeElement)) return;
        const last = state.entries.length - 1;
        if (event.key === "Escape") closeDrawer(true);
        else if (event.key === "ArrowDown")
          highlight(state, state.highlighted >= last ? 0 : state.highlighted + 1);
        else if (event.key === "ArrowUp")
          highlight(state, state.highlighted <= 0 ? last : state.highlighted - 1);
        else if (event.key === "Enter" && !(event.target as Element).closest("button"))
          activate(state);
        else return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true },
    );

    api.listen<PointerEvent>(
      document,
      "pointerdown",
      (event) => {
        const target = event.target as Node;
        if (drawer && !drawer.layer.contains(target) && !tab.contains(target)) closeDrawer(false);
      },
      { capture: true },
    );

    // The DOM observer misses moves that change no node: window resizes and the sidebar's slide.
    api.listen(window, "resize", position);
    api.listen(document, "transitionend", position, { capture: true });
    api.observe(position);

    const snippetRow = (snippet: Snippet) => {
      const area = h("textarea", {
        props: { value: snippet.text, rows: Math.min(6, snippet.text.split("\n").length + 1) },
        attrs: { "aria-label": "Prompt", spellcheck: "false" },
        on: {
          blur: () => {
            const text = area.value.trim();
            if (text === snippet.text) return;
            if (text === "") {
              area.value = snippet.text;
              return;
            }
            save((shelf) => updateSnippet(shelf, snippet.id, (item) => ({ ...item, text })));
          },
        },
      });
      return row({
        description: area,
        control: button({
          text: "Delete",
          variant: "outline",
          onClick: () => save((shelf) => removeSnippet(shelf, snippet.id)),
        }),
      });
    };

    const importBlock = () => {
      const found = h("span");
      const area = h("textarea", {
        props: { value: importText, rows: 6 },
        attrs: {
          "aria-label": "Prompts to import",
          placeholder: "Paste prompts, separated by blank lines",
        },
      });
      const count = () => {
        const pieces = parseImport(importText);
        const known =
          store.kind === "ready"
            ? new Set(store.shelf.snippets.map((item) => item.text))
            : new Set();
        const old = new Set(pieces.filter((piece) => known.has(piece))).size;
        found.textContent = `${plural(pieces.length, "snippet")} found${old > 0 ? `, ${old} already on the shelf` : ""}`;
      };
      area.addEventListener("input", () => {
        importText = area.value;
        count();
      });
      count();
      return row({
        title: "Import",
        description: h(
          "div",
          { className: "shelf-import" },
          h("p", {
            text: "One prompt per paragraph. Blank lines separate prompts, and quotes around a prompt are removed.",
          }),
          area,
          h(
            "div",
            { className: "shelf-import-foot" },
            found,
            button({
              text: "Import",
              variant: "outline",
              onClick: () => {
                const pieces = parseImport(importText);
                let added = 0;
                const saved = save((shelf) => {
                  const result = addTexts(shelf, pieces, now(), newId);
                  added = result.added;
                  return result.shelf;
                });
                if (!saved) return;
                importText = "";
                api.toast(`Imported ${added}`);
                renderPanel(true);
              },
            }),
          ),
        ),
      });
    };

    const renderPanel = (force: boolean) => {
      const host = panelHost;
      if (!host?.isConnected) return;
      const key =
        store.kind === "ready" ? store.shelf.snippets.map((item) => item.id).join() : store.kind;
      if (!force && key === panelKey) return;
      panelKey = key;
      const file = row({
        title: "File",
        description: h("span", { className: "shelf-path", text: api.storage.path }),
      });
      if (store.kind !== "ready") {
        host.replaceChildren(
          h(
            "div",
            { attrs: { [ATTR]: "panel" } },
            group(
              file,
              row({
                title: "The shelf is read-only",
                description: `${store.reason} Nothing is written to the file until it is fixed and T3 Code reloads.`,
              }),
            ),
          ),
        );
        return;
      }
      const snippets = rank(store.shelf.snippets, "");
      host.replaceChildren(
        h(
          "div",
          {
            attrs: { [ATTR]: "panel" },
            style: { display: "flex", flexDirection: "column", gap: "16px" },
          },
          group(
            file,
            ...(snippets.length > 0
              ? snippets.map(snippetRow)
              : [
                  row({
                    title: "No prompts yet",
                    description: "Shelve one from the composer, or import some below.",
                  }),
                ]),
          ),
          group(importBlock()),
        ),
      );
    };

    api.settingsPanel("Snippets", (host) => {
      panelHost = host;
      renderPanel(true);
    });

    setStore(store);
  },
});
