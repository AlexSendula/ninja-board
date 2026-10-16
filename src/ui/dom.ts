// Tiny DOM helpers. They use the global document, so the same code runs in Obsidian,
// in the browser preview and in linkedom under node:test.

export type Child = Node | string | null;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  attrs: Record<string, string> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  for (const child of children) if (child !== null) el.append(child);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

/** An `<a href="#">` that calls onOpen instead of navigating. */
export function link(content: string | Node[], cls: string, onOpen: () => void): HTMLAnchorElement {
  const a = h('a', cls, { href: '#' }, typeof content === 'string' ? [content] : content);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    onOpen();
  });
  return a;
}
