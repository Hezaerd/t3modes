# t3modes

My collection of [t3mode](https://github.com/Hezaerd/t3mode) plugins.

| Plugin | What it does |
|---|---|
| [Disk usage](plugins/disk-usage) | Shows how full each local drive is in the thread details card. |
| [Prompt shelf](plugins/prompt-shelf) | A shelf of reusable prompts next to the composer's Stash. |
| [Thread details collapsed](plugins/thread-details-collapsed) | Closes the thread details card when you open a thread. |

## Install

Paste `Hezaerd/t3modes` on T3 Code's Settings / Plugins page, then install the plugins you want. From a t3mode checkout, `pnpm t3mode plugin add Hezaerd/t3modes` does the same.

This needs a t3mode build that reads `t3mode.json`.

## Develop

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

From a t3mode checkout, `pnpm t3mode plugin link <this folder>` links every plugin at once. Rebuild after each change and reload T3 Code with Ctrl+R.

`t3mode.json` maps each plugin id to its built folder. Keep ids stable, because each plugin's data is stored under its id.

## Release

Bump a plugin's `version` in its `manifest.json` and push to `main`. The release workflow builds every plugin and publishes a release tagged `r-<short sha>` when a version changed. Each release carries `t3mode.json` and every plugin's `<id>.manifest.json` and `<id>.plugin.js`, changed or not, because t3mode downloads plugins from the latest release.

`node scripts/stage-release.mjs` runs the same validation locally after a build and stages the files in `.release/`.
