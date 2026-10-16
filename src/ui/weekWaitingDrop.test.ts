import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { dropOnWeek } from './week.ts';
import { h } from './dom.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample } from '../../test/sample.ts';
import type { Arrangement, BoardItem, ThisWeekVM } from '../model/types.ts';

const TODAY = '2026-10-13';

function sampleWeek(): ThisWeekVM {
  const w = buildWeek(loadSample(), TODAY);
  assert.ok(w.kind === 'this', 'expected this week');
  return w;
}

/** The item with this title, in whichever column the board holds it. */
function find(vm: ThisWeekVM, title: string): BoardItem {
  const all = [...vm.columns.todo, ...vm.columns.doing, ...vm.columns.waiting, ...vm.columns.done];
  const found = all.find((i) => (i.kind === 'row' ? i.row.title : i.card.title) === title);
  assert.ok(found, 'no item ' + title);
  return found;
}

const keyOf = (i: BoardItem) => (i.kind === 'row' ? i.row.key : i.card.key);

/** A drop of the item on a column at a place (or none): what the board's drag hands dropOnWeek. */
function dropOn(vm: ThisWeekVM, item: BoardItem, column: string, index: number | null): unknown[][] {
  const { actions, calls } = recorder();
  const el = h('li', 'brain-task', { 'data-key': keyOf(item) });
  dropOnWeek(vm, actions)(el, { kind: 'column', column, index });
  return calls;
}

test('a line dropped on Waiting is set to waiting, and a place there saves Waiting\'s whole order', () => {
  const vm = sampleWeek();
  const calls = dropOn(vm, find(vm, 'Clean the gutters'), 'waiting', 0);
  assert.equal(calls[0][0], 'setState');
  assert.equal(calls[0][2], 'waiting');
  assert.deepEqual(calls[1], ['arrange', { waiting: ['Home › Clean the gutters', 'Choose a contractor'] }]);
  assert.equal(calls.length, 2);
});

test('a story dropped on Waiting gets the waiting status, and with no place saves nothing', () => {
  const vm = sampleWeek();
  const item = find(vm, "Choose hosting for Sam's site");
  assert.deepEqual(dropOn(vm, item, 'waiting', null), [['setNoteStatus', item.kind === 'card' ? item.card.path : '', 'waiting']]);
});

test('a waiting story dropped on Doing is set to doing, and its place there is saved in Doing\'s list', () => {
  const vm = sampleWeek();
  const item = find(vm, 'Choose a contractor');
  const calls = dropOn(vm, item, 'doing', 0);
  assert.equal(calls[0][0], 'setNoteStatus');
  assert.equal(calls[0][2], 'doing');
  assert.deepEqual(calls[1], ['arrange', {
    doing: ['Choose a contractor', 'Website for Sam › Build the homepage header', "Choose hosting for Sam's site"],
  }]);
});

test('a drop on Waiting that keeps the order calls nothing', () => {
  const vm = sampleWeek();
  assert.deepEqual(dropOn(vm, find(vm, 'Choose a contractor'), 'waiting', 0), []);
});

test('a drop on Doing saves Doing\'s order, which holds no waiting item', () => {
  const vm = sampleWeek();
  const calls = dropOn(vm, find(vm, 'Build the homepage header'), 'doing', 1);
  assert.deepEqual(calls, [['arrange', { doing: ["Choose hosting for Sam's site", 'Website for Sam › Build the homepage header'] }]]);
});

test('a waiting item that leaves Waiting is taken out of a saved Waiting list only; its new column is saved as it was placed', () => {
  const vm = sampleWeek();
  const saved: Arrangement = { waiting: ['Choose a contractor', 'Nope'] };
  const calls = dropOn({ ...vm, saved }, find(vm, 'Choose a contractor'), 'doing', 1);
  assert.equal(calls[0][2], 'doing');
  assert.deepEqual(calls[1], ['arrange', {
    doing: ['Website for Sam › Build the homepage header', 'Choose a contractor', "Choose hosting for Sam's site"],
    waiting: ['Nope'],
  }]);
});
