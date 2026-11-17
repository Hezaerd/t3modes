// The Shelf's tab and drawer are rebuilt from T3 Code's own Stash markup. T3 Code's stylesheet only
// holds the Tailwind classes T3 Code uses, so the class strings come from the live Stash when it
// is on screen, and otherwise from this capture.

/** Class strings of T3 Code's Stash tab and drawer, captured from 0.1.10-nightly.20261115.4736. */
export const CAPTURED = {
  tabSurface:
    "[--chat-composer-attached-surface:var(--chat-composer-glass-surface,var(--card))] dark:[--chat-composer-attached-surface:var(--chat-composer-glass-surface,var(--surface-raised))] [html[data-theme-id]_&]:[--chat-composer-attached-surface:var(--app-theme-surface-raised)] relative isolate border-0 bg-transparent shadow-none [--chat-composer-attached-tint:transparent] [--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--contrast-foreground)_8%,transparent))] dark:[--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--color-white)_5%,transparent))] [html[data-theme-id]_&]:[--chat-composer-attached-outline:var(--chat-composer-outline,var(--app-theme-toolbar-border))] dark:[html[data-theme-id]:not([data-theme-id=t3-chat])_&]:[--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--app-theme-input)_30%,var(--background)))] dark:[html[data-theme-id=t3-chat]_&]:[--chat-composer-attached-outline:#241e28] [--chat-composer-attachment-overlap:calc(1rem+1px)] before:rounded-t-2xl before:mask-t-from-transparent before:mask-t-from-4 before:mask-t-to-black before:mask-t-to-4 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:border before:border-(--chat-composer-attached-outline) before:bg-(--chat-composer-attached-surface)/(--glass-opacity) before:bg-linear-to-b before:from-(--chat-composer-attached-tint) before:to-(--chat-composer-attached-tint) before:backdrop-blur-(--glass-blur) before:backdrop-saturate-(--glass-saturation) before:shadow-composer dark:before:shadow-composer-dark dark:supports-[(backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px))]:before:bg-composer-seam-above not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:before:bg-(--chat-composer-attached-surface) min-w-0 px-1 py-(--composer-banner-padding-block) after:block after:h-(--chat-composer-attachment-overlap) text-xs/4 [--composer-banner-corner-top:var(--radius-xl)] [--composer-banner-icon-column:--spacing(7)] sm:[--composer-banner-icon-column:--spacing(6)] [--composer-banner-padding-block:--spacing(1.25)] w-fit max-w-full flex-none [&>[data-composer-banner-row]:first-child>[data-slot=composer-banner-actions]>[data-slot=button]:last-child]:rounded-se-(--composer-banner-corner-top) [&>[data-composer-banner-row]:first-child>[data-slot=composer-banner-actions]>:last-child>[data-slot=button]:last-of-type]:rounded-se-(--composer-banner-corner-top) [&>:first-child>[data-composer-banner-row]:first-child>[data-slot=composer-banner-actions]>[data-slot=button]:last-child]:rounded-se-(--composer-banner-corner-top) data-[composer-banner-surface=detached]:[&>[data-composer-banner-row]:only-child>[data-slot=composer-banner-actions]>[data-slot=button]:last-child]:rounded-ee-xl data-[composer-banner-surface=detached]:[&>[data-composer-banner-row]:only-child>[data-slot=composer-banner-actions]>:last-child>[data-slot=button]:last-of-type]:rounded-ee-xl ml-auto",
  drawerSurface:
    "[--chat-composer-attached-surface:var(--chat-composer-glass-surface,var(--card))] dark:[--chat-composer-attached-surface:var(--chat-composer-glass-surface,var(--surface-raised))] [html[data-theme-id]_&]:[--chat-composer-attached-surface:var(--app-theme-surface-raised)] relative isolate border-0 bg-transparent shadow-none [--chat-composer-attached-tint:transparent] [--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--contrast-foreground)_8%,transparent))] dark:[--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--color-white)_5%,transparent))] [html[data-theme-id]_&]:[--chat-composer-attached-outline:var(--chat-composer-outline,var(--app-theme-toolbar-border))] dark:[html[data-theme-id]:not([data-theme-id=t3-chat])_&]:[--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--app-theme-input)_30%,var(--background)))] dark:[html[data-theme-id=t3-chat]_&]:[--chat-composer-attached-outline:#241e28] [--chat-composer-attachment-overlap:calc(1rem+1px)] before:rounded-t-2xl before:mask-t-from-transparent before:mask-t-from-4 before:mask-t-to-black before:mask-t-to-4 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:border before:border-(--chat-composer-attached-outline) before:bg-(--chat-composer-attached-surface)/(--glass-opacity) before:bg-linear-to-b before:from-(--chat-composer-attached-tint) before:to-(--chat-composer-attached-tint) before:backdrop-blur-(--glass-blur) before:backdrop-saturate-(--glass-saturation) before:shadow-composer dark:before:shadow-composer-dark dark:supports-[(backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px))]:before:bg-composer-seam-above not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:before:bg-(--chat-composer-attached-surface) min-w-0 px-1 py-(--composer-banner-padding-block) after:block after:h-(--chat-composer-attachment-overlap) text-xs/4 [--composer-banner-corner-top:var(--radius-xl)] [--composer-banner-icon-column:--spacing(7)] [--composer-banner-padding-block:--spacing(1)] sm:[--composer-banner-icon-column:--spacing(6)] @container [&>[data-composer-banner-row]:first-child>[data-slot=composer-banner-actions]>[data-slot=button]:last-child]:rounded-se-(--composer-banner-corner-top) [&>[data-composer-banner-row]:first-child>[data-slot=composer-banner-actions]>:last-child>[data-slot=button]:last-of-type]:rounded-se-(--composer-banner-corner-top) [&>:first-child>[data-composer-banner-row]:first-child>[data-slot=composer-banner-actions]>[data-slot=button]:last-child]:rounded-se-(--composer-banner-corner-top) data-[composer-banner-surface=detached]:[&>[data-composer-banner-row]:only-child>[data-slot=composer-banner-actions]>[data-slot=button]:last-child]:rounded-ee-xl data-[composer-banner-surface=detached]:[&>[data-composer-banner-row]:only-child>[data-slot=composer-banner-actions]>:last-child>[data-slot=button]:last-of-type]:rounded-ee-xl flex min-h-0 flex-col after:shrink-0",
  row: "group/banner-row grid min-h-(--composer-banner-icon-column) w-full min-w-0 grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)_auto] items-center gap-x-1 text-start not-has-[>[data-slot=composer-banner-actions]]:grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)] [&:is(button)]:cursor-pointer [&:is(button)]:rounded-xl [&:is(button)]:hover:bg-foreground/5 [&:is(button)]:focus-visible:outline-2 [&:is(button)]:focus-visible:-outline-offset-2 [&:is(button)]:focus-visible:outline-ring",
  icon: "col-start-1 row-start-1 flex w-(--composer-banner-icon-column) min-w-0 flex-none items-center justify-center text-muted-foreground [&>svg]:size-3 group-data-[composer-banner-layout=approval]/banner-row:pt-0.5 group-data-[composer-banner-layout=approval]/banner-row:text-warning group-data-[composer-banner-layout=approval]/banner-row:[&>svg]:size-4",
  content:
    "col-start-2 row-start-1 flex min-w-0 items-center gap-1 *:data-[slot=composer-banner-separator]:mx-0 @max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:col-end-4 group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:col-[1/3] group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:ps-2 sm:group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:ps-1.5 group-not-has-[>[data-slot=composer-banner-icon],>[data-slot=composer-banner-actions]]/banner-row:pe-2 sm:group-not-has-[>[data-slot=composer-banner-icon],>[data-slot=composer-banner-actions]]/banner-row:pe-1.5",
  actions:
    "col-start-3 row-start-1 flex flex-wrap items-center justify-end gap-1 group-data-[composer-banner-layout=approval]/banner-row:self-center group-data-[composer-banner-layout=approval]/banner-row:gap-1.5 @max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:col-start-2 @max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:col-end-4 @max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:row-start-2 group-data-[composer-banner-layout=wrap-actions]/banner-row:ms-auto",
  count:
    "inline-flex min-w-(--composer-banner-icon-column,1em) flex-none justify-center font-medium text-muted-foreground tabular-nums",
  chevron:
    "[&_svg]:-mx-0.5 relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--control-radius)] border font-medium text-base outline-none transition-[box-shadow,scale] [&:not([aria-haspopup]):not(:disabled):not([aria-disabled=true])]:will-change-[scale] [&:active:not([aria-haspopup])]:scale-[0.97] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--control-radius)-1px)] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 aria-disabled:cursor-not-allowed aria-disabled:opacity-64 sm:text-sm [&_svg:not([class*='text-'])]:text-[var(--control-icon-color)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 size-7 sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5 [--control-icon-color:var(--contrast-muted-foreground)] border-transparent text-foreground data-pressed:bg-accent [:hover,[data-pressed]]:bg-accent pointer-events-none",
  scroll:
    "relative size-full min-h-0 overflow-hidden rounded-none h-auto max-h-[min(24rem,40dvh)] flex flex-col",
  viewport:
    "h-full max-h-[inherit] overflow-auto overscroll-contain rounded-[inherit] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-has-overflow-x:overscroll-x-contain mask-t-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-start)))] mask-b-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-end)))] mask-l-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-start)))] mask-r-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-end)))] focus-visible:mask-none [--fade-size:1.5rem] scroll-p-[var(--fade-size)] base-ui-disable-scrollbar",
  viewportInner: "[[data-has-overflow-y]>&]:pe-2",
  list: "grid gap-px [&_[data-composer-banner-row]]:min-h-5",
  restore:
    "min-w-0 flex-1 cursor-pointer truncate text-left text-foreground/80 outline-none before:absolute before:inset-0 before:rounded-sm focus-visible:before:ring-2 focus-visible:before:ring-inset focus-visible:before:ring-ring",
  time: "shrink-0 text-muted-foreground tabular-nums max-sm:hidden",
  dismiss:
    "[&_svg]:-mx-0.5 relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--control-radius)] border font-medium text-base outline-none transition-[box-shadow,scale] [&:not([aria-haspopup]):not(:disabled):not([aria-disabled=true])]:will-change-[scale] [&:active:not([aria-haspopup])]:scale-[0.97] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--control-radius)-1px)] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 aria-disabled:cursor-not-allowed aria-disabled:opacity-64 sm:text-sm [&_svg:not([class*='text-'])]:text-[var(--control-icon-color)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 size-7 sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5 [--control-icon-color:var(--contrast-muted-foreground)] border-transparent text-foreground data-pressed:bg-accent [:hover,[data-pressed]]:bg-accent z-10",
  layer: "pointer-events-auto fixed z-40 flex flex-col",
} as const;

