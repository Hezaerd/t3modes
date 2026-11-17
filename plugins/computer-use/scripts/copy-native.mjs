// Copies xa11y's binary into dist/ unless an identical copy is already there. A running backend
// keeps the copy in dist/ locked on Windows, so a rebuild of a linked plugin must not touch it.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const name = "xa11y.win32-x64-msvc.node";
const from = fileURLToPath(new URL(`../node_modules/@crowecawcaw/xa11y-win32-x64-msvc/${name}`, import.meta.url));
const to = fileURLToPath(new URL(`../dist/${name}`, import.meta.url));
if (!existsSync(to) || !readFileSync(from).equals(readFileSync(to))) copyFileSync(from, to);
