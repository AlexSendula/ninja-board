/** The data-key of the row, card or tile that has focus inside root, if any: read before a render, for refocus. */
export function focusedKey(root: HTMLElement): string | undefined {
  const active = root.ownerDocument.activeElement;
  if (!active || !root.contains(active)) return undefined;
  return active.closest<HTMLElement>('[data-key]')?.dataset.key;
}

/**
 * Focuses the row, card or tile in `root` whose data-key is `key`, without scrolling. A keyed
 * element that is itself a focus stop (has a tabindex, or is a button or a link) takes focus. One
 * that isn't (an inbox row: its link is the stop) hands it to its first link, button or focusable descendant.
 */
export function refocus(root: HTMLElement, key: string): void {
  // Compared as strings rather than through a selector, so a key's quotes and slashes need no escaping.
  const keyed = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((el) => el.getAttribute('data-key') === key);
  const stop = keyed?.matches('[tabindex], button, a[href]') ? keyed : keyed?.querySelector<HTMLElement>('a[href], button, [tabindex]');
  stop?.focus({ preventScroll: true });
}

/**
 * Gives the focus back when a modal closes: to the button that opened it or, when a redraw has replaced that button, to the one
 * with the same key in root. A modal calls it after a timeout, when Obsidian has taken the modal down, so nothing there takes it back.
 */
export function returnFocus(opener: HTMLElement | undefined, key: string | undefined, root: HTMLElement): void {
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  else if (key !== undefined) refocus(root, key);
}

/** A pager control's place in a week page: a step by its index among the steps, or 'first' (This week, a chip). */
export type PagerFocus = number | 'first';

/**
 * The pager control in root that has focus, as a place to refocus after a render. This week and a Coming up
 * chip are 'first': a render removes them, and the first step takes their focus. Undefined when focus is elsewhere.
 */
export function pagerFocus(root: HTMLElement): PagerFocus | undefined {
  const active = root.ownerDocument.activeElement;
  if (!active || !root.contains(active)) return undefined;
  const control = active.closest<HTMLElement>('.brain-pager > button, .brain-week-chip');
  if (!control) return undefined;
  return control.matches('.brain-step') ? pagerSteps(root).indexOf(control) : 'first';
}

/** Focuses the pager step that pagerFocus remembered, in the page a render drew; the first step when there is none. */
export function refocusPager(root: HTMLElement, was: PagerFocus | undefined): void {
  if (was === undefined) return;
  const steps = pagerSteps(root);
  const at = typeof was === 'number' ? steps[was] : undefined;
  (at ?? steps[0])?.focus({ preventScroll: true });
}

function pagerSteps(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.brain-pager > .brain-step')];
}
