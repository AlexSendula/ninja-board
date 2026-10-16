// The drops, Alt+arrows and planner picks that are one undo step each: the groups undoGroups.test.ts does not cover. The
// Week board's drop and its Alt+↑/↓ are named for the row they moved; a planner's date picks, for the row they dated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder, rowFor } from '../../test/ui.ts';   // first: it installs the DOM
import { loadSample } from '../../test/sample.ts';
import type { Actions } from './actions.ts';
import type { DropTarget } from './drag.ts';
import type { RowVM, ThisWeekVM } from '../model/types.ts';
import { buildWeek } from '../model/week.ts';
import { dropOnWeek, renderWeek } from './week.ts';
import { h } from './dom.ts';
import { openCard, rowCard } from './popover.ts';
import { taskRow } from './task.ts';

const TODAY = '2026-10-13';
const AT = { x: 40, y: 48 };
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The recorder's actions, with each group's name kept in order and the group run to its end. */
function grouped() {
  const { actions, calls } = recorder();
  const groups: string[] = [];
  const spied: Actions = {
    ...actions,
    group: async (label, run) => {
      groups.push(label);
      await run();
    },
  };
  return { actions: spied, calls, groups };
}

/** The element on the page that carries this key. Keys have quotes and slashes, so they are compared, not selected. */
function keyed(root: HTMLElement, key: string): HTMLElement {
  const el = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((e) => e.dataset.key === key);
  assert.ok(el, `an element with key ${key}`);
  return el;
}

/** A board item's key, as the Week board draws it on the element. */
const keyOfItem = (item: { kind: 'row'; row: RowVM } | { kind: 'card'; card: { key: string } }): string =>
  item.kind === 'row' ? item.row.key : item.card.key;

/** The Week board for this week, as the plugin draws it. */
function thisWeek(actions: Actions): { root: HTMLElement; vm: ThisWeekVM } {
  const vm = buildWeek(loadSample(), TODAY) as ThisWeekVM;
  assert.equal(vm.kind, 'this');
  const root = h('div', 'brain-view');
  root.dataset.today = TODAY;
  renderWeek(root, vm, actions);
  return { root, vm };
}

test('a row dropped on Doing on the Week board is one step, named for the row it moved', async () => {
  const { actions, calls, groups } = grouped();
  const { root, vm } = thisWeek(actions);
  const item = vm.columns.todo.find((i) => i.kind === 'row' && !i.row.repeating);
  assert.ok(item && item.kind === 'row');
  const target: DropTarget = { kind: 'column', column: 'doing', index: null } as DropTarget;
  dropOnWeek(vm, actions)(keyed(root, keyOfItem(item)), target);
  await settle();
  assert.deepEqual(groups, [`move “${item.row.title}” back`]);
  assert.equal(calls[0]?.[0], 'setState');
});

test('Alt+↓ on the Week board moves a row one place in its column, as one step named for it', async () => {
  const { actions, calls, groups } = grouped();
  const { root, vm } = thisWeek(actions);   // renderWeek wires the board's drag and Alt+arrow itself
  const first = vm.columns.doing[0];
  assert.ok(first && vm.columns.doing.length > 1, 'two rows in Doing');
  fire(keyed(root, keyOfItem(first)), 'keydown', { key: 'ArrowDown', altKey: true });
  await settle();
  assert.deepEqual(groups, [`move “${first.kind === 'row' ? first.row.title : first.card.title}” back`]);
  assert.deepEqual(calls.map((c) => c[0]), ['arrange']);
});

test('a planner\'s day click is one step: the plan it sets and the deadline it clears, named for the row', async () => {
  const { actions, calls, groups } = grouped();
  const row: RowVM = rowFor('Compare energy contracts', { plan: { scheduled: '2026-10-13', due: '2026-10-16' }, draggable: true });
  const board = h('div', 'brain-view');
  board.dataset.today = TODAY;
  document.body.append(board);
  const li = taskRow(row, actions);
  board.append(li);
  const el = openCard(li, AT, rowCard(row), actions);
  fire(el.querySelector('[data-day="2026-10-16"]')!, 'click');
  await settle();
  assert.deepEqual(groups, ['restore the dates of “Compare energy contracts”']);
  assert.deepEqual(calls.map((c) => c[0]), ['plan', 'due']);
  el.remove();
});
