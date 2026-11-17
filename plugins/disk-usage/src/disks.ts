/** A local fixed drive, as t3mode's `api.disks()` returns it. Sizes are in bytes. */
export interface Disk {
  readonly path: string;
  readonly total: number;
  readonly free: number;
}

export type Tone = "error" | "warning" | null;

/** What the bar measures: space used fills up, space left drains. */
export type Display = "used" | "left";

export interface DiskRow {
  readonly key: string;
  readonly label: string;
  /** Whole percent of the drive the bar fills, 0 to 100. */
  readonly percent: number;
  readonly tone: Tone;
  readonly value: string;
  /** The value as a screen reader says it, such as "21% left". */
  readonly spoken: string;
  readonly detail: string;
}

/**
 * "used" follows T3 Code's context window bar, "left" its usage limit bars, thresholds included,
 * so a disk row reads like the row above it.
 */
const DISPLAYS: Readonly<
  Record<
    Display,
    { readonly bytes: (disk: Disk) => number; readonly tone: (percent: number) => Tone }
  >
> = {
  used: {
    bytes: (disk) => disk.total - disk.free,
    tone: (percent) => (percent >= 90 ? "error" : percent >= 80 ? "warning" : null),
  },
  left: {
    bytes: (disk) => disk.free,
    tone: (percent) => (percent <= 10 ? "error" : percent <= 20 ? "warning" : null),
  },
};

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** Binary units under Windows' labels, so the numbers match File Explorer's. */
export const formatBytes = (bytes: number): string => {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
};

export const diskRow = (disk: Disk, display: Display): DiskRow => {
  const { bytes, tone } = DISPLAYS[display];
  const percent = Math.round(Math.min(100, Math.max(0, (bytes(disk) / disk.total) * 100)));
  const drive = disk.path.replace(/[\\/]+$/, "") || disk.path;
  return {
    key: disk.path,
    label: `Disk ${drive}`,
    percent,
    tone: tone(percent),
    value: `${percent}%`,
    spoken: `${percent}% ${display}`,
    detail: `${formatBytes(disk.free)} free of ${formatBytes(disk.total)}`,
  };
};

export const diskRows = (disks: ReadonlyArray<Disk>, display: Display): ReadonlyArray<DiskRow> =>
  disks
    .filter((disk) => disk.total > 0)
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .map((disk) => diskRow(disk, display));
