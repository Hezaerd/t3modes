// T3 Code's composer: a ProseMirror editor inside the composer form. Text goes in through
// `insertText`, the browser's own editing command, so ProseMirror and T3 Code's draft store see
// an ordinary edit.

export const sel = {
  form: "[data-chat-composer-form]",
  editor: ".ProseMirror",
  surface: "[data-chat-composer-main-surface]",
  stashTab: '[data-prompt-stash-badge="true"]',
  banners: ":scope > [data-slot=composer-banner-attachment] > :not([data-composer-banner-surface])",
} as const;

export const composerForm = (): HTMLElement | null => document.querySelector<HTMLElement>(sel.form);

export const editorIn = (form: HTMLElement): HTMLElement | null =>
  form.querySelector<HTMLElement>(sel.editor);

/** The prompt as typed: one line per paragraph. */
export const promptText = (editor: HTMLElement): string =>
  [...editor.querySelectorAll("p")]
    .map((paragraph) => paragraph.textContent)
    .join("\n")
    .trim();

const inside = (editor: HTMLElement, range: Range) =>
  editor.contains(range.startContainer) && editor.contains(range.endContainer);

/** The caret or selection, when it is in the editor. */
export const editorRange = (editor: HTMLElement): Range | null => {
  const selection = getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return inside(editor, range) ? range.cloneRange() : null;
};

const select = (range: Range) => {
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

/** Focuses the editor with `range` selected. A plain focus would put the caret at the start. */
export const restoreCaret = (editor: HTMLElement, range: Range | null): void => {
  editor.focus();
  if (range && inside(editor, range)) select(range);
};

const paragraphText = (paragraph: Element | null, range: Range, side: "before" | "after") => {
  if (!paragraph) return "";
  const part = document.createRange();
  part.selectNodeContents(paragraph);
  if (side === "before") part.setEnd(range.startContainer, range.startOffset);
  else part.setStart(range.endContainer, range.endOffset);
  return part.toString();
};

/**
 * Inserts `text` at `range`, or at the end without one, as paragraphs of its own: a newline
 * splits the paragraph when it has text before or after the caret. False when the editor refused.
 */
export const insertSnippet = (editor: HTMLElement, range: Range | null, text: string): boolean => {
  editor.focus();
  let target = range && inside(editor, range) ? range : null;
  if (!target) {
    target = document.createRange();
    target.selectNodeContents([...editor.querySelectorAll("p")].at(-1) ?? editor);
    target.collapse(false);
  }
  select(target);
  const node = target.startContainer;
  const paragraph = (node instanceof Element ? node : node.parentElement)?.closest("p") ?? null;
  const before = paragraphText(paragraph, target, "before").trim() ? "\n" : "";
  const after = paragraphText(paragraph, target, "after").trim() ? "\n" : "";
  return document.execCommand("insertText", false, `${before}${text}${after}`);
};
