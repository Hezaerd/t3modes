# Computer use

A [t3mode](https://github.com/Hezaerd/t3mode) plugin that lets the agents T3 Code runs (Claude and Codex) see and drive the Windows desktop. While an agent drives, T3 Code shows a pill at the top of its window with the agent's name, the step it is on, and a **Stop** button.

## The tools

The plugin registers a tool server, `t3mode-computer-use`, with Claude and Codex. It has two tools.

- **observe** returns a screenshot of one window, its accessibility outline, and the list of open windows. Each element in the outline has a ref such as `e7`, and each window a ref such as `w2`. A ref keeps naming the same element for as long as the chat runs. A window can also be named by its title.
- **act** runs up to 20 steps in order: click, type, key, scroll, drag, accessibility actions (`invoke` press, toggle, expand, select…), `set` a field's value, `wait` for an element, and `open` a URI or path. It returns the new screen in the same result, so an agent rarely needs a separate look. A step names its target by ref, by selector, or by a pixel in the latest image the agent got. A pixel can carry the id of its image, and a pixel from an older image is refused.

## Stop

- After you press **Stop** in the pill, or in the plugin's Computer use settings, no new input starts. A native call already under way finishes.
- After Stop, the plugin releases any key or mouse button the batch was holding. If a release fails, the backend tries it again the next time it starts.
- Stop stays in force until you press **Resume**, across restarts of T3 Code. Until then every `act` is refused. A batch the agent sent before you pressed Stop never runs, even after Resume.
- Cancelling a call from the chat works the same way for that call. No new input starts after the cancel.
- One agent drives at a time. Another one is refused until the first gives control back, its chat ends, or it has been idle for 120 seconds.

## Limits

- **Windows x64 only.** On other systems the plugin does nothing, and the tools say so.
- **T3 Code must be open.** Input comes from the plugin's backend, which runs only while T3 Code runs with the plugin on. With T3 Code closed, in safe mode, or with the plugin off, the tools refuse. That includes agents in a terminal, because the tools are registered for every Claude and Codex session on the machine. A batch also halts when T3 Code's window stops answering the backend.
- **T3 Code is off limits.** The plugin refuses accessibility actions on T3 Code's elements. It refuses typing and keys while T3 Code is the active window, checked before each character and each key repeat. It refuses a click, scroll, or drag whose point, or whose element's centre, lies inside a T3 Code window, unless the window the agent aimed at is in front. These checks run just before each input but not atomically with it, so a window that comes to the front in between can still receive that one input.
- **Some windows don't take its input.** Windows drops input aimed at a window that runs as administrator, and a system prompt (a UAC or firewall prompt) can cover a whole screen and catch clicks meant for windows under it. The tool still reports such input as sent, because Windows doesn't say otherwise. The after-state shows whether anything changed.
- **Points are tied to the latest image.** A batch is refused before it starts if a point is outside the latest image or names an older one. Right before the first input of a step, the point is refused if the image's window moved or closed since the image was taken. An image whose window moved while it was being captured takes no points.

It needs a t3mode build with plugin backends (plugin SDK 1.4.0). It ships xa11y's native binary, under its MIT license in `xa11y-LICENSE.txt`.
