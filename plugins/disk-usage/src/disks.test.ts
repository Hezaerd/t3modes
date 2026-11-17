import { describe, expect, it } from "vite-plus/test";

import { diskRows, formatBytes } from "./disks.ts";

const GB = 1024 ** 3;

describe("diskRows", () => {
  it("shows each drive's used share and its free space", () => {
    expect(diskRows([{ path: "C:\\", total: 1000 * GB, free: 250 * GB }])).toEqual([
      {
        key: "C:\\",
        label: "Disk C:",
        percent: 75,
        tone: null,
        value: "75%",
        detail: "250 GB free of 1000 GB",
      },
    ]);
  });

  it("warns from 80% used and turns red from 90%, like T3 Code's context window", () => {
    const tones = [79, 80, 89, 90, 100].map(
      (used) => diskRows([{ path: "D:\\", total: 100 * GB, free: (100 - used) * GB }])[0]?.tone,
    );
    expect(tones).toEqual([null, "warning", "warning", "error", "error"]);
  });

  it("lists drives by letter and skips drives without a size", () => {
    const rows = diskRows([
      { path: "D:\\", total: GB, free: GB },
      { path: "E:\\", total: 0, free: 0 },
      { path: "C:\\", total: GB, free: GB },
    ]);
    expect(rows.map((row) => row.label)).toEqual(["Disk C:", "Disk D:"]);
  });
});

describe("formatBytes", () => {
  it("counts in binary units, as File Explorer does", () => {
    expect(formatBytes(1023013867520)).toBe("953 GB");
    expect(formatBytes(211622576128)).toBe("197 GB");
    expect(formatBytes(5.5 * GB)).toBe("5.5 GB");
    expect(formatBytes(2 * 1024 ** 4)).toBe("2.0 TB");
  });
});
