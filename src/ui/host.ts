// The base blocks and embeds a Ninja Board view sits in. While a view is in one, the CSS hides the Bases toolbar of that block or embed
// (styles.css, the note-context block). They carry a class for it: the CSS selects them by class, not :has. There is no mark on the
// note itself: Bases attaches the view to the note after onload, so markHosts runs before the note is reachable and never reached it
// (measured in Obsidian 1.14.4, editing and reading view). A board page is hidden by its cssclasses: ninja-board instead.

const SELECTOR = '.block-language-base, .bases-embed';
const MARK = 'brain-embed-host';

// The views that have been unmarked. One still in the DOM while it unloads does not keep its host marked.
const released = new WeakSet<Element>();

/**
 * Marks each base block and embed the view is in, at any depth: an embed inside an embed included. Returns the unmark, which
 * clears a mark once no live Ninja Board view is left in its host.
 */
export function markHosts(view: Element): () => void {
  const marked: Element[] = [];
  for (let el = view.parentElement; el !== null; el = el.parentElement) {
    if (!el.matches(SELECTOR)) continue;
    el.classList.add(MARK);
    marked.push(el);
  }
  return () => {
    released.add(view);
    for (const el of marked) {
      const live = Array.from(el.querySelectorAll('.brain-view')).some((other) => !released.has(other));
      if (!live) el.classList.remove(MARK);
    }
  };
}
