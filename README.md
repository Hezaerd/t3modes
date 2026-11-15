# Prompt shelf

A [t3mode](https://github.com/Hezaerd/t3mode) plugin that keeps reusable prompts on a shelf next to the composer's Stash. Stash holds drafts for a while. The shelf keeps prompts for good.

- **Insert a prompt.** Press Ctrl+Alt+S (Cmd+Alt+S on macOS), or click the **Shelf** tab above the composer. Type to filter, then press Enter. The prompt goes in at the caret, as a paragraph of its own.
- **Shelve a prompt.** Open the shelf and choose **Shelve the current prompt**.
- **Edit, delete and import.** Open Settings / Plugins / Prompt shelf. To import, paste prompts separated by blank lines.

The shelf lives in `<t3mode home>/data/prompt-shelf.json` (`%APPDATA%\t3mode\data\prompt-shelf.json`). If that file isn't a valid shelf, the plugin reports it, writes nothing until the file reads again, and offers **Read again** on its settings page.

## Build and try it

```sh
pnpm install
pnpm test                                  # the shelf's rules: decoding, ranking, importing
pnpm typecheck
pnpm build                                 # writes dist/manifest.json and dist/plugin.js
pnpm t3mode plugin link <this folder>/dist # from the t3mode repo, once
```

After each build, reload T3 Code with Ctrl+R.

## The SDK comes from a tarball until 1.1.0 is on npm

The plugin uses `api.data`, `api.settingsPanel`, `api.toast` and `api.ui`, which arrive in `@t3mode/plugin-sdk` 1.1.0. Until that version is on npm, `package.json` installs it from `vendor/t3mode-plugin-sdk-1.1.0.tgz`, packed from t3mode's `packages/plugin-sdk` with `pnpm pack`. The tarball is committed, so the release workflow can install it.

Once 1.1.0 is published:

1. In `package.json`, change `"@t3mode/plugin-sdk": "file:vendor/t3mode-plugin-sdk-1.1.0.tgz"` to `"@t3mode/plugin-sdk": "^1.1.0"`.
2. Delete `vendor/`.
3. If pnpm refuses the version as too new, add `minimumReleaseAgeExclude: ['@t3mode/plugin-sdk@1.1.0']` to a `pnpm-workspace.yaml`.
4. Run `pnpm install` and commit `pnpm-lock.yaml`.

The plugin needs a t3mode that has these API members. On an older t3mode it stops at start with an error on its card.

## Release

Commit `pnpm-lock.yaml`. To release, bump `version` in `manifest.json` and push to `main`. The workflow in `.github/workflows/release.yml` sees that no release has that version yet, builds the plugin, and publishes release `v<version>` with both files. Anyone can then install it from the Plugins page, or with `pnpm t3mode plugin add <owner>/<repo>`.
