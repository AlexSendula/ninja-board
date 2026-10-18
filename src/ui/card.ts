import type { MetaPart, ProjectCardVM, RowVM, StoryCardVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h, link } from './dom.ts';
import { peekIcon, pointsSpan, progress } from './marks.ts';
import { pointsOf } from '../model/points.ts';
import { markKeyboardFocus } from './focus.ts';
import { openCard, rowCard } from './popover.ts';
import { bindItem, metaLine, noNativeDrag, taskRow } from './task.ts';

/**
 * A story on the Week board: title, project and due, ring, and its lines, tickable on the card. A plannable one plans, as a card's
 * menu says. With `fold` (this week's board) the head starts with the chevron that folds the lines away, as To plan's cards have;
 * `name` is the story's note name, the key of the view's `collapsed:` list, and `folded` is where the list has it.
 */
export function storyCard(card: StoryCardVM, actions: Actions, fold?: { name: string; folded: boolean }): HTMLLIElement {
  const state = card.column;   // a story's column is its state
  const status = state === 'todo' ? 'open' : state;
  const points = pointsOf(card.points);
  const peek = fold ? foldChevron(card, fold, actions) : null;
  const lines = card.rows.length > 0 ? h('ul', fold ? 'brain-tasks brain-story-lines' : 'brain-tasks', {}, card.rows.map((row) => taskRow(row, actions))) : null;
  if (fold?.folded) lines?.setAttribute('hidden', '');
  const li = h('li', fold ? 'brain-tile brain-card brain-draggable brain-foldable' : 'brain-tile brain-card brain-draggable', {
    'data-state': state,
    tabindex: '0',
    'data-key': card.key,
    ...(card.plan ? { 'data-plannable': '' } : {}),
  }, [
    cardHead(card.title, card.meta, cardSide(card.done, card.total, card.points), () => actions.open(card.path), actions, peek),
    lines,
  ]);
  if (fold) markKeyboardFocus(li, 'brain-keyboard-focus');   // the CSS shows the chevron for the keyboard: a click's focus is not that
  bindItem(li, {
    open: () => actions.open(card.path),
    toggle: () => void actions.setNoteStatus(card.path, status === 'done' ? 'open' : 'done'),
    menu: (at) => openCard(li, at, { kind: 'story', title: card.title, path: card.path, state, ...(card.plan ? { dates: card.plan } : {}), ...(points ? { points } : {}) }, actions),
  });
  noNativeDrag(li);
  return li;
}

/**
 * The chevron of a story card on the Week board: it folds the lines away while they show, and opens them while they are folded.
 * It has a key of its own, so a redraw after a click on it gives the focus back to it, not to the card.
 */
function foldChevron(card: StoryCardVM, { name, folded }: { name: string; folded: boolean }, actions: Actions): HTMLButtonElement {
  const peek = h('button', 'brain-peek', { 'aria-expanded': String(!folded), 'aria-label': foldLabel(card.title, !folded), 'data-key': `fold-story:${card.key}` }, [peekIcon()]);
  peek.addEventListener('click', () => actions.foldStories([name], !folded));
  return peek;
}

/** The story cards whose lines are open while planning, by key. A card drawn again keeps its lines open. */
const unfolded = new Set<string>();

/** A story card's chevron label: what it does next. */
function foldLabel(title: string, open: boolean): string {
  return `${open ? 'Hide' : 'Show'} the lines of ${title}`;
}

/**
 * Folds or opens a story card's lines behind its chevron: the chevron's state and label, the lines, and the fold that a
 * redraw keeps. Setting the chevron's own visibility is the caller's (To plan's pill does it).
 */
export function foldStory(card: HTMLElement, open: boolean): void {
  const key = card.dataset.key ?? '';
  if (open) unfolded.add(key);
  else unfolded.delete(key);
  const peek = card.querySelector<HTMLElement>('.brain-peek');
  const title = card.querySelector('.brain-card-title')?.textContent ?? '';
  peek?.setAttribute('aria-expanded', String(open));
  peek?.setAttribute('aria-label', foldLabel(title, open));
  const lines = card.querySelector('.brain-story-lines');
  if (open) lines?.removeAttribute('hidden');
  else lines?.setAttribute('hidden', '');
}

/**
 * A story as a card in a list: To plan's No date, Still open and Due soon, the list modal, Backlog's No date, and Planned or due.
 * Its head starts with a chevron that folds its lines open in place, then its title and meta, then its ring and count. While
 * `planning` the lines are folded behind the chevron unless the card was opened; otherwise there is no chevron, and the lines show.
 */
