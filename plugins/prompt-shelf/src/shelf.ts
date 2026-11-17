// The shelf's data and the rules over it, with no DOM: decoding the file, ranking and filtering,
// and splitting pasted text into snippets.

export interface Snippet {
  readonly id: string;
  readonly text: string;
  readonly uses: number;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
}

export interface Shelf {
  readonly version: 1;
  readonly snippets: ReadonlyArray<Snippet>;
}

export const emptyShelf: Shelf = { version: 1, snippets: [] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSnippet = (value: unknown): value is Snippet =>
  isRecord(value) &&
  typeof value["id"] === "string" &&
  typeof value["text"] === "string" &&
  Number.isInteger(value["uses"]) &&
  (value["uses"] as number) >= 0 &&
  (value["lastUsedAt"] === null || typeof value["lastUsedAt"] === "string") &&
  typeof value["createdAt"] === "string";

/** The shelf in a data file, or null when the file holds something else. No file is an empty shelf. */
export const decodeShelf = (value: unknown): Shelf | null => {
  if (value === undefined) return emptyShelf;
  if (!isRecord(value) || value["version"] !== 1 || !Array.isArray(value["snippets"])) return null;
  const snippets: Array<Snippet> = [];
  for (const item of value["snippets"]) {
    if (!isSnippet(item)) return null;
    snippets.push({
      id: item.id,
      text: item.text,
      uses: item.uses,
      lastUsedAt: item.lastUsedAt,
      createdAt: item.createdAt,
    });
  }
  return { version: 1, snippets };
};

const newestFirst = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1;

/** Most used first, then most recently used, then newest. Every word of the query must appear. */
export const rank = (snippets: ReadonlyArray<Snippet>, query: string): ReadonlyArray<Snippet> => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return snippets
    .filter((snippet) => {
      const text = snippet.text.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .toSorted(
      (a, b) =>
        b.uses - a.uses ||
        newestFirst(a.lastUsedAt, b.lastUsedAt) ||
        newestFirst(a.createdAt, b.createdAt),
    );
};

const QUOTES: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["“", "”"],
  ["‘", "’"],
  ["'", "'"],
];

const unquote = (text: string) => {
  const pair = QUOTES.find(
    ([open, close]) => text.length >= 2 && text.startsWith(open) && text.endsWith(close),
  );
  return pair ? text.slice(1, -1).trim() : text;
};

/** Pasted text split on blank lines, each piece trimmed and unquoted once, empty pieces dropped. */
export const parseImport = (text: string): ReadonlyArray<string> =>
  text
    .split(/\n\s*\n/)
    .map((piece) => unquote(piece.trim()))
    .filter((piece) => piece.length > 0);

/** Adds the texts that aren't on the shelf yet, in order, skipping repeats among them too. */
export const addTexts = (
  shelf: Shelf,
  texts: ReadonlyArray<string>,
  now: string,
  newId: () => string,
): { readonly shelf: Shelf; readonly added: number } => {
  const known = new Set(shelf.snippets.map((snippet) => snippet.text));
  const fresh: Array<Snippet> = [];
  for (const text of texts) {
    if (known.has(text)) continue;
    known.add(text);
    fresh.push({ id: newId(), text, uses: 0, lastUsedAt: null, createdAt: now });
  }
  return { shelf: { version: 1, snippets: [...shelf.snippets, ...fresh] }, added: fresh.length };
};

export const updateSnippet = (
  shelf: Shelf,
  id: string,
  change: (snippet: Snippet) => Snippet,
): Shelf => ({
  version: 1,
  snippets: shelf.snippets.map((snippet) => (snippet.id === id ? change(snippet) : snippet)),
});

export const removeSnippet = (shelf: Shelf, id: string): Shelf => ({
  version: 1,
  snippets: shelf.snippets.filter((snippet) => snippet.id !== id),
});

export const shelfToken = (
  textBeforeCaret: string,
): { readonly start: number; readonly query: string } | null => {
  const token = /(?:^|[ \n\t\r]);([^ \n\t\r]*)$/.exec(textBeforeCaret);
  if (!token) return null;
  const query = token[1]!;
  return { start: textBeforeCaret.length - query.length - 1, query };
};
