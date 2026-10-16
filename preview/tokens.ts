// checkView's tokens: a page as a flat list, so the preview and the mockup can be compared in order.

const ELEMENT = 1;
const TEXT = 3;

/**
 * The element and everything in it, in document order: each element as "tag.classes [aria-label]", its classes
 * sorted, and each text trimmed. The mockup's own nodes and classes are left out (see mockOnly and mockClass).
 * It walks the element's own tree, with no document, Node or NodeFilter global, so it runs on the page, on the
 * parsed mockup, and in linkedom.
 */
export function tokensOf(page: Element | null): string[] {
  if (!page || mockOnly(page)) return [];
  const tokens = [elementToken(page)];
  for (const node of page.childNodes) {
    if (node.nodeType === ELEMENT) tokens.push(...tokensOf(node as Element));
    else if (node.nodeType === TEXT) {
      const text = textToken(node);
      if (text) tokens.push(text);
    }
  }
  return tokens;
}

/**
 * The mockup's stand-ins: a <template> holds what the plugin draws when a day is picked, and a [data-frozen] node is
 * the picture of a drag in the air. Neither is part of the page at rest.
 */
function mockOnly(el: Element): boolean {
  return el.localName === 'template' || el.hasAttribute('data-frozen');
}

function elementToken(el: Element): string {
  // A name in a meta line is a link where its note is known and a span where it isn't: both sides compare it as a span.
  if (el.matches('.brain-meta > a.brain-link')) return 'span';
  const classes = [...el.classList]
    .filter((c) => !mockClass(el, c))
    .sort()
    .map((c) => '.' + c)
    .join('');
  const label = el.getAttribute('aria-label');
  return el.localName + classes + (label ? ` [${label}]` : '');
}

// mock-* classes are the mockup's scaffolding (.mock-week, .mock-slot, .mock-drag-host). A drop tint marked
// [data-frozen-drop] belongs to the picture of a drag, not to the page at rest.
function mockClass(el: Element, c: string): boolean {
  return c.startsWith('mock-') || (c === 'brain-is-drop' && el.hasAttribute('data-frozen-drop'));
}

// Labels are upper case in CSS, so their letter case in the DOM doesn't show.
function textToken(node: Node): string {
  const text = node.textContent?.trim() ?? '';
  return node.parentElement?.closest('.brain-label') ? text.toLowerCase() : text;
}