// T3 Code 0.1.10-nightly.20261116.4800 command menu and truncation tooltip.
export const MENU = {
  layer: "pointer-events-auto fixed z-40 flex flex-col",
  surface:
    "[--chat-composer-attached-surface:var(--chat-composer-glass-surface,var(--card))] dark:[--chat-composer-attached-surface:var(--chat-composer-glass-surface,var(--surface-raised))] [html[data-theme-id]_&]:[--chat-composer-attached-surface:var(--app-theme-surface-raised)] relative isolate border-0 bg-transparent shadow-none [--chat-composer-attached-tint:transparent] [--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--contrast-foreground)_8%,transparent))] dark:[--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--color-white)_5%,transparent))] [html[data-theme-id]_&]:[--chat-composer-attached-outline:var(--chat-composer-outline,var(--app-theme-toolbar-border))] dark:[html[data-theme-id]:not([data-theme-id=t3-chat])_&]:[--chat-composer-attached-outline:var(--chat-composer-outline,color-mix(in_srgb,var(--app-theme-input)_30%,var(--background)))] dark:[html[data-theme-id=t3-chat]_&]:[--chat-composer-attached-outline:#241e28] [--chat-composer-attachment-overlap:calc(1rem+1px)] before:rounded-t-2xl before:mask-t-from-transparent before:mask-t-from-4 before:mask-t-to-black before:mask-t-to-4 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:border before:border-(--chat-composer-attached-outline) before:bg-(--chat-composer-attached-surface)/(--glass-opacity) before:bg-linear-to-b before:from-(--chat-composer-attached-tint) before:to-(--chat-composer-attached-tint) before:backdrop-blur-(--glass-blur) before:backdrop-saturate-(--glass-saturation) before:shadow-composer dark:before:shadow-composer-dark dark:supports-[(backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px))]:before:bg-composer-seam-above not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:before:bg-(--chat-composer-attached-surface) flex min-h-0 w-full flex-col overflow-hidden pb-(--chat-composer-attachment-overlap) **:data-[slot=command-item]:rounded-lg **:data-[slot=scroll-area-scrollbar]:data-[orientation=vertical]:my-4",
  root: "relative size-full min-h-0 overflow-hidden rounded-[inherit] flex flex-col",
  viewport:
    "h-full max-h-[inherit] overflow-auto overscroll-contain rounded-[inherit] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-has-overflow-x:overscroll-x-contain mask-t-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-start)))] mask-b-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-end)))] mask-l-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-start)))] mask-r-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-end)))] focus-visible:mask-none [--fade-size:1.5rem] scroll-p-[var(--fade-size)] scrollbar-gutter-stable base-ui-disable-scrollbar",
  list: "not-empty:scroll-py-2 not-empty:p-2 max-h-72 min-h-0 scroll-pb-6",
  group: "[[role=group]+&]:mt-1.5",
  item: "flex min-h-8 select-none items-center gap-2 rounded-sm px-2 text-base outline-none data-disabled:pointer-events-none data-disabled:opacity-64 sm:min-h-7 sm:text-sm [&_svg:not([class*='text-'])]:text-muted-foreground py-1.5 cursor-pointer hover:bg-transparent hover:text-inherit data-highlighted:bg-transparent data-highlighted:text-inherit data-selected:bg-transparent data-selected:text-inherit [&[data-highlighted][data-selected]]:bg-transparent [&[data-highlighted][data-selected]]:text-inherit",
  content: "flex min-w-0 flex-1 items-center gap-2",
  text: "min-w-0 flex-1 truncate font-sans text-xs font-medium",
  badge:
    "relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border border-transparent font-medium outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-3.5 sm:[&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [button&,a&]:cursor-pointer [button&,a&]:pointer-coarse:after:absolute [button&,a&]:pointer-coarse:after:size-full [button&,a&]:pointer-coarse:after:min-h-11 [button&,a&]:pointer-coarse:after:min-w-11 h-5.5 min-w-5.5 px-[calc(--spacing(1)-1px)] text-sm sm:h-4.5 sm:min-w-4.5 sm:text-xs bg-secondary text-secondary-foreground [button&,a&]:hover:bg-secondary/90 ms-auto",
  tooltipPositioner:
    "pointer-events-none z-[140] max-w-(--available-width) transition-[top,left,right,bottom,transform] data-instant:transition-none",
  tooltipPopup:
    "relative flex origin-(--transform-origin) rounded-md text-popover-foreground text-xs transition-[scale,opacity] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-md)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 data-instant:duration-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)] border bg-popover not-dark:bg-clip-padding shadow-md/5 max-w-80 wrap-anywhere whitespace-normal leading-snug",
  tooltipViewport: "min-w-0 px-2 py-1",
} as const;

