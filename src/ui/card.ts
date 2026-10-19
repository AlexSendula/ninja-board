import type { MetaPart, ProjectCardVM, RowVM, StoryCardVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h, link } from './dom.ts';
import { foldAllIcon, peekIcon, pointsSpan, progress } from './marks.ts';
import { pointsOf } from '../model/points.ts';
import { markKeyboardFocus } from './focus.ts';
import { openCard, rowCard } from './popover.ts';
import { bindItem, metaLine, noNativeDrag, taskRow } from './task.ts';

/**
 * How a story card folds in the Week view: `name` is the story's note name, the key of the view's `collapsed:` list, and `folded`
 * is where the list has it. `behind` is the view's root when the card is in a list modal: the page behind it folds the name too.
 */
export interface Fold { name: string; folded: boolean; behind?: ParentNode }

/**
 * A story on the Week board: title, project and due, ring, and its lines, tickable on the card. A plannable one plans, as a card's
 * menu says. With `fold` (this week's board) the head starts with the chevron that folds the lines away, as To plan's cards have.
 */
export function storyCard(card: StoryCardVM, actions: Actions, fold?: Fold): HTMLLIElement {
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
  if (fold) {
    li.dataset.foldName = fold.name;   // the saved name: the chevron folds every card that has it (two notes can share a name)
    markKeyboardFocus(li, 'brain-keyboard-focus');   // the CSS shows the chevron for the keyboard: a click's focus is not that
  }
  bindItem(li, {
    open: () => actions.open(card.path),
    toggle: () => void actions.setNoteStatus(card.path, status === 'done' ? 'open' : 'done'),
    menu: (at) => openCard(li, at, { kind: 'story', title: card.title, path: card.path, state, ...(card.plan ? { dates: card.plan } : {}), ...(points ? { points } : {}) }, actions),
  });
  noNativeDrag(li);
  return li;
}

/**
 * The chevron of a story card in the Week view: it folds the lines away while they show, and opens them while they are folded.
 * The card changes in place, the chevron staying where it is (a redraw would build it again at opacity 0 and fade it in: a flicker);
 * `actions.foldStories` only saves it. The chevron has a key of its own, so a redraw gives the focus back to it, not to the card.
 * Every card of the name folds with it: on the page, and on the page behind a list modal.
 */
export function foldChevron(story: { title: string; key: string }, { name, folded, behind }: Fold, actions: Actions): HTMLButtonElement {
  const peek = h('button', 'brain-peek', { 'aria-expanded': String(!folded), 'aria-label': foldLabel(story.title, !folded), 'data-key': `fold-story:${story.key}` }, [peekIcon()]);
  peek.addEventListener('click', () => {
    const fold = peek.getAttribute('aria-expanded') === 'true';   // the chevron's own state: it is not the draw's
    const li = peek.closest<HTMLElement>('.brain-foldable');
    const own = li?.closest('.brain-page') ?? null;
    const page = own ?? behind?.querySelector('.brain-page') ?? null;
    // The name is saved once for every card that has it, so they all fold: compared as strings, so no selector needs escaping.
    const scopes = [own ?? li?.closest('.brain-modal-body') ?? null, page];
    const named = [...new Set(scopes.flatMap((scope) => [...scope?.querySelectorAll<HTMLElement>('.brain-foldable') ?? []]))]
      .filter((el) => el.dataset.foldName === name);
    foldCards(page, li && named.length === 0 ? [li] : named, fold);
    actions.foldStories([name], fold);
  });
  return peek;
}

/** Folds (`folded`) or opens these names in a Week page's set of folded stories, the set a list modal and the page's later draws read. */
export function foldIn(set: Set<string>, names: readonly string[], folded: boolean): void {
  for (const name of names) {
    if (folded) set.add(name);
    else set.delete(name);
  }
}

/**
 * Folds (`folded`) or opens these story cards of a Week page in place, then brings the page's Collapse all / Expand all button in
 * line with the page. A card on its own has no page and no button.
 */
export function foldCards(page: Element | null, cards: readonly HTMLElement[], folded: boolean): void {
  for (const card of cards) setFold(card, !folded);
  if (page) syncFoldAll(page);
}

/** The story cards of a Week page that show: To plan's, while it is closed, do not. */
function shownCards(page: Element): HTMLElement[] {
  return [...page.querySelectorAll<HTMLElement>('.brain-foldable')].filter((card) => card.closest('[hidden]') === null);
}

/**
 * Brings the page's Collapse all / Expand all button in line with its story cards that show: it reads Expand all once every one
 * of them is folded, and is hidden while none shows (a page whose only stories are in To plan, while it is closed).
 */
export function syncFoldAll(page: Element): void {
  const button = page.querySelector<HTMLElement>('.brain-fold-all');
  if (!button) return;
  const cards = shownCards(page);
  if (cards.length === 0) button.setAttribute('hidden', '');
  else button.removeAttribute('hidden');
  setFoldAll(button, cards.every((card) => card.querySelector('.brain-peek')?.getAttribute('aria-expanded') === 'false'));
}

