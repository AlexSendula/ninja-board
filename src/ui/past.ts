import type { PastWeekVM, RecordRowVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h, link } from './dom.ts';
import { metaLine, readonlyRow } from './task.ts';
import { foldTile, labelRow } from './page.ts';
import { foldAllButton, foldChevron } from './card.ts';
import { markKeyboardFocus } from './focus.ts';

/**
 * A past week under its strip: the line that says where it comes from, with the Collapse all button at its end when the board has a
 * story card, the read-only board and, for a record, its Backlog folded under its count. The columns have no data-column and
 * nothing here enables dragging, so nothing moves; titles still open their note. A story is a card whose lines are read-only rows;
 * it folds like a story card of the Week board, by the view's `collapsed:` list (`folded`), and folding is not an edit.
 */
export function pastParts(vm: PastWeekVM, actions: Actions, backlogOpen: boolean, folded: ReadonlySet<string> = new Set()): HTMLElement[] {
  const line = h('div', 'brain-week-line', {}, [metaLine(vm.source, actions)]);
  const board = h('div', 'brain-board brain-board-week', {}, vm.columns.map((col) => h('section', 'brain-col', {}, [
    labelRow(col.title, col.rows.length),
    h('ul', 'brain-col-items', {}, col.rows.length > 0 ? col.rows.map((r) => item(r, actions, folded)) : [h('li', 'brain-empty', {}, [col.empty])]),
  ])));
  if (board.querySelector('.brain-foldable')) line.append(foldAllButton(actions));
  const parts: HTMLElement[] = [line, board];
  const backlog = vm.backlog ?? [];
  if (backlog.length > 0) {
    parts.push(foldTile({
      name: 'backlog',
      title: 'Backlog',
      count: backlog.length,
      open: backlogOpen,
      content: [h('ul', 'brain-tasks', {}, backlog.map((r) => readonlyRow(r, actions)))],
    }));
  }
  return parts;
}

/** A row of the board: a story with lines is a card, any other item a read-only row. */
function item(row: RecordRowVM, actions: Actions, folded: ReadonlySet<string>): HTMLLIElement {
  return row.lines ? storyCard(row, row.lines, actions, folded.has(row.title)) : readonlyRow(row, actions);
}

/**
 * A story of a past week as a read-only card: the chevron that folds its lines away, its title (it opens the story's note while that
 * exists, and is plain text without one), its own words when the week lists it (its context and state), and its lines as read-only
 * rows. No ring, no drag, no state menu, no focus stop of its own: the title, the chevron and the lines' links are its controls.
 */
function storyCard(row: RecordRowVM, lines: RecordRowVM[], actions: Actions, folded: boolean): HTMLLIElement {
  const { path } = row;
  const title = path === undefined ? h('span', undefined, {}, [row.title]) : link(row.title, 'brain-link brain-stretch', () => actions.open(path));
  // The card is no focus stop, so the title link has a key of its own, like the chevron: a redraw gives the focus back to it, not to the first control.
  if (path !== undefined) title.setAttribute('data-key', `open-story:${row.key}`);
  // Each line row has the key of its line: a redraw gives the focus on a line's link back to that link, not to the chevron.
  const list = h('ul', 'brain-tasks brain-story-lines', {}, lines.map((line) => {
    const r = readonlyRow(line, actions);
    r.dataset.key = line.key;
    return r;
  }));
  if (folded) list.setAttribute('hidden', '');
  const li = h('li', 'brain-tile brain-card brain-foldable', { 'data-state': row.state, 'data-key': row.key }, [
    h('header', 'brain-card-head', {}, [
      foldChevron(row, { name: row.title, folded }, actions),
      h('div', undefined, {}, [
        h('h4', 'brain-card-title', {}, [title]),
        row.meta.length > 0 ? metaLine(row.meta, actions, path) : null,
      ]),
    ]),
    list,
  ]);
  li.dataset.foldName = row.title;   // the saved name: the chevron folds every card that has it
  markKeyboardFocus(li, 'brain-keyboard-focus');   // the CSS shows the chevron for the keyboard: a click's focus is not that
  return li;
}
