import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder, rowFor, same } from '../../test/ui.ts';   // first: it installs the DOM
import { h } from './dom.ts';
import { listTitle, refreshLists, renderListBody, showAllButton } from './listModal.ts';
import type { ListHost } from './listModal.ts';
import { closeCard } from './popover.ts';
import { buildBacklog } from '../model/backlog.ts';
import { buildProjects } from '../model/projects.ts';
import { loadSample } from '../../test/sample.ts';
import type { Actions, ListEntry, ListSpec } from './actions.ts';
import type { ProjectCardVM } from '../model/types.ts';

const TODAY = '2026-10-13';
const sample = loadSample();
const someday: ProjectCardVM[] = buildProjects(sample, TODAY).columns.find((c) => c.status === 'someday')?.cards ?? [];
const groups = buildBacklog(sample, TODAY).noDate;

function cardEntries(cards: ProjectCardVM[]): ListEntry[] {
  return cards.map((card): ListEntry => ({ kind: 'card', card }));
}

/** Someday's cards, as Show all draws them: a list without drag unless the test says so. */
function spec(over: Partial<ListSpec> = {}): ListSpec {
  return {
    key: 'someday',
    title: 'Someday',
    noun: 'someday projects',
    count: someday.length,
    entries: cardEntries(someday),
    drag: false,
    zones: document.createElement('div'),
    ...over,
  };
}

/** A list body rendered into a fresh content element. The host's calls go to `calls`, after the actions' own. */
function body(list: ListSpec, actions: Actions, calls: unknown[][] = []) {
  const content = document.createElement('div');
  const host: ListHost = {
    close: () => calls.push(['close']),
    carry: (on) => calls.push(['carry', on]),
  };
  const redraw = renderListBody(content, list, actions, host);
  const search = content.querySelector<HTMLInputElement>('input.brain-search');
  const grid = content.querySelector<HTMLElement>('.brain-modal-grid');
  assert.ok(search);
  assert.ok(grid);
  return { content, search, grid, redraw };
}

test('the list body: a search field named for its list, one card per entry, and a hidden empty item', () => {
  const { content, search, grid } = body(spec(), recorder().actions);
  assert.equal(content.classList.contains('brain-view'), true);
  assert.equal(content.classList.contains('brain-modal-body'), true);
  assert.equal(search.getAttribute('type'), 'search');
  assert.equal(search.getAttribute('placeholder'), 'Search');
  assert.equal(search.getAttribute('autocomplete'), 'off');
  assert.equal(search.getAttribute('aria-label'), 'Search someday projects');
  assert.equal(grid.querySelectorAll(':scope > li.brain-card').length, someday.length);
  assert.equal(grid.querySelector(':scope > li.brain-empty')?.hasAttribute('hidden'), true);
});

test('without drag the cards lose brain-draggable; with drag they keep it', () => {
  const plain = body(spec(), recorder().actions).grid;
  assert.equal(plain.querySelectorAll('li.brain-card.brain-draggable').length, 0);
  const dragging = body(spec({ drag: true }), recorder().actions).grid;
  assert.equal(dragging.querySelectorAll(':scope > li.brain-card.brain-draggable').length, someday.length);
});

test('a group is a tile with its name over its rows; a row is a tile of its own', () => {
  const home = groups.find((g) => g.name === 'Home');
  assert.ok(home);
  const list = spec({
    key: 'noDate', title: 'No date', noun: 'undated tasks', count: home.rows.length + 1,
    entries: [{ kind: 'group', group: home }, { kind: 'row', row: rowFor('Pay the car insurance') }],
  });
  const { grid } = body(list, recorder().actions);
  const [group, row] = grid.querySelectorAll<HTMLElement>(':scope > li.brain-tile');
  assert.equal(group.querySelector(':scope > .brain-group > a.brain-group-name')?.textContent, 'Home');
  assert.equal(group.querySelectorAll(':scope > .brain-group > ul.brain-tasks > li.brain-task').length, home.rows.length);
  assert.equal(row.querySelectorAll(':scope > ul.brain-tasks > li.brain-task').length, 1);
  assert.equal(row.querySelector('.brain-task-text')?.textContent, 'Pay the car insurance');
});

test('a search keeps the cards whose text matches, and says so when none does', () => {
  const { search, grid } = body(spec(), recorder().actions);
  const shown = () => [...grid.querySelectorAll<HTMLElement>(':scope > li.brain-card')]
    .filter((c) => !c.hidden).map((c) => c.querySelector('.brain-card-title')?.textContent);
  search.value = 'garden';
  fire(search, 'input');
  assert.deepEqual(shown(), ['Build a vegetable garden']);
  search.value = '  ZZZ ';
  fire(search, 'input');
  assert.deepEqual(shown(), []);
  const empty = grid.querySelector<HTMLElement>(':scope > li.brain-empty');
  assert.equal(empty?.textContent, 'No match for “ZZZ”');
  assert.equal(empty?.hidden, false);
});

