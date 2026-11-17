/** A local fixed drive, as t3mode's `api.disks()` returns it. Sizes are in bytes. */
export interface Disk {
  readonly path: string;
  readonly total: number;
  readonly free: number;
}

/** T3 Code's tones for its context window bar, so a full drive looks like a full context. */
export type Tone = "error" | "warning" | null;

export interface DiskRow {
  readonly key: string;
  readonly label: string;
  /** Whole percent used, 0 to 100. */
  readonly percent: number;
  readonly tone: Tone;
  readonly value: string;
  readonly detail: string;
}

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

export const toneFor = (percent: number): Tone =>
  percent >= 90 ? "error" : percent >= 80 ? "warning" : null;

export const diskRow = (disk: Disk): DiskRow => {
  const used = Math.max(0, disk.total - disk.free);
  const percent = Math.round(Math.min(100, (used / disk.total) * 100));
  const drive = disk.path.replace(/[\\/]+$/, "") || disk.path;
  return {
    key: disk.path,
    label: `Disk ${drive}`,
    percent,
    tone: toneFor(percent),
    value: `${percent}%`,
    detail: `${formatBytes(disk.free)} free of ${formatBytes(disk.total)}`,
  };
};

export const diskRows = (disks: ReadonlyArray<Disk>): ReadonlyArray<DiskRow> =>
  disks
    .filter((disk) => disk.total > 0)
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .map(diskRow);
