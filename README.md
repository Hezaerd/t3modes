# Thread details collapsed by default

A [t3mode](https://github.com/Hezaerd/t3mode) plugin. It closes the thread details card when you open a thread. Open it again with T3 Code's own button whenever you need it. In "First visit only" mode, a card you reopen stays open.

## Make it yours

Edit `manifest.json`. The `id` is lowercase letters, digits and hyphens, and must never change once people install the plugin. `api` is the plugin API version the SDK targets.

Write the plugin in `src/index.ts`. `definePlugin` and the API types come from `@t3mode/plugin-sdk`. Read the plugin rules in t3mode's `docs/architecture.md` first. Keep the top level of `src/index.ts` free of side effects. t3mode loads the code of every installed plugin, including one that is turned off, and calls `start` only when it is on.

Until the SDK is on npm, install it from a tarball:

```sh
# in the t3mode repo
cd packages/plugin-sdk && pnpm pack
# in your plugin
pnpm add -D ../t3mode/packages/plugin-sdk/t3mode-plugin-sdk-1.0.0.tgz
```

Commit the tarball inside your repository and point `package.json` at it, so the release workflow can install it.

## Build and try it

```sh
pnpm install
pnpm build                                 # writes dist/manifest.json and dist/plugin.js
pnpm t3mode plugin link <this folder>/dist # from the t3mode repo, once
```

After each build, reload T3 Code with Ctrl+R.

## Release

Commit `pnpm-lock.yaml`. Then bump `version` in `manifest.json`, commit, and push a matching tag:

```sh
git tag v1.0.1 && git push origin v1.0.1
```

The workflow in `.github/workflows/release.yml` builds the plugin and attaches both files to a GitHub release. Anyone can then install it from the Plugins page, or with `pnpm t3mode plugin add <owner>/<repo>`.
