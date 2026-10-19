import type { BoardItem, RowTarget, ThisWeekVM, WaitingView, WeekVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h } from './dom.ts';
import { viewHead } from './header.ts';
import { markKeyboardFocus } from './focus.ts';
import { nextChange } from './clock.ts';
import { weekStrip } from './strip.ts';
import { taskRow } from './task.ts';
import { foldAllButton, foldIn, storyCard, syncFoldAll } from './card.ts';
import { refreshLists } from './listModal.ts';
import { dropOnPlan, planParts, planToggle, planWasOpen, toPlanId, toPlanSpecs } from './plan.ts';
import { dropLists, enableDrag } from './drag.ts';
import type { DropTarget } from './drag.ts';
import type { HeadOpts } from './header.ts';
import { pastParts } from './past.ts';
import { switchIcon } from './marks.ts';
import { foldWasOpen, labelRow, mountPage } from './page.ts';

type Column = keyof ThisWeekVM['columns'];

const COLUMNS: { key: Column; title: string; empty: string }[] = [
  { key: 'todo', title: 'To do', empty: 'Nothing planned this week' },
  { key: 'doing', title: 'Doing', empty: 'Nothing in progress' },
  { key: 'waiting', title: 'Waiting', empty: 'Nothing waiting' },
  { key: 'done', title: 'Done', empty: 'Nothing done this week yet' },
];

/** A story note's status for each column. */
const NOTE_STATUS: Record<Column, string> = { todo: 'open', doing: 'doing', waiting: 'waiting', done: 'done' };

/**
 * Draws the week. With `now` ("HH:MM", from the draw context) this week's strip hides the appointments that have
 * ended. The root's data-change-at says when the picture next changes by itself, the next end today, so that the
 * view can draw again then; it is removed when nothing will (an upcoming week, a record, a day that is over).
 * `waiting` is the view the config gives Waiting on the board: Column (the default), or Group view's layout under Doing.
 * `collapsed` is the story names the config has folded: every story card of every week hides its lines, by the story's name.
 */
export function renderWeek(root: HTMLElement, vm: WeekVM, actions: Actions, opts: { now?: string; waiting?: WaitingView; collapsed?: readonly string[] } = {}): void {
  // Read before mountPage clears root: a re-render keeps a past week's Backlog open.
  const backlogOpen = foldWasOpen(root, 'backlog');
  const toPlanOpen = vm.kind === 'upcoming' && planWasOpen(root, vm.start);   // read before the redraw clears root
  const hovered = hoveredKeys(root);   // likewise: what is under the pointer
  // The page's folds. A fold changes the page in place and draws nothing, so a fold keeps this set up to date: a list modal opened
  // later (it holds this set) draws the folds as they are now. The next draw reads the config's list again.
  const folded = new Set(opts.collapsed);
  const weekActions: Actions = { ...actions, foldStories: (names, fold) => { foldIn(folded, names, fold); actions.foldStories(names, fold); } };
  const page = mountPage(root, 'week');
  page.append(
    viewHead({
      label: vm.label,
      title: vm.title,
      pager: pagerOf(vm, actions),
      figure: figureOf(vm),
      tasks: tasksOf(vm),
      tally: vm.kind === 'upcoming' && vm.planned > 0 ? vm.tally : undefined,
      points: vm.points,
      record: vm.kind === 'past',
      undo: actions,
      titleAside: vm.kind === 'upcoming' ? planToggle(vm, toPlanOpen, toPlanId(vm.start)) : undefined,
    }),
    // This week and the weeks ahead take a dropped row on their days; a past week is read-only.
    weekStrip(vm.days, actions, { drop: vm.kind !== 'past', now: opts.now, record: vm.kind === 'past' }),
  );
  const change = vm.kind === 'this' && opts.now !== undefined ? nextChange(vm.days.find((d) => d.isToday)?.events ?? [], opts.now) : undefined;
  if (change === undefined) delete root.dataset.changeAt;
  else root.dataset.changeAt = change;
  // The drag goes on the page, so the strip's days count. Not on root: it outlives renders and would
  // collect listeners. A past week is read-only and has none.
  if (vm.kind === 'this') {
    page.append(comingUp(vm, weekActions), board(vm, weekActions, opts.waiting ?? 'column', folded));
    enableDrag(page, dropOnWeek(vm, actions));
  } else if (vm.kind === 'upcoming') {
    page.append(planParts(vm, root, weekActions, toPlanOpen, folded));
    enableDrag(page, dropOnPlan(vm, actions));
  } else {
    page.append(...pastParts(vm, weekActions, backlogOpen, folded));
  }
  syncFoldAll(page);   // the Collapse all button reads from the cards that are drawn
  refreshLists(root, vm.kind === 'upcoming' ? toPlanSpecs(vm, root, weekActions, folded) : []);
  keepHover(page, hovered);
}

