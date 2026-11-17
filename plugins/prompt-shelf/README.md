# Prompt shelf

A [t3mode](https://github.com/Hezaerd/t3mode) plugin that keeps reusable prompts on a shelf next to the composer's Stash. Stash holds drafts for a while. The shelf keeps prompts for good.

- **Insert a prompt.** Press Ctrl+Alt+S (Cmd+Alt+S on macOS), or click the **Shelf** tab above the composer. Type to filter, then press Enter. The prompt goes in at the caret, as a paragraph of its own.
- **Pick a prompt while typing.** Type `;` and a query in the composer. Use the arrow keys to choose a prompt, then press Enter or Tab, or click it. The prompt replaces `;query` in place. Press Escape to dismiss the menu.
- **Shelve a prompt.** Open the shelf and choose **Shelve the current prompt**.
- **Edit, delete and import.** Open Settings / Plugins / Prompt shelf. To import, paste prompts separated by blank lines.

The shelf lives in `<t3mode home>/plugin-data/prompt-shelf.json`, which is `~/.t3/t3mode/plugin-data/prompt-shelf.json` unless `T3CODE_HOME` or `T3MODE_HOME` moves it. If that file isn't a valid shelf, the plugin reports it and writes nothing to it. Fix or delete the file, then reload T3 Code with Ctrl+R. Removing the plugin deletes the file, so copy it first if you want to keep your prompts.
