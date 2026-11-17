// Stands in for xa11y's native.js in the backend bundle: loads the binary that sits next to
// backend.cjs. The path is built at run time so the bundler leaves it alone.
"use strict";
const { join } = require("node:path");

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error(`computer-use has no xa11y binary for ${process.platform}-${process.arch}.`);
}
module.exports = require(join(__dirname, "xa11y.win32-x64-msvc.node"));