/**
 * The keys of the elements under the pointer: a card, and the chevron or button on it that the pointer is on. With none under it, the
 * elements that keep their hover look (see keepHover) stand in until the pointer leaves them: a second draw soon after the first comes
 * before the browser has put :hover on the new ones. A kept element that the pointer is not on never wins over one it is on. A browser
 * that can't say (no :hover) has none.
 */
function hoveredKeys(root: HTMLElement): string[] {
  try {
    const keyed = [...root.querySelectorAll<HTMLElement>('[data-key]')];
    const keysOf = (on: (el: HTMLElement) => boolean) => keyed.filter(on).flatMap((el) => el.dataset.key ?? []);
    const under = keysOf((el) => el.matches(':hover'));
    return under.length > 0 ? under : keysOf((el) => el.classList.contains('brain-hover-kept'));
  } catch {
    return [];
  }
}

/**
 * The redraw replaced what is under the pointer, and the new elements start from their resting look: the card without its shadow, the
 * chevron hidden (it shows on hover alone) and without its hover colours, a quiet button in its muted colour. Each fades or jumps into the
 * hover look a moment later: a flicker. The elements with each hovered key keep the hover look (the class, before the first paint) until
 * the pointer first leaves them. The browser puts :hover on the new elements within a frame, so two frames on, an element that the pointer
 * is not on (a move or a layout shift took it elsewhere, and a pointerleave never comes for an element it never entered) loses the class.
 */
function keepHover(page: HTMLElement, keys: string[]): void {
  if (keys.length === 0) return;
  const keyed = [...page.querySelectorAll<HTMLElement>('[data-key]')];
  // Every element with a hovered key: a story can be drawn twice on an upcoming week (Planned or due and To plan) with one key, and the
  // pointer is on either. The two-frame check below takes the class off the copy it is not on.
  const kept = new Set(keys.flatMap((key) => keyed.filter((el) => el.dataset.key === key)));
  for (const el of kept) {
    el.classList.add('brain-hover-kept');
    el.addEventListener('pointerleave', () => el.classList.remove('brain-hover-kept'), { once: true });
  }
  const win = page.ownerDocument.defaultView;
  win?.requestAnimationFrame(() => win.requestAnimationFrame(() => {
    for (const el of kept) {
      try {
        if (!el.matches(':hover')) el.classList.remove('brain-hover-kept');
      } catch { /* a browser that can't say (no :hover) leaves the class on until the pointer leaves */ }
    }
  }));
}

/** ‹ and › show the weeks before and after; This week, on any other week, goes back to now. */
function pagerOf({ pager }: WeekVM, actions: Actions): HeadOpts['pager'] {
  const { prev, next, thisWeek } = pager;
  return {
    onPrev: () => actions.showWeek(prev),
    onNext: () => actions.showWeek(next),
    onThisWeek: thisWeek === undefined ? undefined : () => actions.showWeek(thisWeek),
  };
}

/**
 * The week's tasks figure: this week's done out of all its tasks, and a record's done out of its total (done, in progress
 * and not done; its Backlog isn't counted). None when there is nothing to count.
 */
