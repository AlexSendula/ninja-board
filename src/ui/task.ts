import type { MetaPart, RecordRowVM, RowTarget, RowVM, TaskState } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h, link, type Child } from './dom.ts';
import { checkMark, repeatMark, ring } from './marks.ts';
import { openCard, rowCard } from './popover.ts';
import { META_BREAK } from '../model/rows.ts';

export type Point = { x: number; y: number };

/** What a focusable row or card does on Enter, Space and the menu gestures. */
export interface ItemHandlers {
  open(): void;
  toggle(): void;
  menu(at: Point): void;
}

const LONG_PRESS_MS = 500;
const MOVE_SLOP_PX = 4;
const ARIA_CHECKED: Record<TaskState, string> = {
  todo: 'false', doing: 'mixed', waiting: 'false', done: 'true', dropped: 'false',
};

// Each item's menu opener, so drag.ts can open it after a still long-press on a draggable.
const menus = new WeakMap<Element, (at: Point) => void>();

export function openItemMenu(item: Element, at: Point): void {
  menus.get(item)?.(at);
}

/** The data attribute a row that Brain may plan carries: the day, week and To plan zones take only such rows. */
function planAttrs(row: RowVM): Record<string, string> {
  return row.plan ? { 'data-plannable': '' } : {};
}

/** A repeating row's attribute: a repeating note is marked, so the board knows it repeats. */
function repeatAttrs(row: RowVM): Record<string, string> {
  return row.repeating ? { 'data-repeat': '' } : {};
}

export function taskRow(row: RowVM, actions: Actions): HTMLLIElement {
  if (row.progress) return storyRow(row, row.progress, actions);
  if (row.occurrence) return occurrenceRow(row, actions);
  const check = h('button', 'brain-lead brain-check', {
    role: 'checkbox',
    'aria-checked': ARIA_CHECKED[row.state],
    'aria-label': row.ariaLabel,
  }, [checkMark()]);
  check.addEventListener('click', () => void actions.toggle(row.target));
  // A button clicks on every Enter keydown, so a held Enter would tick and untick. Space clicks once, on
  // release; a repeated Enter is cancelled so Enter acts once too.
  check.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.repeat) e.preventDefault();
  });
  const li = h('li', row.draggable ? 'brain-task brain-draggable' : 'brain-task', {
    'data-state': row.state,
    tabindex: '0',
    'data-key': row.key,
    ...planAttrs(row),
    ...repeatAttrs(row),
  }, [check, rowBody(row, actions)]);
  bindItem(li, {
    open: () => openTarget(row.target, actions),
    toggle: () => void actions.toggle(row.target),
    menu: (at) => openCard(li, at, rowCard(row), actions),
  });
  if (row.draggable) noNativeDrag(li);
  return li;
}

/**
 * A completed occurrence of a repeating note, in Done: the repeat mark and no check, since the note itself is where the next
 * occurrence is ticked. A focus stop whose Enter opens the note; Space and the menu keys do nothing.
 */
function occurrenceRow(row: RowVM, actions: Actions): HTMLLIElement {
  const li = h('li', 'brain-task', {
    'data-state': 'done',
    'data-repeat': '',
    tabindex: '0',
    'data-key': row.key,
  }, [
    h('span', 'brain-lead brain-repeat', { 'aria-hidden': 'true' }, [repeatMark()]),
    rowBody(row, actions),
  ]);
  bindItem(li, { open: () => openTarget(row.target, actions), toggle: () => {}, menu: () => {} });
  return li;
}

/**
 * A story as a row (an upcoming week's Planned or due): its ring leads instead of a check, and its count
 * ends the row. Enter opens the note; Space toggles it done or open, as a story card does; the menu opens
 * the story card. A story drags when its row does: in Planned or due, while To plan is open.
 */
function storyRow(row: RowVM, progress: { done: number; total: number }, actions: Actions): HTMLLIElement {
  const li = h('li', row.draggable ? 'brain-task brain-draggable' : 'brain-task', {
    'data-state': row.state,
    'data-story': '',
    tabindex: '0',
    'data-key': row.key,
  }, [
    h('span', 'brain-lead', {}, [ring(progress.done, progress.total, 16, `${progress.done} of ${progress.total} done`)]),
    rowBody(row, actions),
    h('span', 'brain-aside', { 'aria-hidden': 'true' }, [`${progress.done}/${progress.total}`]),
  ]);
  bindItem(li, {
    open: () => openTarget(row.target, actions),
    toggle: () => void actions.setNoteStatus(row.target.path, row.state === 'done' ? 'open' : 'done'),
    menu: (at) => openCard(li, at, rowCard(row), actions),
  });
  if (row.draggable) noNativeDrag(li);
  return li;
}

function rowBody(row: RowVM, actions: Actions): HTMLDivElement {
  const title = link(row.title, 'brain-task-text brain-link brain-stretch', () => openTarget(row.target, actions));
  title.setAttribute('tabindex', '-1');   // the row is the focus stop, a repeating one too
  // META_BREAK (Task 5) ends a meta line: a repeating row's "Every 6 months" gets its own.
  const cut = row.meta.findIndex((p) => p.text === META_BREAK);
  const lines = cut < 0 ? [row.meta] : [row.meta.slice(0, cut), row.meta.slice(cut + 1)];
  return h('div', 'brain-task-body', {}, [
    title,
    ...lines.filter((parts) => parts.length > 0).map((parts) => metaLine(parts, actions, row.target.path)),
  ]);
}

