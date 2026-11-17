import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const staging = join(root, ".release");

function gh(args, allowMissing = false) {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return result.stdout;
  if (allowMissing && /release not found|no releases found/i.test(result.stderr)) return null;
  throw new Error(`gh ${args.join(" ")} failed\n${result.stderr.trim()}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--release")) {
    throw new Error("Usage: node scripts/stage-release.mjs [--release]");
  }
  const config = JSON.parse(readFileSync(join(root, "t3mode.json"), "utf8"));
  if (!config?.plugins || typeof config.plugins !== "object" || Array.isArray(config.plugins)) {
    throw new Error("t3mode.json must contain a plugins object.");
  }
  const entries = Object.entries(config.plugins);
  if (entries.length > 50) {
    throw new Error("t3mode.json must list at most 50 plugins.");
  }
  const plugins = [];
  for (const [id, route] of entries) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      throw new Error(`Invalid plugin id ${JSON.stringify(id)} in t3mode.json.`);
    }
    if (
      typeof route !== "string" ||
      /[\\:]/.test(route) ||
      route.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Invalid relative POSIX route for ${id}: ${JSON.stringify(route)}.`);
    }
    for (const file of ["manifest.json", "plugin.js"]) {
      if (!statSync(join(root, route, file)).isFile()) {
        throw new Error(`${route}/${file} must be a file.`);
      }
    }
    const manifest = JSON.parse(readFileSync(join(root, route, "manifest.json"), "utf8"));
    if (manifest.id !== id) {
      throw new Error(
        `${route}/manifest.json has id ${JSON.stringify(manifest.id)}; expected ${JSON.stringify(id)}.`,
      );
    }
    if (typeof manifest.version !== "string" || !manifest.version) {
      throw new Error(`${route}/manifest.json must contain a version string.`);
    }
    plugins.push({ id, route, version: manifest.version });
  }

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging);
  copyFileSync(join(root, "t3mode.json"), join(staging, "t3mode.json"));
  for (const { id, route } of plugins) {
    for (const file of ["manifest.json", "plugin.js"]) {
      copyFileSync(join(root, route, file), join(staging, `${id}.${file}`));
    }
  }
  console.log(`Staged ${1 + plugins.length * 2} files in .release/.`);
  if (!args.includes("--release")) return;

  const sha = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) {
    throw new Error("--release requires GITHUB_SHA to be a full commit SHA.");
  }
  const tag = `r-${sha.slice(0, 7)}`;
  let publish = false;
  if (gh(["release", "view", tag, "--json", "tagName"], true) !== null) {
    console.log(`${tag} already exists. Skipping release.`);
  } else {
    const latest = gh(["release", "view", "--json", "tagName,assets"], true);
    if (latest === null) {
      publish = true;
      console.log("No release exists yet.");
    } else {
      const { tagName, assets } = JSON.parse(latest);
      const downloads = mkdtempSync(join(tmpdir(), "t3mode-release-"));
      try {
        for (const { id, version } of plugins) {
          const name = `${id}.manifest.json`;
          if (!assets.some((asset) => asset.name === name)) {
            publish = true;
            console.log(`${tagName} lacks ${name}.`);
            continue;
          }
          gh(["release", "download", tagName, "--pattern", name, "--dir", downloads]);
          const previous = JSON.parse(readFileSync(join(downloads, name), "utf8"));
          if (previous.version !== version) {
            publish = true;
            console.log(`${id} changed from ${previous.version} to ${version}.`);
          }
        }
      } finally {
        rmSync(downloads, { recursive: true, force: true });
      }
    }
    if (!publish) console.log("All plugin versions match the latest release. Skipping release.");
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\ntag=${tag}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(`Release staging failed: ${error.message}`);
  process.exitCode = 1;
}
