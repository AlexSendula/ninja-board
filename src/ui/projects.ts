import type { ProjectCardVM, ProjectsVM } from '../model/types.ts';
import type { Actions, ListEntry, ListSpec } from './actions.ts';
import { projectCard } from './card.ts';
import { dropLists, enableDrag } from './drag.ts';
import type { DropTarget } from './drag.ts';
import { h } from './dom.ts';
import { viewHead } from './header.ts';
import { refreshLists, showAllButton } from './listModal.ts';
import { mountPage } from './page.ts';

const EMPTY: Record<ProjectCardVM['status'], string> = {
  active: 'No active projects',
  paused: 'Nothing paused',
  someday: 'Nothing for someday',
  done: 'Nothing done yet',
};

export function renderProjects(root: HTMLElement, vm: ProjectsVM, actions: Actions): void {
  const page = mountPage(root, 'projects');
  page.append(
    viewHead({
      label: 'Projects',
      title: `${vm.active} active`,
      figure: vm.total > 0 ? { strong: String(vm.total), rest: 'in total' } : undefined,
      undo: actions,
    }),
    board(root, vm, actions),
  );
  // An open list modal (Show all on Done or Someday) gets its list again, or closes when it is no longer drawn.
  refreshLists(root, [listSpec(root, vm, 'done', actions), listSpec(root, vm, 'someday', actions)]);
}

// The title and figure already give the counts, so the columns have none.
function board(root: HTMLElement, vm: ProjectsVM, actions: Actions): HTMLElement {
  const el = h('div', 'brain-board brain-board-projects', {}, vm.columns.map((col) => column(root, vm, col, actions)));
  // On the new board, not on root: root outlives renders and would collect listeners.
  enableDrag(el, dropOnProjects(vm, actions));
  return el;
}

/** A column: Done and Someday show their first few cards (limit) and Show all N in the label row; the rest wait behind it. */
function column(root: HTMLElement, vm: ProjectsVM, col: ProjectsVM['columns'][number], actions: Actions): HTMLElement {
  const attrs: Record<string, string> = { 'data-column': col.status };
  if (col.status !== 'done') attrs['data-arrange'] = '';   // Done keeps its time order
  const listKey = col.status === 'done' || col.status === 'someday' ? col.status : undefined;
  const more = listKey !== undefined && col.limit !== undefined && col.cards.length > col.limit;
  const shown = col.limit === undefined ? col.cards : col.cards.slice(0, col.limit);
  const children = shown.length > 0
    ? shown.map((card) => projectCard(card, actions))
    : [h('li', 'brain-empty', {}, [EMPTY[col.status]])];
  const head = more && listKey
    ? h('div', 'brain-label-row', {}, [
      h('h3', 'brain-label', {}, [col.title]),
      showAllButton(root, listSpec(root, vm, listKey, actions), actions),
    ])
    : h('h3', 'brain-label', {}, [col.title]);
  return h('section', 'brain-col', attrs, [head, h('ul', 'brain-col-items', {}, children)]);
}

/** The list Show all opens for Done or Someday: every card of the column, draggable onto the board. */
function listSpec(root: HTMLElement, vm: ProjectsVM, key: 'done' | 'someday', actions: Actions): ListSpec {
  const col = vm.columns.find((c) => c.status === key);
  const cards = col?.cards ?? [];
  return {
    key,
    title: col?.title ?? key,
    noun: key === 'done' ? 'done projects' : 'someday projects',
    count: cards.length,
    entries: cards.map((card): ListEntry => ({ kind: 'card', card })),
    drag: true,
    zones: root,
    onDrop: dropOnProjects(vm, actions),
  };
}

/**
 * A drop on a column sets the project's status to that column. A drop at a place in Active, Paused or
 * Someday also saves that column's arrangement; a move also takes the card out of the column it left, if
 * that column has a saved list. Done keeps its time order. vm holds every card, so a saved list keeps the ones behind Show all.
 */
export function dropOnProjects(vm: ProjectsVM, actions: Actions): (item: HTMLElement, target: DropTarget) => void {
  const keys = (status: 'active' | 'paused' | 'someday') =>
    vm.columns.find((c) => c.status === status)?.cards.map((c) => c.arrangeKey) ?? [];
  return (item, target) => {
    if (target.kind !== 'column') return;
    const from = vm.columns.find((c) => c.cards.some((card) => card.key === item.dataset.key));
    const to = vm.columns.find((c) => c.status === target.column);
    if (!from || !to) return;
    const index = from.cards.findIndex((card) => card.key === item.dataset.key);
    const card = from.cards[index];
    // The drop is one undo step: the status it changes, and the place it takes in the column.
    void actions.group(`move “${card.title}” back`, () => {
      if (from !== to) void actions.setNoteStatus(card.path, to.status);
      const shown = { active: keys('active'), paused: keys('paused'), someday: keys('someday') };
      const lists = dropLists(shown, vm.saved, { column: from.status, index }, card.arrangeKey, { column: to.status, index: target.index });
      if (lists) actions.arrange(lists);
    });
  };
}
