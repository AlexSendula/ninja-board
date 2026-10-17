// The notes and embeds a Ninja Board view sits in. While a view is in one, the CSS hides a note's Properties and an embed's
// Bases toolbar (styles.css, the note-context block). They carry a class for it: the CSS selects them by class, not :has.

const HOSTS: ReadonlyArray<readonly [selector: string, cls: string]> = [
  ['.markdown-source-view, .markdown-preview-view', 'brain-note-host'],
  ['.block-language-base, .bases-embed', 'brain-embed-host'],
];

// The views that have been unmarked. One still in the DOM while it unloads does not keep its host marked.
const released = new WeakSet<Element>();

/**
 * Marks each note and embed the view is in, at any depth: a note with a view anywhere inside it, a note inside a note
 * included. Returns the unmark, which clears a mark once no live Ninja Board view is left in its host.
 */
export function markHosts(view: Element): () => void {
  const marks: Array<[Element, string]> = [];
  for (let el = view.parentElement; el !== null; el = el.parentElement) {
    for (const [selector, cls] of HOSTS) {
      if (!el.matches(selector)) continue;
      el.classList.add(cls);
      marks.push([el, cls]);
    }
  }
  return () => {
    released.add(view);
    for (const [el, cls] of marks) {
      const live = Array.from(el.querySelectorAll('.brain-view')).some((other) => !released.has(other));
      if (!live) el.classList.remove(cls);
    }
  };
}
