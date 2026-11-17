import type { MouseButton } from "./tools.ts";

export interface Held {
  readonly keys: ReadonlyArray<string>;
  readonly buttons: ReadonlyArray<MouseButton>;
}

/** save runs before each down call and after each up call that succeeds, so a killed backend leaves everything that may be down in the journal. */
export class HeldJournal {
  private readonly keys = new Set<string>();
  private readonly buttons = new Set<MouseButton>();

  constructor(private readonly save: (held: Held | null) => void) {}

  private set(kind: "key" | "button"): Set<string> {
    return (kind === "key" ? this.keys : this.buttons) as Set<string>;
  }

  private write(): void {
    this.save(this.keys.size === 0 && this.buttons.size === 0 ? null : { keys: [...this.keys], buttons: [...this.buttons] });
  }

  async down(kind: "key" | "button", name: string, call: () => Promise<void>): Promise<void> {
    this.set(kind).add(name);
    this.write();
    await call();
  }

  async up(kind: "key" | "button", name: string, call: () => Promise<void>): Promise<void> {
    await call();
    this.set(kind).delete(name);
    this.write();
  }
}