/**
 * Collapse all, or Expand all once every story card that shows is folded. It names what it does next, and keeps its key, so a
 * redraw gives the focus back to it. A click folds or opens every story that shows on its page in place, all the cards of its
 * name (one in a closed To plan tile too), and saves the names; Expand all opens the page's stories only: names of stories that
 * are not here stay folded.
 */
export function foldAllButton(actions: Actions): HTMLButtonElement {
  const button = h('button', 'brain-quiet brain-fold-all', { 'data-key': 'fold-all' });
  setFoldAll(button, false);
  button.addEventListener('click', () => {
    const expand = button.getAttribute('aria-label') === 'Expand all stories';   // the button's own state: it is not the draw's
    const page = button.closest('.brain-page');
    // The names of the stories that show; then every card of those names, so the same story in a closed To plan tile folds with them.
    const names = new Set((page ? shownCards(page) : []).flatMap((card) => card.dataset.foldName ?? []));
    const cards = [...page?.querySelectorAll<HTMLElement>('.brain-foldable') ?? []].filter((card) => names.has(card.dataset.foldName ?? ''));
    foldCards(page, cards, !expand);
    actions.foldStories([...names], !expand);
  });
  return button;
}

/** Collapse all, or Expand all once `all` the page's stories are folded: it names what it does next, with the icon of that list. */
export function setFoldAll(button: Element, all: boolean): void {
  const label = all ? 'Expand all stories' : 'Collapse all stories';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.replaceChildren(foldAllIcon(all ? 'expand' : 'collapse'));
}

/** The story cards whose lines are open while planning, by key. A card drawn again keeps its lines open. */
const unfolded = new Set<string>();

/** The keys of the cards open now, sorted. A draw reads the list (storyListCard), so it is one of the draw's inputs. */
export function unfoldedKeys(): string[] {
  return [...unfolded].sort();
}

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
  setFold(card, open);
}

/** A story card's chevron and lines, folded or open. The Week board's cards use this alone: their fold is the config's list, not `unfolded`. */
function setFold(card: Element, open: boolean): void {
  const peek = card.querySelector<HTMLElement>('.brain-peek');
  const title = card.querySelector('.brain-card-title')?.textContent ?? '';
  peek?.setAttribute('aria-expanded', String(open));
  peek?.setAttribute('aria-label', foldLabel(title, open));
  const lines = card.querySelector('.brain-story-lines');
  if (open) lines?.removeAttribute('hidden');
  else lines?.setAttribute('hidden', '');
}

/**
 * A story as a card in a list: Planned or due, To plan's lists and the list modal (the Week view's, folded by `fold`), and Backlog's
 * No date (the planner's). Its head starts with a chevron that folds its lines open in place, then its title and meta, then its ring and count.
 * - With `fold` the card folds as a story card of the Week board does: the lines show unless the view's list has the name, the
 *   chevron shows on hover or keyboard focus (always on touch), and a click folds the name everywhere and saves it. `planning` is not read.
 * - Without it, while `planning` the lines are folded behind the chevron unless the card was opened; otherwise there is no chevron,
 *   and the lines show.
 */
export function storyListCard(row: RowVM, actions: Actions, planning: boolean, fold?: Fold): HTMLLIElement {
  const title = row.title;
  const open = fold ? !fold.folded : planning && unfolded.has(row.key);
  const peek = fold ? foldChevron(row, fold, actions) : h('button', 'brain-peek', { 'aria-expanded': String(open), 'aria-label': foldLabel(title, open) }, [peekIcon()]);
  const lines = h('ul', 'brain-tasks brain-story-lines', {}, (row.lines ?? []).map((line) => taskRow(line, actions)));
  if (fold ? fold.folded : planning && !open) lines.setAttribute('hidden', '');
  if (!fold) {
    if (!planning) peek.setAttribute('hidden', '');
    peek.addEventListener('click', () => foldStory(li, peek.getAttribute('aria-expanded') !== 'true'));
  }
  const { progress: count } = row;
  const classes = ['brain-tile', 'brain-card', ...(row.draggable ? ['brain-draggable'] : []), ...(fold ? ['brain-foldable'] : [])];
  const li = h('li', classes.join(' '), {
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
  if (fold) {
    li.dataset.foldName = fold.name;   // the saved name: the chevron folds every card that has it
    markKeyboardFocus(li, 'brain-keyboard-focus');   // the CSS shows the chevron for the keyboard: a click's focus is not that
  }
  bindItem(li, {
    open: () => actions.open(row.target.path),
    toggle: () => void actions.setNoteStatus(row.target.path, row.state === 'done' ? 'open' : 'done'),
    menu: (at) => openCard(li, at, rowCard(row), actions),
  });
  noNativeDrag(li);
  return li;
}

/**
 * A row of a list: a story is a card (folded by `fold` in the Week view, behind its chevron while `planning` elsewhere); any other
 * row is a task row.
 */
export function listItem(row: RowVM, actions: Actions, planning: boolean, fold?: Fold): HTMLLIElement {
  return row.progress ? storyListCard(row, actions, planning, fold) : taskRow(row, actions);
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
