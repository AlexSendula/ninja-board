import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, recorder, rowFor } from '../../test/ui.ts';   // first: it installs the DOM
import { renderWeek } from './week.ts';
import { refocus } from './focus.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample } from '../../test/sample.ts';
import type { BoardItem, ThisWeekVM, WaitingView, WeekVM } from '../model/types.ts';
import type { Actions } from './actions.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42: Mon 12 to Sun 18 October
// The sample's Week: To do 8, Doing 2 (its own), Waiting 1 (the Choose a contractor card), Done 2.
const vm = thisWeek(buildWeek(loadSample(), TODAY));

function thisWeek(model: WeekVM): ThisWeekVM {
  assert.ok(model.kind === 'this', 'expected this week');
  return model;
}

function render(model: ThisWeekVM, waiting?: WaitingView, actions: Actions = recorder().actions): HTMLElement {
  const root = document.createElement('div');
  renderWeek(root, model, actions, waiting === undefined ? {} : { waiting });
  return root;
}

/**
 * The board's own columns: the sections that sit directly in it. Waiting is one of them in both views: Group view
 * only changes the board's layout (its data-waiting), and the CSS places the columns.
 */
function columns(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.brain-page > .brain-board.brain-board-week > section.brain-col')];
}

function board(root: HTMLElement): HTMLElement {
  const found = root.querySelector<HTMLElement>('.brain-page > .brain-board.brain-board-week');
  assert.ok(found, 'no board');
  return found;
}

/** The element with this data-key, as drawn. */
function keyed(root: HTMLElement, key: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((el) => el.dataset.key === key);
  assert.ok(found, 'no element for ' + key);
  return found;
}

/** The sample's one waiting item, a story card: its key. */
function waitingCardKey(): string {
  const item = vm.columns.waiting[0];
  assert.ok(item?.kind === 'card', 'the sample has one waiting card');
  return item.card.key;
}

test('Waiting, column view: four columns, To do, Doing, Waiting and Done, with their counts', () => {
  const root = render(vm);
  const cols = columns(root);
  assert.deepEqual(cols.map((c) => c.dataset.column), ['todo', 'doing', 'waiting', 'done']);
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-label-row > .brain-label')?.textContent), ['To do', 'Doing', 'Waiting', 'Done']);
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-label-row > .brain-count')?.textContent), ['7', '2', '1', '2']);
  assert.deepEqual(cols.map((c) => c.querySelectorAll(':scope > .brain-col-items > [data-key]').length), [7, 2, 1, 2]);
  assert.equal(board(root).hasAttribute('data-waiting'), false);
});

test('Waiting, column view: its column carries data-states and data-arrange, and its label row holds both labels, then its switch', () => {
  const waiting = columns(render(vm))[2];
  assert.equal(waiting.className, 'brain-col');
  assert.equal(waiting.dataset.states, 'waiting');
  assert.equal(waiting.hasAttribute('data-arrange'), true);
  // Both labels are drawn; the CSS shows the column's in Column view and the group's in Group view.
  assert.deepEqual([...waiting.querySelector('.brain-label-row')!.children].map((c) => c.tagName), ['H3', 'SPAN', 'H4', 'BUTTON']);
  assert.equal(waiting.querySelector(':scope > .brain-label-row > h4.brain-group-name')?.textContent, 'Waiting on · 1');
  const current = waiting.querySelector<HTMLElement>(':scope > .brain-label-row > button.brain-switch')!;
  assert.equal(current.getAttribute('aria-label'), 'Show Waiting inside Doing');
  assert.equal(current.getAttribute('title'), 'Show Waiting inside Doing');
  assert.equal(current.getAttribute('data-key'), 'waiting-switch');
  const icon = current.querySelector('svg.brain-switch-icon')!;
  assert.equal(icon.getAttribute('aria-hidden'), 'true');
  const shapes = [...icon.children];
  assert.deepEqual(shapes.map((el) => el.localName), ['rect', 'path']);
  assert.equal(shapes[1].getAttribute('d'), 'M2 6h12M2 10h12');   // the rows icon
});

test('Waiting, column view: Doing counts its own items, and no group sits in it', () => {
  const doing = columns(render(vm))[1];
  assert.equal(doing.querySelector('.brain-label-row > .brain-count')?.textContent, '2');
  assert.deepEqual([...doing.children].map((c) => c.className), ['brain-label-row', 'brain-col-items']);
  absent(doing.querySelector('.brain-waiting-group'));
});

test('Waiting, column view: a waiting card is in its column, in the waiting state, with its meta words', () => {
  const root = render(vm);
  const card = keyed(root, waitingCardKey());
  assert.equal(card.getAttribute('data-state'), 'waiting');
  assert.equal(card.closest('section')?.dataset.column, 'waiting');
  const strong = card.querySelector('.brain-meta > .brain-strong')!;
  assert.equal(strong.textContent, 'Waiting on Bram');
  assert.equal(strong.querySelector(':scope > .brain-waiting-words')?.textContent, 'Waiting on ');
});