function tasksOf(vm: WeekVM): HeadOpts['tasks'] {
  if (vm.kind === 'upcoming') return undefined;
  const total = vm.kind === 'this' ? vm.done + vm.left : vm.total;
  return total !== undefined && total > 0 ? { done: vm.done, total } : undefined;
}

/**
 * A past week's figure from your notes, for a week with no record: what got done. The other weeks have their figures in
 * the head's tasks and tally (see tasksOf). No figure when nothing was done.
 */
function figureOf(vm: WeekVM): HeadOpts['figure'] {
  if (vm.kind !== 'past' || vm.total !== undefined) return undefined;
  return vm.done > 0 ? { strong: String(vm.done), rest: 'done' } : undefined;
}

let comingUps = 0;   // a unique id per Coming up heading, for aria-labelledby

/**
 * Under this week's strip: the next three weeks, each with its count. A chip shows that week. The row ends with the button that
 * folds every story on the board or opens them all (none when there are no stories).
 */
function comingUp(vm: ThisWeekVM, actions: Actions): HTMLElement {
  const id = `brain-coming-up-${++comingUps}`;
  const chips = vm.comingUp.map(({ start, week, count }) => {
    const chip = h('button', count > 0 ? 'brain-week-chip' : 'brain-week-chip brain-is-empty', {
      'aria-label': `Week ${week}, ${count > 0 ? `${count} planned or due` : 'nothing planned or due'}`,
    }, [`Week ${week}`, h('span', undefined, {}, [String(count)])]);
    chip.addEventListener('click', () => actions.showWeek(start));
    return chip;
  });
  const stories = COLUMNS.some(({ key }) => vm.columns[key].some((item) => item.kind === 'card'));
  return h('nav', 'brain-week-line', { 'aria-labelledby': id }, [
    h('h3', 'brain-label', { id }, ['Coming up']),
    h('div', 'brain-week-chips', {}, chips),
    stories ? foldAllButton(actions) : null,
  ]);
}

/**
 * The board: four columns in both views, To do, Doing, Waiting and Done, and Waiting is always its own column. Group
 * view (the board's data-waiting) changes only the layout, and the CSS puts Waiting under Doing at 720px and up. Below
 * that the CSS shows Column view whatever is saved. Waiting's label row holds both labels, and the CSS shows one.
 */
function board(vm: ThisWeekVM, actions: Actions, waiting: WaitingView, folded: ReadonlySet<string>): HTMLElement {
  return h('div', 'brain-board brain-board-week', { 'data-waiting': waiting }, COLUMNS.map(({ key, title, empty }) => {
    const items = vm.columns[key];
    const attrs: Record<string, string> = { 'data-column': key, 'data-states': key };   // what the CSS selects the columns by
    if (key !== 'done') attrs['data-arrange'] = '';   // To do, Doing and Waiting can be arranged; Done keeps its time order
    const label = labelRow(title, items.length);
    if (key === 'waiting') label.append(h('h4', 'brain-group-name', {}, [`Waiting on · ${items.length}`]), waitingSwitch(waiting, actions));
    const section = h('section', 'brain-col', attrs, [label, h('ul', 'brain-col-items', {}, rowsOf(items, empty, actions, folded))]);
    if (key === 'waiting') markKeyboardFocus(section, 'brain-keyboard-focus');   // its switch shows for the keyboard at once
    return section;
  }));
}

/** A column's items as its list shows them: each drawn item, or the one line that says the list is empty. */
function rowsOf(items: BoardItem[], empty: string, actions: Actions, folded: ReadonlySet<string>): HTMLElement[] {
  return items.length > 0 ? items.map((item) => boardItem(item, actions, folded)) : [h('li', 'brain-empty', {}, [empty])];
}

/**
 * Waiting's switch, at the end of its label row. It names the view it goes to, and keeps its key, so a redraw gives the
 * focus back to it. The CSS shows it at 720px and up only.
 */
