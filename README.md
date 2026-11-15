# Prompt shelf

A [t3mode](https://github.com/Hezaerd/t3mode) plugin that keeps reusable prompts on a shelf next to the composer's Stash. Stash holds drafts for a while. The shelf keeps prompts for good.

- **Insert a prompt.** Press Ctrl+Alt+S (Cmd+Alt+S on macOS), or click the **Shelf** tab above the composer. Type to filter, then press Enter. The prompt goes in at the caret, as a paragraph of its own.
- **Shelve a prompt.** Open the shelf and choose **Shelve the current prompt**.
- **Edit, delete and import.** Open Settings / Plugins / Prompt shelf. To import, paste prompts separated by blank lines.

The shelf lives in `<t3mode home>/data/prompt-shelf.json` (`%APPDATA%\t3mode\data\prompt-shelf.json`). If that file isn't a valid shelf, the plugin reports it, writes nothing until the file reads again, and offers **Read again** on its settings page.
