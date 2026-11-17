import type { Ref } from "./tools.ts";

export interface NodeFacts {
  readonly parent: number | null;
  readonly role: string;
  readonly name: string | null;
  readonly value: string | null;
  readonly stableId: string | null;
  readonly pid: number | null;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly focused: boolean;
  readonly checked: "on" | "off" | "mixed" | null;
  readonly expanded: boolean | null;
  readonly selected: boolean;
}

export type IdentityKey = string & { readonly __identity: unique symbol };

/**
 * A candidate identity per node: the platform's stable id when there is one, else the path of
 * role, name and index among same-role siblings from the root. A key only proposes a ref to
 * reuse; RefTable confirms it with the engine before reusing it.
 */
export function identityKeys(nodes: ReadonlyArray<NodeFacts>, rootKey: string): ReadonlyArray<IdentityKey> {
  const keys: string[] = [];
  const siblings = new Map<string, number>();
  for (const node of nodes) {
    if (node.stableId) {
      keys.push(`id:${node.pid ?? "?"}:${node.stableId}`);
      continue;
    }
    if (node.parent === null) {
      keys.push(rootKey);
      continue;
    }
    const slot = `${node.parent}/${node.role}:${node.name ?? ""}`;
    const index = siblings.get(slot) ?? 0;
    siblings.set(slot, index + 1);
    keys.push(`${keys[node.parent]}/${node.role}:${node.name ?? ""}#${index}`);
  }
  return keys as IdentityKey[];
}


/**
 * Refs for one session. The same element keeps its ref across observations, and a ref names one
 * native element for good: a key proposes the old ref, and `same` (xa11y's sameAs) must confirm
 * the new element is that node, or it gets a new ref.
 */
export class RefTable<H> {
  private readonly byKey = new Map<IdentityKey, Ref>();
  private readonly keyOf = new Map<Ref, IdentityKey>();
  private readonly handles = new Map<Ref, H>();
  private next = 1;

  constructor(
    private readonly same: (a: H, b: H) => Promise<boolean>,
    private readonly maxHandles = 5000,
  ) {}

  get trackedKeys(): number {
    return this.byKey.size;
  }

  async adopt(
    keys: ReadonlyArray<IdentityKey>,
    isWindow: ReadonlyArray<boolean>,
    handles: ReadonlyArray<H>,
  ): Promise<ReadonlyArray<Ref>> {
    const confirmed = await Promise.all(
      keys.map(async (key, i) => {
        const ref = this.byKey.get(key);
        const old = ref === undefined ? undefined : this.handles.get(ref);
        if (ref === undefined || old === undefined) return null;
        if ((ref[0] === "w") !== isWindow[i]) return null;
        try {
          return (await this.same(handles[i]!, old)) ? ref : null;
        } catch {
          return null;
        }
      }),
    );
    const refs: Ref[] = [];
    const taken = new Set<Ref>();
    for (const [i, key] of keys.entries()) {
      let ref = confirmed[i] ?? null;
      if (ref === null || taken.has(ref)) {
        ref = `${isWindow[i] ? "w" : "e"}${this.next++}` as Ref;
        this.byKey.set(key, ref);
        this.keyOf.set(ref, key);
      }
      taken.add(ref);
      this.handles.delete(ref);
      this.handles.set(ref, handles[i]!);
      refs.push(ref);
    }
    for (const ref of this.handles.keys()) {
      if (this.handles.size <= this.maxHandles) break;
      this.handles.delete(ref);
      const key = this.keyOf.get(ref);
      this.keyOf.delete(ref);
      if (key !== undefined && this.byKey.get(key) === ref) this.byKey.delete(key);
    }
    return refs;
  }

  resolve(ref: Ref): H | undefined {
    return this.handles.get(ref);
  }

  has(ref: Ref): boolean {
    return this.handles.has(ref);
  }
}

export interface OutlineLimits {
  readonly maxLines: number;
  readonly maxChars: number;
}

export const OUTLINE_LIMITS: OutlineLimits = { maxLines: 300, maxChars: 12_000 };

const INTERACTIVE = new Set([
  "button",
  "check_box",
  "combo_box",
  "link",
  "list_item",
  "menu_item",
  "radio_button",
  "slider",
  "spin_button",
  "split_button",
  "tab",
  "text_field",
  "text_area",
  "toggle_button",
  "tree_item",
  "cell",
  "switch",
]);

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
};

const lineFor = (node: NodeFacts, ref: Ref): string => {
  const parts = [ref, node.role];
  if (node.name) parts.push(JSON.stringify(clip(node.name, 80)));
  if (node.value && node.value !== node.name) parts.push(`value=${JSON.stringify(clip(node.value, 80))}`);
  if (node.focused) parts.push("focused");
  if (!node.enabled) parts.push("disabled");
  if (node.checked) parts.push(`checked=${node.checked}`);
  if (node.expanded !== null) parts.push(node.expanded ? "expanded" : "collapsed");
  if (node.selected) parts.push("selected");
  return parts.join(" ");
};

/**
 * Renders a capture as indented lines. Invisible subtrees are dropped. Unnamed, valueless
 * containers aren't printed, and their children take their place, so wrappers cost no tokens.
 * Interactive roles always print.
 */
export function renderOutline(
  nodes: ReadonlyArray<NodeFacts>,
  refs: ReadonlyArray<Ref>,
  limits: OutlineLimits = OUTLINE_LIMITS,
): { readonly text: string; readonly truncated: boolean } {
  const depth = new Map<number, number>();
  const dropped = new Set<number>();
  const lines: string[] = [];
  let chars = 0;
  let truncated = false;
  for (const [i, node] of nodes.entries()) {
    const parent = node.parent;
    if (parent !== null && dropped.has(parent)) {
      dropped.add(i);
      continue;
    }
    if (parent !== null && !node.visible) {
      dropped.add(i);
      continue;
    }
    const base = parent === null ? 0 : depth.get(parent)! + 1;
    const silent = parent !== null && !node.name && !node.value && !INTERACTIVE.has(node.role);
    depth.set(i, silent ? base - 1 : base);
    if (silent) continue;
    const line = "  ".repeat(base) + lineFor(node, refs[i]!);
    if (lines.length >= limits.maxLines || chars + line.length + 1 > limits.maxChars) {
      truncated = true;
      break;
    }
    lines.push(line);
    chars += line.length + 1;
  }
  return { text: lines.join("\n"), truncated };
}