test('Waiting, column view: a waiting row is a task row in the waiting state, keyed by its line', () => {
  const quote: BoardItem = { kind: 'row', row: rowFor('Get the written quote from Bram', { meta: [{ text: 'Chase Thu' }] }), arrangeKey: 'quote' };
  const root = render({ ...vm, columns: { ...vm.columns, waiting: [quote, ...vm.columns.waiting] } });
  assert.equal(columns(root)[2].querySelector('.brain-label-row > .brain-count')?.textContent, '2');
  assert.equal(quote.kind, 'row');
  const row = keyed(root, quote.row.key);
  assert.equal(row.tagName, 'LI');
  assert.equal(row.getAttribute('data-state'), 'waiting');
  assert.equal(row.querySelector('.brain-meta')?.textContent, 'Chase Thu');
});

test('Waiting, column view: empty, it counts 0 and says Nothing waiting', () => {
  const none = { ...vm, columns: { ...vm.columns, waiting: [] } };
  const waiting = columns(render(none))[2];
  assert.equal(waiting.querySelector('.brain-label-row > .brain-count')?.textContent, '0');
  assert.equal(waiting.querySelector(':scope > .brain-col-items > li.brain-empty')?.textContent, 'Nothing waiting');
});

test('Waiting, group view: the same four columns in the same order, with their counts, and the board says so', () => {
  const root = render(vm, 'group');
  assert.equal(board(root).dataset.waiting, 'group');
  const cols = columns(root);
  assert.deepEqual(cols.map((c) => c.dataset.column), ['todo', 'doing', 'waiting', 'done']);
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-label-row > .brain-count')?.textContent), ['7', '2', '1', '2']);
  absent(root.querySelector('.brain-waiting-group'));
});

test('Waiting, group view: Doing is a column of its own rows, with no group inside it', () => {
  const doing = columns(render(vm, 'group'))[1];
  assert.deepEqual([...doing.children].map((c) => c.className), ['brain-label-row', 'brain-col-items']);
  assert.equal(doing.querySelectorAll(':scope > .brain-col-items > [data-key]').length, 2);
  assert.equal(doing.hasAttribute('data-arrange'), true);
});

test('Waiting, group view: the Waiting column is the group, with its group label "Waiting on · N" and the switch to a column', () => {
  const waiting = columns(render(vm, 'group'))[2];
  assert.equal(waiting.dataset.states, 'waiting');
  assert.equal(waiting.dataset.column, 'waiting');
  assert.equal(waiting.hasAttribute('data-arrange'), true);
  assert.equal(waiting.querySelector(':scope > .brain-label-row > h4.brain-group-name')?.textContent, 'Waiting on · 1');
  assert.equal(waiting.querySelectorAll(':scope > .brain-col-items > [data-key]').length, 1);
  const current = waiting.querySelector<HTMLElement>(':scope > .brain-label-row > button.brain-switch')!;
  assert.equal(current.getAttribute('aria-label'), 'Show Waiting as its own column');
  assert.equal(current.getAttribute('title'), 'Show Waiting as its own column');
  assert.equal(current.getAttribute('data-key'), 'waiting-switch');
  const shapes = [...current.querySelector('svg.brain-switch-icon')!.children];
  assert.deepEqual(shapes.map((el) => el.localName), ['rect', 'path']);
  assert.equal(shapes[1].getAttribute('d'), 'M6 2v12M10 2v12');   // the columns icon
});

test('Waiting: a row keeps its column when the view changes, so nothing moves between views', () => {
  for (const view of ['column', 'group'] as const) {
    const card = keyed(render(vm, view), waitingCardKey());
    assert.equal(card.closest('section')?.dataset.column, 'waiting', view);
  }
});

test('Waiting, group view: the card\'s "Waiting on" words are their own span, and the who stays', () => {
  const strong = keyed(render(vm, 'group'), waitingCardKey()).querySelector('.brain-meta > .brain-strong')!;
  assert.equal(strong.textContent, 'Waiting on Bram');
  assert.equal(strong.querySelector(':scope > .brain-waiting-words')?.textContent, 'Waiting on ');
});

test('Waiting, group view: empty, the label keeps its count at 0 and says Nothing waiting', () => {
  const none = { ...vm, columns: { ...vm.columns, waiting: [] } };
  const waiting = columns(render(none, 'group'))[2];
  assert.equal(waiting.querySelector(':scope > .brain-label-row > h4.brain-group-name')?.textContent, 'Waiting on · 0');
  assert.equal(waiting.querySelector(':scope > .brain-col-items > li.brain-empty')?.textContent, 'Nothing waiting');
  assert.equal(waiting.hasAttribute('data-arrange'), true);   // still a drop zone when empty
});

test('Waiting: each switch asks for the other view, from either view', () => {
  const { actions, calls } = recorder();
  fire(render(vm, undefined, actions).querySelector('section[data-column="waiting"] > .brain-label-row > .brain-switch')!, 'click');
  assert.deepEqual(calls, [['waitingView', 'group']]);

  calls.length = 0;
  fire(render(vm, 'group', actions).querySelector('section[data-column="waiting"] > .brain-label-row > .brain-switch')!, 'click');
  assert.deepEqual(calls, [['waitingView', 'column']]);
});

test('Waiting: the switch is keyed, so a redraw in either view gives it back its focus', () => {
  for (const view of ['column', 'group'] as const) {
    const root = render(vm, view);
    const focused: unknown[] = [];
    root.querySelector<HTMLElement>('.brain-switch')!.focus = (options) => void focused.push(options);
    refocus(root, 'waiting-switch');
    assert.deepEqual(focused, [{ preventScroll: true }], view);
  }
});