function openTarget(target: RowTarget, actions: Actions): void {
  if (target.kind === 'line') actions.open(target.path, target.line);
  else actions.open(target.path);
}

/**
 * A meta line. A part with a tone is a span with that tone's class. MetaPart carries no link target,
 * so only a part that names the row's own note (a line's project, story or area) links, to that note.
 */
export function metaLine(parts: MetaPart[], actions: Actions, notePath?: string): HTMLParagraphElement {
  return h('p', 'brain-meta', {}, parts.map((part) => {
    const attrs: Record<string, string> = part.when ? { 'data-when': part.when } : {};
    if (part.tone) return h('span', `brain-${part.tone}`, attrs, waitingWords(part.text));
    if (notePath !== undefined && part.text === noteName(notePath)) {
      return link(part.text, 'brain-link', () => actions.open(notePath));
    }
    return h('span', undefined, attrs, waitingWords(part.text));
  }));
}

/**
 * A part's text as nodes. "Waiting on " is its own span, so the Week board's group view can hide it: the group's label
 * says it. The text reads the same either way.
 */
function waitingWords(text: string): Child[] {
  const words = 'Waiting on ';
  return text.startsWith(words) ? [h('span', 'brain-waiting-words', {}, [words]), text.slice(words.length)] : [text];
}

function noteName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
}

/**
 * A row of a past week: the mark in its state, but no button, focus stop, keys or menu. The title
 * opens the row's note while it exists, and is plain text without one. A record's inbox item has a dot.
 */
export function readonlyRow(row: RecordRowVM, actions: Actions): HTMLLIElement {
  const { path } = row;
  const title = path === undefined
    ? h('span', 'brain-task-text', {}, [row.title])
    : link(row.title, 'brain-task-text brain-link brain-stretch', () => actions.open(path));
  const lead = row.inbox
    ? h('span', 'brain-lead', { 'aria-hidden': 'true' }, [h('span', 'brain-dot')])
    : h('span', 'brain-lead brain-check', { 'aria-hidden': 'true' }, [checkMark()]);
  return h('li', 'brain-task', row.inbox ? {} : { 'data-state': row.state }, [
    lead,
    h('div', 'brain-task-body', {}, [title, row.meta.length > 0 ? metaLine(row.meta, actions, path) : null]),
  ]);
}

/** Links inside a draggable item must not start the browser's own link drag. */
export function noNativeDrag(item: HTMLElement): void {
  for (const a of item.querySelectorAll('a')) a.setAttribute('draggable', 'false');
}

/**
 * Keys, context menu and touch long-press for a focusable row or card ([data-state][tabindex]).
 * Each item acts only on its own events, so a row inside a card leaves the card alone.
 */
export function bindItem(item: HTMLElement, on: ItemHandlers): void {
  menus.set(item, on.menu);
  // When the menu key last opened this item's menu: browsers follow that key with a contextmenu event.
  const keyMenu = { at: 0 };
  bindKeys(item, on, keyMenu);
  bindMenuGestures(item, on.menu, keyMenu);
}

function bindKeys(item: HTMLElement, on: ItemHandlers, keyMenu: { at: number }): void {
  item.addEventListener('keydown', (e) => {
    if (e.target !== item) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) on.open();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) on.toggle();   // a held key must not toggle back and forth
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      keyMenu.at = Date.now();
      const r = item.getBoundingClientRect();
      on.menu({ x: r.left + 24, y: r.bottom + 4 });
    }
  });
}

function bindMenuGestures(item: HTMLElement, menu: (at: Point) => void, keyMenu: { at: number }): void {
  const own = (e: Event) => (e.target as Element).closest('[data-state][tabindex]') === item;
  let touching = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: Point = { x: 0, y: 0 };
  let swallowClick = false;
  const release = () => {
    touching = false;
    clearTimeout(timer);
    timer = undefined;
  };

  item.addEventListener('contextmenu', (e) => {
    if (!own(e)) return;
    e.preventDefault();
    // A touch long-press has its own timer (below, or in drag.ts); the menu key has opened it already.
    if (touching || Date.now() - keyMenu.at < 300) return;
    menu({ x: e.clientX, y: e.clientY });
  });
  item.addEventListener('pointerdown', (e) => {
    touching = e.pointerType === 'touch';
    swallowClick = false;
    // Inside a draggable, drag.ts owns the long-press: it lifts, and a still release opens the menu.
    if (!touching || !own(e) || (e.target as Element).closest('button') || item.closest('.brain-draggable')) return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = undefined;
      swallowClick = true;
      menu(start);
    }, LONG_PRESS_MS);
  });
  item.addEventListener('pointermove', (e) => {
    if (timer === undefined) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= MOVE_SLOP_PX) {
      clearTimeout(timer);
      timer = undefined;
    }
  });
  item.addEventListener('pointerup', release);
  item.addEventListener('pointercancel', release);
  // The release after a long-press must not also open the note.
  item.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}
