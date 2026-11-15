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
import { type IconName, type Look, currentLook, svgIcon } from "./look.ts";
import {
  type Shelf,
  type Snippet,
  addTexts,
  decodeShelf,
  parseImport,
  rank,
  removeSnippet,
  updateSnippet,
} from "./shelf.ts";

/** Where api.storage keeps the shelf, for messages. */
const FILE = "<t3mode home>/plugin-data/prompt-shelf.json";
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
      api.log("warn", `${FILE} doesn't hold a shelf; leaving it untouched`);
      return { kind: "unreadable", reason: "It doesn't hold a shelf." };
    };
    let store = readShelf();
    let drawer: Drawer | null = null;
    let panelHost: HTMLElement | null = null;
    let panelKey = "";
    let importText = "";
    api.css(CSS);

    const readOnlyMessage = () =>
      `The shelf file can't be read, so the shelf is read-only. Fix or remove ${FILE}, then reload T3 Code with Ctrl+R.`;

    const setStore = (next: Store) => {
      store = next;
      if (next.kind === "ready") {
        api.report({ state: "active", detail: plural(next.shelf.snippets.length, "snippet") });
      } else if (next.kind === "unreadable") {
        api.report({ state: "waiting", detail: `Shelf file unreadable: ${FILE}` });
      }
      syncTab();
      if (drawer) renderEntries(drawer);
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

      if (drawer) {
        const bottom = top + overlap;
        setStyle(drawer.layer, "bottom", `${viewport.clientHeight - bottom}px`);
        setStyle(drawer.layer, "left", `${formRect.left + inset}px`);
        setStyle(drawer.layer, "width", `${formRect.width - 2 * inset}px`);
        setStyle(drawer.layer, "max-height", `${Math.max(120, bottom - 24)}px`);
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
      save((shelf) =>
        updateSnippet(shelf, snippet.id, (item) => ({
          ...item,
          uses: item.uses + 1,
          lastUsedAt: now(),
        })),
      );
    };

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
        description: h("span", { className: "shelf-path", text: FILE }),
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
