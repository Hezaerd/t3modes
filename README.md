# Thread details collapsed by default

A [t3mode](https://github.com/Hezaerd/t3mode) plugin. It closes the thread details card when you open a thread. Open it again with T3 Code's own button whenever you need it. In "First visit only" mode, a card you reopen stays open.

## Make it yours

Edit `manifest.json`. The `id` is lowercase letters, digits and hyphens, and must never change once people install the plugin. `api` is the plugin API version the SDK targets.

Write the plugin in `src/index.ts`. `definePlugin` and the API types come from `@t3mode/plugin-sdk`. Read the plugin rules in t3mode's `docs/architecture.md` first. Do the plugin's work in `start`, through the API, so turning the plugin off undoes it. t3mode runs none of a plugin's code while it is off.

## Build and try it

```sh
pnpm install
pnpm build                                 # writes dist/manifest.json and dist/plugin.js
pnpm t3mode plugin link <this folder>/dist # from the t3mode repo, once
```

After each build, reload T3 Code with Ctrl+R.

## Release

Commit `pnpm-lock.yaml`. To release, bump `version` in `manifest.json` and push to `main`. The workflow in `.github/workflows/release.yml` sees that no release has that version yet, builds the plugin, and publishes release `v<version>` with both files. Anyone can then install it from the Plugins page, or with `pnpm t3mode plugin add <owner>/<repo>`.