function waitingSwitch(view: WaitingView, actions: Actions): HTMLButtonElement {
  const label = view === 'column' ? 'Show Waiting inside Doing' : 'Show Waiting as its own column';
  const button = h('button', 'brain-switch', { 'aria-label': label, title: label, 'data-key': 'waiting-switch' }, [
    switchIcon(view === 'column' ? 'rows' : 'columns'),
  ]);
  button.addEventListener('click', () => actions.waitingView(view === 'column' ? 'group' : 'column'));
  return button;
}

/** A board item: a task row, or a story card with its chevron, folded where the config has its name. */
function boardItem(item: BoardItem, actions: Actions, folded: ReadonlySet<string>): HTMLElement {
  const el = item.kind === 'row' ? taskRow(item.row, actions) : storyCard(item.card, actions, { name: item.arrangeKey, folded: folded.has(item.arrangeKey) });
  el.dataset.key = keyOf(item);
  return el;
}

/**
 * A drop on a column, and a drop at a place in one. A change of column: a task row gets that state, and a story card gets
 * the matching note status. Waiting gets the waiting
 * state the same way. A place in To do, Doing or Waiting saves that column's arrangement; a move also takes the
 * item out of the column it left, if that column has a saved list. Done keeps its time order. A day plans a board
 * line the model made plannable (`plan` set) for that date. A week and To plan are not acted on here. A repeating row
 * changes state like any row: a drop on Done completes its occurrence (the write does that).
 */
export function dropOnWeek(vm: ThisWeekVM, actions: Actions): (itemEl: HTMLElement, target: DropTarget) => void {
  return (itemEl, target) => {
    const found = findItem(vm, itemEl.dataset.key);
    if (target.kind === 'day') {
      // A board line, story card or repeating row the model made plannable is planned on that day.
      const planned = found ? plannedTarget(found.item) : undefined;
      if (planned) void actions.plan(planned, { day: target.date });
      return;
    }
    if (target.kind !== 'column' || !found || !isColumn(vm, target.column)) return;
    const { item, column, index } = found;
    // The drop is one undo step: the state it changes, and the place it takes in the column.
    const to = target.column;
    void actions.group(`move “${item.kind === 'row' ? item.row.title : item.card.title}” back`, () => {
      if (column !== to) {
        if (item.kind === 'card') void actions.setNoteStatus(item.card.path, NOTE_STATUS[to]);
        else void actions.setState(item.row.target, to);
      }
      const shownKeys = (items: BoardItem[]) => items.map((i) => i.arrangeKey);
      const shown = { todo: shownKeys(vm.columns.todo), doing: shownKeys(vm.columns.doing), waiting: shownKeys(vm.columns.waiting) };
      const lists = dropLists(shown, vm.saved, { column, index }, item.arrangeKey, target);
      if (lists) actions.arrange(lists);
    });
  };
}

/** The target a board item is planned by, when the model made it plannable: a line or a row's, or a story card's note. */
function plannedTarget(item: BoardItem): RowTarget | undefined {
  if (item.kind === 'row') return item.row.plan ? item.row.target : undefined;
  return item.card.plan ? { kind: 'note', path: item.card.path, state: item.card.column } : undefined;
}

/** The board's item with this key, in whichever column holds it: each item is in one column. */
function findItem(vm: ThisWeekVM, key: string | undefined): { item: BoardItem; column: Column; index: number } | undefined {
  for (const column of Object.keys(vm.columns) as Column[]) {
    const index = vm.columns[column].findIndex((i) => keyOf(i) === key);
    if (index >= 0) return { item: vm.columns[column][index], column, index };
  }
  return undefined;
}

function keyOf(item: BoardItem): string {
  return item.kind === 'row' ? item.row.key : item.card.key;
}

function isColumn(vm: ThisWeekVM, column: string): column is Column {
  return Object.hasOwn(vm.columns, column);
}
