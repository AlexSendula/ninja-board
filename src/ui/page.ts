import { h } from './dom.ts';
import type { HeadOpts } from './header.ts';

/** Clears root and gives it the view wrapper and an empty page, which it returns. */
export function mountPage(root: HTMLElement, view: string): HTMLElement {
  const page = h('div', 'brain-page', { 'data-view': view });
  root.replaceChildren(h('div', 'brain-view', {}, [page]));
  return page;
}

/** A tile or column heading with its count. */
export function labelRow(title: string, count: number): HTMLElement {
  return h('div', 'brain-label-row', {}, [
    h('h3', 'brain-label', {}, [title]),
    h('span', 'brain-count', {}, [String(count)]),
  ]);
}

/** The figure of Today and Week: a ring of done out of all, then "N left". */
export function leftFigure(done: number, left: number, period: string): NonNullable<HeadOpts['figure']> {
  return { ring: { done, total: done + left, label: `${done} of ${done + left} done ${period}` }, strong: String(left), rest: 'left' };
}

let folds = 0;   // a unique id per folded element, for aria-controls

/**
 * A tile that folds: one toggle with its title and count, then the content, shown only while open.
 * Each content element gets an id the toggle controls. `name` goes on the tile as data-fold, so the
 * next render can keep it open (foldWasOpen).
 */
export function foldTile(opts: {
  name: string; title: string; count: number; open: boolean; content: HTMLElement[]; cls?: string;
}): HTMLElement {
  for (const el of opts.content) el.id = `brain-fold-${++folds}`;
  const hint = h('span', 'brain-fold-hint', { 'aria-hidden': 'true' });
  const toggle = h('button', 'brain-fold-toggle', {
    'aria-controls': opts.content.map((el) => el.id).join(' '), 'data-key': `fold:${opts.name}`,
  }, [
    h('span', 'brain-label', {}, [opts.title]),
    h('span', 'brain-count', {}, [String(opts.count)]),
    hint,
  ]);
  const show = (on: boolean): void => {
    toggle.setAttribute('aria-expanded', String(on));
    for (const el of opts.content) el.hidden = !on;
    hint.textContent = on ? 'Hide' : 'Show';
  };
  toggle.addEventListener('click', () => show(toggle.getAttribute('aria-expanded') !== 'true'));
  show(opts.open);
  const cls = opts.cls ? `brain-tile brain-fold ${opts.cls}` : 'brain-tile brain-fold';
  return h('section', cls, { 'data-fold': opts.name }, [toggle, ...opts.content]);
}

/** Whether root's fold of this name is open. Read it before a re-render replaces the page. */
export function foldWasOpen(root: HTMLElement, name: string): boolean {
  return root.querySelector(`[data-fold="${name}"] > .brain-fold-toggle`)?.getAttribute('aria-expanded') === 'true';
}
