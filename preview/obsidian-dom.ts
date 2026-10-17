// Obsidian's DOM helpers, for a page that is not Obsidian: the browser preview, and the tests, which draw the same views
// into linkedom. Obsidian gives every HTML and SVG element setCssProps (custom properties from an object) and setCssStyles
// (inline styles from an object), and gives every window createEl (an element in its document). The views call them, so a
// host that is not Obsidian installs them here.

/** The CSS name of a style key: pointerEvents gives pointer-events. */
function cssName(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';   // the namespace createElement makes its elements in, in an HTML document

/** What both helpers set: an element's style. */
type Styled = { readonly style: CSSStyleDeclaration };

function setCssProps(this: Styled, props: Record<string, string>): void {
  for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value);
}

function setCssStyles(this: Styled, styles: Partial<CSSStyleDeclaration>): void {
  for (const [name, value] of Object.entries(styles)) {
    if (typeof value === 'string' || typeof value === 'number') this.style.setProperty(cssName(name), String(value));
  }
}

/** Installs createEl for `doc`, and setCssProps and setCssStyles on the page's HTML and SVG element classes. */
export function installObsidianDom(doc: Document, htmlElement: typeof HTMLElement, svgElement: typeof SVGElement): void {
  // This is createEl itself: it makes the element, so it cannot call itself.
  Object.assign(window, { createEl: (tag: string) => doc.createElementNS(XHTML_NAMESPACE, tag) });
  for (const elementClass of [htmlElement, svgElement]) {
    elementClass.prototype.setCssProps = setCssProps;
    elementClass.prototype.setCssStyles = setCssStyles;
  }
}
