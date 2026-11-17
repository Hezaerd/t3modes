import { describe, expect, it } from "vite-plus/test";

import { diskRows, formatBytes } from "./disks.ts";

const GB = 1024 ** 3;
const drive = (usedPercent: number) => ({
  path: "D:\\",
  total: 100 * GB,
  free: (100 - usedPercent) * GB,
});

describe("diskRows", () => {
  it("fills the bar with the space used by default", () => {
    expect(diskRows([{ path: "C:\\", total: 1000 * GB, free: 250 * GB }], "used")).toEqual([
      {
        key: "C:\\",
        label: "Disk C:",
        percent: 75,
        tone: null,
        value: "75%",
        spoken: "75% used",
        detail: "250 GB free of 1000 GB",
      },
    ]);
  });

  it("drains the bar as the drive fills when showing the space left", () => {
    const [row] = diskRows([{ path: "C:\\", total: 1000 * GB, free: 250 * GB }], "left");
    expect(row).toMatchObject({ percent: 25, value: "25%", spoken: "25% left" });
  });

  it("warns at the same fullness either way, like T3 Code's own bars", () => {
    const tones = (display: "used" | "left") =>
      [79, 80, 89, 90, 100].map((used) => diskRows([drive(used)], display)[0]?.tone);
    const expected = [null, "warning", "warning", "error", "error"];
    expect(tones("used")).toEqual(expected);
    expect(tones("left")).toEqual(expected);
  });

  it("lists drives by letter and skips drives without a size", () => {
    const rows = diskRows(
      [
        { path: "D:\\", total: GB, free: GB },
        { path: "E:\\", total: 0, free: 0 },
        { path: "C:\\", total: GB, free: GB },
      ],
      "used",
    );
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
