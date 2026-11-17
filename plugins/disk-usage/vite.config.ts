import { defineConfig } from "vite-plus";

// dist/ is the plugin as t3mode installs it: plugin.js, one CommonJS bundle with everything it
// imports, and a copy of manifest.json.
export default defineConfig({
  pack: {
    entry: { plugin: "src/index.ts" },
    format: "cjs",
    platform: "browser",
    outDir: "dist",
    dts: false,
    sourcemap: false,
    outExtensions: () => ({ js: ".js" }),
    deps: { alwaysBundle: () => true, onlyBundle: false },
    copy: ["manifest.json"],
  },
});