export type Look = { -readonly [K in keyof typeof CAPTURED]: string };

/** Classes the Stash adds for its own state (open, pulsing, highlighted); the Shelf sets its own. */
const STATE_CLASS =
  /^(?:animate-\S+|pointer-events-none|text-foreground|text-muted-foreground|hover:text-foreground|transition-colors|duration-200|relative|rounded-sm|bg-accent|text-accent-foreground)$/;

const base = (element: Element | null | undefined) =>
  element
    ?.getAttribute("class")
    ?.split(/\s+/)
    .filter((token) => token.length > 0 && !STATE_CLASS.test(token))
    .join(" ");

const plain = (element: Element | null | undefined) => element?.getAttribute("class") ?? undefined;

/** The capture, overridden by whatever part of the Stash is on screen now. */
export const currentLook = (): Look => {
  const look: Look = { ...CAPTURED };
  const take = (key: keyof Look, value: string | undefined) => {
    if (value) look[key] = value;
  };
  const badge = document.querySelector('[data-prompt-stash-badge="true"]');
  if (badge) {
    take("tabSurface", plain(badge.closest("[data-composer-banner-surface]")));
    take("row", base(badge));
    take("icon", plain(badge.querySelector("[data-slot=composer-banner-icon]")));
    take("content", plain(badge.querySelector("[data-slot=composer-banner-content]")));
    take("actions", plain(badge.querySelector("[data-slot=composer-banner-actions]")));
  }
  const drawer = document.querySelector('[data-composer-stash-drawer="true"]');
  if (drawer) {
    const head = drawer.querySelector(":scope > button");
    const entry = drawer.querySelector("li[data-stash-entry]");
    const scroll = drawer.querySelector(":scope > [role=presentation]");
    take("drawerSurface", plain(drawer));
    take("layer", plain(drawer.parentElement));
    take("count", plain(head?.querySelector("[data-slot=composer-banner-actions] > span")));
    take("chevron", plain(head?.querySelector("[data-slot=button]")));
    take("scroll", plain(scroll));
    take("viewport", plain(scroll?.firstElementChild));
    take("viewportInner", plain(scroll?.firstElementChild?.firstElementChild));
    take("list", plain(drawer.querySelector("ul")));
    take("restore", plain(entry?.querySelector("[data-stash-restore]")));
    take("time", plain(entry?.querySelector("time")));
    take("dismiss", plain(entry?.querySelector("[data-slot=button]")));
  }
  return look;
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lucide icons, drawn the way T3 Code draws them. */
const ICONS = {
  library: ["m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16"],
  "file-text": [
    "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
    "M14 2v5a1 1 0 0 0 1 1h5",
    "M10 9H8",
    "M16 13H8",
    "M16 17H8",
  ],
  search: ["m21 21-4.34-4.34", "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"],
  plus: ["M5 12h14", "M12 5v14"],
  "chevron-down": ["m6 9 6 6 6-6"],
  x: ["M18 6 6 18", "m6 6 12 12"],
} as const;

export type IconName = keyof typeof ICONS;

export const svgIcon = (name: IconName, className = ""): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [key, value] of Object.entries({
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: `lucide lucide-${name} ${className}`.trim(),
  })) {
    svg.setAttribute(key, value);
  }
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
};
