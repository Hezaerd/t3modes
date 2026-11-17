# Disk usage

A [t3mode](https://github.com/Hezaerd/t3mode) plugin that shows how full each local drive is in the thread details card. Each drive gets a bar like the usage limits above it. Hover a drive for its free space.

- **Used or left.** Settings / Plugins / Disk usage / **Show**. **Space used** (the default) fills the bar as the drive fills, like the context window. **Space left** shows the percent free and empties the bar as the drive fills, like the weekly usage limits. Either way it turns amber at 20% free and red at 10%.
- **Hide or show it.** Right-click the thread details card, or choose **Choose what to show**, then toggle **Disk usage**. T3 Code's **Reset to default** turns it back on.
- **Which drives.** Local fixed drives only. Network and removable drives are left out, because an offline one can take seconds to answer. The drives are those of the machine running T3 Code, even when the thread runs in a remote environment.
- **How fresh.** The plugin reads the drives when the card is on screen, then at most once a minute.

It needs a t3mode build whose plugin API has `disks()` (plugin SDK 1.3.0). On an older build the Plugins page shows it as waiting, and it changes nothing.
