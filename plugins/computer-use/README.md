# Computer use

A [t3mode](https://github.com/Hezaerd/t3mode) plugin that lets the agents T3 Code runs (Claude and Codex) see and drive the Windows desktop. While an agent drives, T3 Code shows a pill at the top of its window with the agent's name, the step it is on, and a **Stop** button.

## The tools

The plugin registers a tool server, `t3mode-computer-use`, with Claude and Codex. It has two tools.

- **observe** returns a screenshot of one window, its accessibility outline, and the list of open windows. Each element in the outline has a ref such as `e7`, and each window a ref such as `w2`. A ref keeps naming the same element for as long as the chat runs.
- **act** runs up to 20 steps in order: click, type, key, scroll, drag, accessibility actions (`invoke` press, toggle, expand, select…), `set` a field's value, `wait` for an element, and `open` a URI or path. It returns the new screen in the same result, so an agent rarely needs a separate look. A step names its target by ref, by selector, or by a pixel in the latest image the agent got.

## Stop

- **Stop** in the pill, or in Settings / Plugins / Computer use, halts input before the next keystroke, click or key. A native call already under way finishes. A key or button the agent held down is released.
- Stop stays in force until you press **Resume**, across restarts of T3 Code. Until then every `act` is refused, including ones the agent sent before you pressed Stop.
- One agent drives at a time. Another one is refused until the first gives control back, its chat ends, or it has been idle for 120 seconds.

## Limits

- **Windows x64 only.** On other systems the plugin does nothing, and the tools say so.
- **T3 Code must be open.** Input comes from the plugin's backend, which runs only while T3 Code runs with the plugin on. With T3 Code closed, in safe mode, or with the plugin off, the tools refuse. So no agent drives without the pill on screen. That includes agents in a terminal, because the tools are registered for every Claude and Codex session on the machine.
- **T3 Code is off limits.** Agents can't press its buttons or type into it, so they can't approve their own prompts or press Stop.
- **Windows that run as administrator** don't take input from it, and neither does anything else while such a window, a UAC prompt, or a Windows Security prompt is in front. The tool still reports the input as sent, because Windows doesn't say otherwise.
- **Points are tied to the latest image.** If its window moved or closed, a step that points into it is refused before anything is sent.

It needs a t3mode build with plugin backends (plugin SDK 1.4.0). It ships xa11y's native binary, under its MIT license in `xa11y-LICENSE.txt`.