test('a search for a group name shows all its rows; any other search shows only the rows that match', () => {
  const home = groups.find((g) => g.name === 'Home');
  assert.ok(home);
  const list = spec({ key: 'noDate', title: 'No date', noun: 'undated tasks', count: home.rows.length, entries: [{ kind: 'group', group: home }] });
  const { search, grid } = body(list, recorder().actions);
  const rows = () => [...grid.querySelectorAll<HTMLElement>('.brain-group li.brain-task')]
    .filter((r) => !r.hidden).map((r) => r.querySelector('.brain-task-text')?.textContent);
  const tile = () => grid.querySelector<HTMLElement>(':scope > li.brain-tile');
  search.value = 'home';
  fire(search, 'input');
  assert.equal(rows().length, home.rows.length);
  search.value = 'garden';
  fire(search, 'input');
  assert.deepEqual(rows(), ['Oil the garden bench']);
  assert.equal(tile()?.hidden, false);
  search.value = 'zzz';
  fire(search, 'input');
  assert.equal(tile()?.hidden, true);
});

test('Show all hands the modal the button that opened it, so closing the modal gives the focus back to it', () => {
  let opened: ListSpec | undefined;
  const handle = { update: () => {}, close: () => {}, isOpen: () => true };
  const actions = { ...recorder().actions, showAll: (s: ListSpec) => { opened = s; return handle; } };
  const button = showAllButton(document.createElement('div'), spec(), actions);
  button.click();
  same(opened?.opener, button);
});

test('the search field takes the focus on open only when asked: on a phone a focused field brings up the keyboard over the list', () => {
  const focused: string[] = [];
  const proto = Object.getPrototypeOf(document.createElement('input'));
  const had = Object.getOwnPropertyDescriptor(proto, 'focus');
  proto.focus = function focus(this: Element) { focused.push(this.className); };
  try {
    const host: ListHost = { close: () => {}, carry: () => {} };
    renderListBody(document.createElement('div'), spec(), recorder().actions, host);
    assert.deepEqual(focused, []);
    renderListBody(document.createElement('div'), spec(), recorder().actions, host, { autofocus: true });
    assert.deepEqual(focused, ['brain-search']);
  } finally {
    if (had) Object.defineProperty(proto, 'focus', had);
    else delete proto.focus;
  }
});

test('listTitle is the list name and its count', () => {
  assert.equal(listTitle(spec({ count: 12 })), 'Someday · 12');
  assert.equal(listTitle(spec({ title: 'Done', count: 5 })), 'Done · 5');
});

test('a card\'s title closes the modal first, then opens its note', () => {
  const { actions, calls } = recorder();
  const { grid } = body(spec(), actions, calls);
  const title = [...grid.querySelectorAll<HTMLElement>('.brain-card-title a')].find((a) => a.textContent === 'Repaint the bedroom');
  assert.ok(title);
  title.click();
  assert.deepEqual(calls, [['close'], ['open', '03 Projects/Repaint the bedroom/Repaint the bedroom.md', undefined]]);
});

test('a new spec redraws the grid and keeps the query', () => {
  const { search, grid, redraw } = body(spec(), recorder().actions);
  search.value = 'garden';
  fire(search, 'input');
  redraw(spec({ count: 11, entries: cardEntries(someday.filter((c) => c.title !== 'Build a vegetable garden')) }));
  assert.equal(grid.querySelectorAll(':scope > li.brain-card').length, 11);
  assert.equal(grid.querySelector(':scope > li.brain-empty')?.textContent, 'No match for “garden”');
});

test('Show all opens the list through actions.showAll; a re-render updates it, and closes it when its list is gone', () => {
  const { actions, calls } = recorder();
  const root = document.createElement('div');
  const button = showAllButton(root, spec(), actions);
  assert.equal(button.textContent, 'Show all 12');
  assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(button.getAttribute('data-key'), 'show-all:someday', 'keyed, so a redraw keeps the focus on it');
  button.click();
  refreshLists(root, [spec({ count: 11, entries: cardEntries(someday.slice(1)) })]);
  refreshLists(root, [spec({ key: 'done' })]);
  refreshLists(root, [spec()]);
  assert.deepEqual(calls, [['showAll', 'someday', 12], ['update', 'someday', 11], ['close', 'someday']]);
});

/** Pointer events for linkedom: the pointer is over whatever `under` says; pointer capture does nothing. */
const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y });

