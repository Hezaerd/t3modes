import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

// dist/ is the plugin as t3mode installs it, flat: plugin.js (page), backend.cjs and mcp.cjs (one
// self-contained CommonJS bundle each), xa11y's native binary and its license. The scripts end in
// .cjs because the repo's package.json is "type": "module". scripts/copy-native.mjs adds the binary.

// xa11y's native.js looks for its binary in per-platform packages, which a flat install doesn't
// have, so the backend bundle swaps it for native-binding.cjs, which loads the binary next to it.
const nativeBinding = {
  name: "xa11y-native-binding",
  resolveId(source: string, importer: string | undefined) {
    if (source === "./native.js" && importer?.replaceAll("\\", "/").includes("/@crowecawcaw/xa11y/")) {
      return fileURLToPath(new URL("src/native-binding.cjs", import.meta.url));
    }
    return null;
  },
};

const node = (name: "backend" | "mcp") => ({
  entry: { [name]: `src/${name}.ts` },
  format: "cjs" as const,
  platform: "node" as const,
  target: "node24",
  outDir: "dist",
  clean: false,
  dts: false,
  sourcemap: false,
  outExtensions: () => ({ js: ".cjs" }),
  deps: { alwaysBundle: () => true, onlyBundle: false as const },
  plugins: [nativeBinding],
});

export default defineConfig({
  pack: [
    {
      entry: { plugin: "src/index.ts" },
      format: "cjs",
      platform: "browser",
      outDir: "dist",
      clean: false,
      dts: false,
      sourcemap: false,
      outExtensions: () => ({ js: ".js" }),
      deps: { alwaysBundle: () => true, onlyBundle: false },
      copy: ["manifest.json", "xa11y-LICENSE.txt"],
    },
    node("backend"),
    node("mcp"),
  ],
});
