// A tiny element builder. Values go through DOM properties, not attributes, so things like
// `value` behave (an attribute `value` on a textarea is ignored by the browser).

type Child = Node | string | null | undefined | false;

export interface ElementProps {
  readonly className?: string;
  readonly text?: string;
  readonly title?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly on?: Readonly<Record<string, (event: Event) => void>>;
}

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  init: ElementProps = {},
  ...children: ReadonlyArray<Child>
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (init.className) element.className = init.className;
  if (init.text !== undefined) element.textContent = init.text;
  if (init.title !== undefined) element.title = init.title;
  for (const [name, value] of Object.entries(init.attrs ?? {})) element.setAttribute(name, value);
  if (init.style) Object.assign(element.style, init.style);
  for (const [name, value] of Object.entries(init.props ?? {})) {
    (element as unknown as Record<string, unknown>)[name] = value;
  }
  for (const [type, handler] of Object.entries(init.on ?? {})) {
    element.addEventListener(type, handler);
  }
  for (const child of children) if (child) element.append(child);
  return element;
};