/** The pointer is over `el` for the rest of the test; the document has its own elementFromPoint again after. */
function pointerOver(t: TestContext, el: Element): void {
  const had = Object.hasOwn(document, 'elementFromPoint');
  const before = (document as unknown as Record<string, unknown>).elementFromPoint;
  Object.assign(document, { elementFromPoint: () => el });
  t.after(() => {
    if (had) Object.assign(document, { elementFromPoint: before });
    else delete (document as unknown as Record<string, unknown>).elementFromPoint;
  });
}

/** A list with drag, whose zones hold an empty arrangeable Active column, and the modal's grid. */
function dragList(t: TestContext, calls: unknown[][], drops: [string | undefined, unknown][]) {
  const zones = document.createElement('div');
  const column = h('section', 'brain-col', { 'data-column': 'active', 'data-arrange': '' }, [h('ul', 'brain-col-items')]);
  zones.append(column);
  const { grid } = body(spec({ drag: true, zones, onDrop: (item, target) => drops.push([item.dataset.key, target]) }), recorder().actions, calls);
  grid.setPointerCapture = () => {};
  pointerOver(t, column.querySelector('.brain-col-items') ?? column);
  const card = grid.querySelector<HTMLElement>(':scope > li.brain-card');
  assert.ok(card);
  return { zones, grid, card };
}

test('with drag, a press and a move carry a card onto a column; the drop reports its place and closes the modal', (t) => {
  const calls: unknown[][] = [];
  const drops: [string | undefined, unknown][] = [];
  const { zones, grid, card } = dragList(t, calls, drops);
  fire(card, 'pointerdown', mouse(10, 10));
  fire(grid, 'pointermove', mouse(10, 40));
  assert.equal(card.classList.contains('brain-is-lifted'), true);
  assert.equal(zones.contains(card), true);
  fire(grid, 'pointerup', mouse(10, 40));
  assert.deepEqual(drops, [[card.dataset.key, { kind: 'column', column: 'active', index: 0 }]]);
  assert.deepEqual(calls, [['carry', true], ['close']]);
  assert.equal(zones.contains(card), false);   // the drop took the carried card out of the view
});

test('a drop that changes nothing (a Done card back on Done) still takes the carried card out of the view', (t) => {
  const calls: unknown[][] = [];
  const drops: [string | undefined, unknown][] = [];
  const zones = document.createElement('div');
  const done = h('section', 'brain-col', { 'data-column': 'done' }, [h('ul', 'brain-col-items')]);
  zones.append(done);
  // A drop on Done is ignored: onDrop runs, and nothing is saved or re-rendered.
  const { grid } = body(spec({ drag: true, zones, onDrop: (item, target) => drops.push([item.dataset.key, target]) }), recorder().actions, calls);
  grid.setPointerCapture = () => {};
  pointerOver(t, done.querySelector('.brain-col-items') ?? done);
  const card = grid.querySelector<HTMLElement>(':scope > li.brain-card');
  assert.ok(card);
  fire(card, 'pointerdown', mouse(10, 10));
  fire(grid, 'pointermove', mouse(10, 40));
  fire(grid, 'pointerup', mouse(10, 40));
  assert.deepEqual(drops, [[card.dataset.key, { kind: 'column', column: 'done', index: null }]]);
  assert.deepEqual(calls, [['carry', true], ['close']]);
  assert.equal(zones.contains(card), false);
  assert.equal(grid.contains(card), false);
});

test('a cancelled carry puts the card back in the modal and shows the modal again', (t) => {
  const calls: unknown[][] = [];
  const drops: [string | undefined, unknown][] = [];
  const { grid, card } = dragList(t, calls, drops);
  fire(card, 'pointerdown', mouse(10, 10));
  fire(grid, 'pointermove', mouse(10, 40));
  fire(grid, 'pointercancel', mouse(10, 40));
  assert.equal(grid.contains(card), true);
  assert.equal(card.classList.contains('brain-is-lifted'), false);
  assert.deepEqual(calls, [['carry', true], ['carry', false]]);
  assert.deepEqual(drops, []);
});

test('without drag, a press and a move lift nothing', () => {
  const calls: unknown[][] = [];
  const { grid } = body(spec(), recorder().actions, calls);
  const card = grid.querySelector<HTMLElement>(':scope > li.brain-card');
  assert.ok(card);
  fire(card, 'pointerdown', mouse(10, 10));
  fire(grid, 'pointermove', mouse(10, 40));
  assert.equal(card.classList.contains('brain-is-lifted'), false);
  assert.deepEqual(calls, []);
});

