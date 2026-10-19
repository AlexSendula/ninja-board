import type { Actions, ListEntry, ListHandle, ListKey, ListSpec } from './actions.ts';
import type { RowVM } from '../model/types.ts';
import type { Fold } from './card.ts';
import { foldIn, listItem, projectCard } from './card.ts';
import { enableDrag } from './drag.ts';
import { h, link } from './dom.ts';
import { taskRow } from './task.ts';

/** What the modal around a list's body can do: close it for good, and hold it back while an item is carried out. */
export interface ListHost {
  close(): void;
  carry(on: boolean, cancel: () => void): void;
}

/** The modal's title: the list's name and how many it holds, as in "Someday · 12". */
export function listTitle(spec: ListSpec): string {
  return `${spec.title} · ${spec.count}`;
}

/**
 * Fills a list modal's content with a search field and the grid of the list's entries, drawn as the board
 * draws them. Typing filters the grid. A card's or row's title closes the modal before it opens the note.
 * With drag, a press and hold carries an item out onto the view (its zones). `autofocus` puts the focus in the
 * search field. The returned function draws a new spec and keeps the query.
 */
export function renderListBody(
  content: HTMLElement, spec: ListSpec, actions: Actions, host: ListHost, opts: { autofocus?: boolean } = {},
): (next: ListSpec) => void {
  content.classList.add('brain-view', 'brain-modal-body');
  // A card opened from the list reads the view's day and week from here (cardContext in popover.ts).
  const { today, week } = spec.zones.dataset;
  if (today !== undefined) content.dataset.today = today;
  if (week === undefined) delete content.dataset.week;
  else content.dataset.week = week;
  const search = h('input', 'brain-search', {
    type: 'search',
    placeholder: 'Search',
    autocomplete: 'off',
    'aria-label': `Search ${spec.noun}`,
  });
  const grid = h('ul', 'brain-modal-grid');
  const none = h('li', 'brain-empty');
  none.hidden = true;
  let current = spec;
  // A title in the modal closes the modal first, then opens the note. A story folded in the modal goes into the page's set of folds,
  // so the modal opened again draws it folded (the page behind it folds by the chevron itself).
  const inModal: Actions = {
    ...actions,
    open: (path, line) => {
      host.close();
      actions.open(path, line);
    },
    foldStories: (names, folded) => {
      if (current.collapsed) foldIn(current.collapsed, names, folded);
      actions.foldStories(names, folded);
    },
  };
  const applyQuery = (): void => {
    const query = search.value.trim();
    const any = filterTiles(grid, query.toLowerCase());
    none.textContent = query === '' ? 'Nothing to show' : `No match for “${query}”`;
    none.hidden = any;
  };
  const draw = (next: ListSpec): void => {
    current = next;
    grid.replaceChildren(...next.entries.map((entry) => entryTile(entry, next, inModal)), none);
    applyQuery();
  };
  search.addEventListener('input', applyQuery);
  if (spec.drag) {
    // The grid stays for the modal's life, so its drag is set up once; a redraw's onDrop is read at each drop.
    // The carried item stays in the view after a drop (drag.ts leaves it there), so it leaves here: a re-render
    // clears it anyway, but one that changes nothing does not, and then it would stay on the board for good.
    enableDrag(grid, (item, target) => {
      current.onDrop?.(item, target);
      item.remove();
    }, {
      zones: spec.zones,
      carryTo: spec.zones,
      onLift: (cancel) => host.carry(true, cancel),
      onEnd: (dropped) => (dropped ? host.close() : host.carry(false, () => {})),
    });
  }
  content.replaceChildren(search, grid);
  draw(spec);
  // The field takes the focus only where a keyboard is expected: on a phone it would bring up the keyboard over the grid.
  if (opts.autofocus) search.focus();
  return draw;
}

function entryTile(entry: ListEntry, spec: ListSpec, actions: Actions): HTMLElement {
  // The Week view's lists fold their story cards by the view's list, and the page behind the modal folds with them.
  const foldOf = (row: RowVM): Fold | undefined => spec.collapsed && { name: row.title, folded: spec.collapsed.has(row.title), behind: spec.zones };
  if (entry.kind === 'card') {
    const card = projectCard(entry.card, actions);
    if (!spec.drag) card.classList.remove('brain-draggable');
    return card;
  }
  if (entry.kind === 'group') {
    return h('li', 'brain-tile', {}, [
      h('div', 'brain-group', {}, [
        link(entry.group.name, 'brain-group-name brain-link', () => actions.open(entry.group.path)),
        h('ul', 'brain-tasks', {}, entry.group.rows.map((row) => listItem(row, actions, true, foldOf(row)))),
      ]),
    ]);
  }
  // A story is a card, in a group like its No date neighbours, so the card gets the group's space between cards.
  if (entry.row.progress) {
    return h('li', 'brain-tile', {}, [h('div', 'brain-group', {}, [h('ul', 'brain-tasks', {}, [listItem(entry.row, actions, true, foldOf(entry.row))])])]);
  }
  return h('li', 'brain-tile', {}, [h('ul', 'brain-tasks', {}, [taskRow(entry.row, actions)])]);
}

/**
 * Shows what matches the lowercased query. A card or row tile matches by its text; a group matches by its
 * name (all its rows show) or else row by row. Returns whether anything shows.
 */
function filterTiles(grid: HTMLElement, query: string): boolean {
  let any = false;
  for (const tile of grid.querySelectorAll<HTMLElement>(':scope > .brain-tile')) {
    const group = tile.querySelector<HTMLElement>(':scope > .brain-group');
    let on = false;
    if (group) {
      const named = textOf(group.querySelector('.brain-group-name')).includes(query);
      for (const row of group.querySelectorAll<HTMLElement>(':scope > .brain-tasks > li')) {
        const match = named || textOf(row).includes(query);
        row.hidden = !match;
        on ||= match;
      }
    } else {
      on = textOf(tile).includes(query);
    }
    tile.hidden = !on;
    any ||= on;
  }
  return any;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').toLowerCase();
}

/** The open list modal of each board, with the key of the list it shows. */
const remembered = new WeakMap<HTMLElement, { key: ListKey; handle: ListHandle }>();

/** Show all N, in a label row: opens the list modal for this list and remembers its handle for root. */
export function showAllButton(root: HTMLElement, spec: ListSpec, actions: Actions): HTMLButtonElement {
  const button = h('button', 'brain-quiet brain-more', {
    'aria-haspopup': 'dialog', 'data-key': `show-all:${spec.key}`,
  }, [`Show all ${spec.count}`]);
  button.addEventListener('click', () => {
    remembered.get(root)?.handle.close();   // one list modal at a time
    remembered.set(root, { key: spec.key, handle: actions.showAll({ ...spec, opener: button }) });
  });
  return button;
}

/**
 * A re-render hands root's open list modal its list again, with the spec of the same key. A list that is
 * no longer drawn closes the modal. A closed modal is forgotten.
 */
export function refreshLists(root: HTMLElement, specs: ListSpec[]): void {
  const open = remembered.get(root);
  if (!open) return;
  if (open.handle.isOpen()) {
    const spec = specs.find((s) => s.key === open.key);
    if (spec) open.handle.update(spec);
    else open.handle.close();
  }
  if (!open.handle.isOpen()) remembered.delete(root);
}