export function storyListCard(row: RowVM, actions: Actions, planning: boolean): HTMLLIElement {
  const title = row.title;
  const open = planning && unfolded.has(row.key);
  const peek = h('button', 'brain-peek', { 'aria-expanded': String(open), 'aria-label': foldLabel(title, open) }, [peekIcon()]);
  const lines = h('ul', 'brain-tasks brain-story-lines', {}, (row.lines ?? []).map((line) => taskRow(line, actions)));
  if (planning && !open) lines.setAttribute('hidden', '');
  if (!planning) peek.setAttribute('hidden', '');
  peek.addEventListener('click', () => foldStory(li, peek.getAttribute('aria-expanded') !== 'true'));
  const { progress: count } = row;
  const li = h('li', row.draggable ? 'brain-tile brain-card brain-draggable' : 'brain-tile brain-card', {
    'data-state': row.state,
    'data-story': '',
    tabindex: '0',
    'data-key': row.key,
    ...(row.plan ? { 'data-plannable': '' } : {}),
  }, [
    h('header', 'brain-card-head', {}, [
      peek,
      h('div', undefined, {}, [
        h('h4', 'brain-card-title', {}, [storyTitle(row, actions)]),
        row.meta.length > 0 ? metaLine(row.meta, actions) : null,
      ]),
      h('div', 'brain-card-side', {}, [progress(count?.done ?? 0, count?.total ?? 0), row.points !== undefined ? pointsSpan(row.points) : null]),
    ]),
    lines,
  ]);
  bindItem(li, {
    open: () => actions.open(row.target.path),
    toggle: () => void actions.setNoteStatus(row.target.path, row.state === 'done' ? 'open' : 'done'),
    menu: (at) => openCard(li, at, rowCard(row), actions),
  });
  noNativeDrag(li);
  return li;
}

/** A row of a list: a story is a card (folded behind its chevron while `planning`); any other row is a task row. */
export function listItem(row: RowVM, actions: Actions, planning: boolean): HTMLLIElement {
  return row.progress ? storyListCard(row, actions, planning) : taskRow(row, actions);
}

/** A story card's title: a link that opens the note, with the card as the focus stop. */
function storyTitle(row: RowVM, actions: Actions): HTMLAnchorElement {
  const titleLink = link(row.title, 'brain-link brain-stretch', () => actions.open(row.target.path));
  titleLink.setAttribute('tabindex', '-1');
  return titleLink;
}

/** A project on the Projects board: title, area and due, ring, and the next open line. */
export function projectCard(card: ProjectCardVM, actions: Actions): HTMLLIElement {
  // A done project has no ring: its column says it all.
  const ringEl = card.status === 'done' ? null : progress(card.done, card.total);
  const li = h('li', 'brain-tile brain-card brain-draggable', {
    'data-state': card.status,
    'data-menu': 'project',
    tabindex: '0',
    'data-key': card.key,
  }, [
    cardHead(card.title, card.meta, ringEl, () => actions.open(card.path), actions),
    card.next ? h('p', 'brain-label', {}, ['Next']) : null,
    card.next ? h('ul', 'brain-tasks', {}, [taskRow(card.next, actions)]) : null,
  ]);
  bindItem(li, {
    open: () => actions.open(card.path),
    toggle: () => void actions.setNoteStatus(card.path, card.status === 'done' ? 'active' : 'done'),
    menu: (at) => openCard(li, at, { kind: 'project', title: card.title, path: card.path, status: card.status }, actions),
  });
  noNativeDrag(li);
  return li;
}

/** A story card's side: its ring and count, then its points under them when it has any. */
function cardSide(done: number, total: number, points: number | undefined): HTMLElement {
  return h('div', 'brain-card-side', {}, [progress(done, total), points !== undefined ? pointsSpan(points) : null]);
}

function cardHead(title: string, meta: MetaPart[], aside: HTMLElement | null, onOpen: () => void, actions: Actions, lead: HTMLElement | null = null): HTMLElement {
  const titleLink = link(title, 'brain-link brain-stretch', onOpen);
  titleLink.setAttribute('tabindex', '-1');   // the card is the focus stop
  return h('header', 'brain-card-head', {}, [
    lead,
    h('div', undefined, {}, [
      h('h4', 'brain-card-title', {}, [titleLink]),
      meta.length > 0 ? metaLine(meta, actions) : null,
    ]),
    aside,
  ]);
}