test('a carry hands the host its cancel: calling it, as Escape does, puts the card back and shows the modal', (t) => {
  const calls: unknown[][] = [];
  const held: { cancel?: () => void } = {};   // an object, so TypeScript keeps the callback's type
  const zones = document.createElement('div');
  const column = h('section', 'brain-col', { 'data-column': 'active', 'data-arrange': '' }, [h('ul', 'brain-col-items')]);
  zones.append(column);
  const host: ListHost = {
    close: () => calls.push(['close']),
    carry: (on, cancelCarry) => {
      calls.push(['carry', on]);
      held.cancel = on ? cancelCarry : undefined;
    },
  };
  const content = document.createElement('div');
  renderListBody(content, spec({ drag: true, zones }), recorder().actions, host);
  const grid = content.querySelector<HTMLElement>('.brain-modal-grid');
  const card = grid?.querySelector<HTMLElement>(':scope > li.brain-card');
  assert.ok(grid && card);
  grid.setPointerCapture = () => {};
  pointerOver(t, column.querySelector('.brain-col-items') ?? column);
  fire(card, 'pointerdown', mouse(10, 10));
  fire(grid, 'pointermove', mouse(10, 40));
  assert.equal(card.classList.contains('brain-is-lifted'), true);
  held.cancel?.();
  assert.equal(grid.contains(card), true);
  assert.equal(card.classList.contains('brain-is-lifted'), false);
  assert.deepEqual(calls, [['carry', true], ['carry', false]]);
});

test('a redraw during a carry does not stop the cancel: nothing throws, the host hears the carry end, and the card is not doubled', (t) => {
  const calls: unknown[][] = [];
  const held: { cancel?: () => void } = {};
  const zones = document.createElement('div');
  const column = h('section', 'brain-col', { 'data-column': 'active', 'data-arrange': '' }, [h('ul', 'brain-col-items')]);
  zones.append(column);
  const host: ListHost = {
    close: () => calls.push(['close']),
    carry: (on, cancelCarry) => {
      calls.push(['carry', on]);
      held.cancel = on ? cancelCarry : undefined;
    },
  };
  const content = document.createElement('div');
  const redraw = renderListBody(content, spec({ drag: true, zones }), recorder().actions, host);
  const grid = content.querySelector<HTMLElement>('.brain-modal-grid');
  const card = grid?.querySelector<HTMLElement>(':scope > li.brain-card');
  assert.ok(grid && card);
  grid.setPointerCapture = () => {};
  pointerOver(t, column.querySelector('.brain-col-items') ?? column);
  fire(card, 'pointerdown', mouse(10, 10));
  fire(grid, 'pointermove', mouse(10, 40));
  redraw(spec({ drag: true, zones }));   // a re-render while the card is out: every tile in the grid is new
  assert.equal(grid.contains(card), false);
  held.cancel?.();   // Escape
  assert.deepEqual(calls, [['carry', true], ['carry', false]]);
  assert.equal(held.cancel, undefined);
  assert.equal(grid.querySelectorAll(':scope > li.brain-card').length, someday.length);
  assert.equal(zones.contains(card), false);
});

test('the list modal body carries the view\'s data-today and data-week, so a card opened in it knows its week', () => {
  const zones = document.createElement('div');
  zones.dataset.today = '2026-10-13';
  zones.dataset.week = '2026-10-19';
  const content = document.createElement('div');
  renderListBody(content, { key: 'someday', title: 'Someday', noun: 'someday projects', count: 0, entries: [], drag: false, zones }, recorder().actions, { close() {}, carry() {} });
  assert.equal(content.dataset.today, '2026-10-13');
  assert.equal(content.dataset.week, '2026-10-19');
});

test('in the list modal the menu key opens a card, and a card changed there leaves the grid when the list is drawn again', async () => {
  const { actions, calls } = recorder();
  const { grid, redraw } = body(spec(), actions);
  const first = grid.querySelector<HTMLElement>('li.brain-card')!;
  fire(first, 'keydown', { key: 'ContextMenu' });
  assert.equal(document.querySelector('.brain-popover')?.getAttribute('data-kind'), 'project');
  fire(document.querySelector('.brain-popover [data-set="active"]')!, 'click');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [['setNoteStatus', someday[0].path, 'active']]);
  // The view draws the lists again after the write: this card is no longer someday, so it leaves the grid.
  redraw(spec({ entries: cardEntries(someday.slice(1)), count: someday.length - 1 }));
  assert.equal(grid.querySelectorAll(':scope > li.brain-card').length, someday.length - 1);
  assert.equal([...grid.querySelectorAll('li.brain-card')].some((c) => c.getAttribute('data-key') === someday[0].key), false);
  closeCard();
});
