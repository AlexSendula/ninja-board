import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { renderBacklog } from './backlog.ts';
import { buildBacklog } from '../model/backlog.ts';
import { loadSample } from '../../test/sample.ts';
import type { BacklogVM } from '../model/types.ts';
import type { Actions, ListSpec } from './actions.ts';

const TODAY = '2026-10-13';   // Tuesday; Thursday is the 15th
const vm = buildBacklog(loadSample(), TODAY);

function rendered(model: BacklogVM, actions: Actions = recorder().actions): HTMLElement {
  const root = document.createElement('div');
  renderBacklog(root, model, actions);
  return root;
}

function parts(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(':scope > .brain-view > .brain-page > section.brain-part')];
}

test('Backlog: two parts, each with its own head', () => {
  const [backlog, waiting] = parts(rendered(vm));
  assert.ok(backlog && waiting);
  assert.equal(backlog.querySelector(':scope > header.brain-head .brain-label')?.textContent, 'Backlog');
  assert.equal(backlog.querySelector(':scope > header.brain-head .brain-title')?.textContent, '2 to sort');
  assert.equal(backlog.querySelectorAll(':scope > header.brain-head .brain-figure').length, 0);
  assert.equal(waiting.querySelector(':scope > header.brain-head .brain-label')?.textContent, 'Waiting');
  assert.equal(waiting.querySelector(':scope > header.brain-head .brain-title')?.textContent, '2 open');
  assert.equal(waiting.querySelector(':scope > header.brain-head .brain-figure')?.textContent, 'next chase Thu');
});

test('Backlog: Inbox, No date and Someday tiles', () => {
  const [backlog] = parts(rendered(vm));
  const tiles = [...backlog.querySelectorAll(':scope > .brain-grid > section.brain-tile')];
  assert.equal(tiles.length, 3);
  const [inbox, noDate, someday] = tiles;
  // Order shipped and Idea for birthday party.
  assert.equal(inbox.querySelectorAll('.brain-tasks > .brain-task .brain-dot').length, 2);
  assert.deepEqual([...inbox.querySelectorAll('.brain-task > .brain-aside')].map((a) => a.textContent), ['Today', 'Yesterday']);
  // Write the About page text, Measure the kitchen walls, Order new running shoes, and Home's four undated to-dos.
  assert.equal(noDate.querySelector('.brain-label-row > .brain-count')?.textContent, '8');
  // Organise a reunion weekend, the newest someday project: two lines, none done.
  const row = someday.querySelector<HTMLElement>('.brain-tasks > li.brain-task');
  assert.ok(row);
  assert.deepEqual([row.dataset.state, row.dataset.menu, row.getAttribute('tabindex')], ['someday', 'project', '0']);
  assert.equal(row.querySelector('.brain-lead .brain-ring')?.getAttribute('aria-label'), '0 of 2 done');
  assert.equal(row.querySelector('.brain-aside')?.textContent, '0/2');
});

test('Backlog: every inbox row, someday row and waiting tile carries its data-key', () => {
  const root = rendered(vm);
  const keys = [...root.querySelectorAll<HTMLElement>('[data-key]')].map((el) => el.dataset.key);
  // The tile draws the five newest someday projects; the rest wait behind Show all.
  for (const key of [...vm.inbox.map((i) => i.key), ...vm.someday.slice(0, vm.somedayLimit).map((c) => c.key), ...vm.waiting.map((w) => w.key)]) {
    assert.ok(keys.includes(key), 'no element with data-key ' + key);
  }
});

test('Backlog: an inbox item without a received time has no age element', () => {
  const [backlog] = parts(rendered({ ...vm, inbox: [{ ...vm.inbox[0], age: '' }, vm.inbox[1]] }));
  const inbox = backlog.querySelector(':scope > .brain-grid > section.brain-tile');
  assert.ok(inbox);
  const [first, second] = [...inbox.querySelectorAll('.brain-tasks > .brain-task')];
  assert.equal(first.querySelectorAll('.brain-aside').length, 0);
  assert.equal(first.textContent, vm.inbox[0].title);
  assert.equal(second.querySelector('.brain-aside')?.textContent, 'Yesterday');
});

test('Backlog: two waiting tiles; the first, Bram, is chased on Thursday the 15th', () => {
  const [, waiting] = parts(rendered(vm));
  const tiles = [...waiting.querySelectorAll(':scope > ul.brain-grid > li.brain-tile')];
  assert.equal(tiles.length, 2);
  const first = tiles[0];
  assert.equal(first.querySelector('.brain-card-head .brain-card-title')?.textContent, 'Bram');
  const cal = first.querySelector('.brain-card-head > .brain-cal');
  assert.ok(cal);
  assert.equal(cal.querySelector('.brain-label')?.textContent, 'THU');
  assert.equal(cal.querySelector('.brain-cal-num')?.textContent, '15');
  assert.equal(cal.getAttribute('aria-label'), 'Chase Thursday 15 October');
  assert.equal(cal.classList.contains('brain-is-late'), false);
  assert.equal(first.querySelectorAll('.brain-tasks > .brain-task').length, 1);
});

test('Backlog: a waiting tile names its context in plain text, not links', () => {
  const [, waiting] = parts(rendered(vm));
  const meta = waiting.querySelector('li.brain-tile .brain-card-head .brain-meta');
  assert.ok(meta);
  assert.deepEqual([...meta.children].map((c) => c.tagName), ['SPAN', 'SPAN']);
  assert.deepEqual([...meta.children].map((c) => c.textContent), ['Choose a contractor', 'Renovate the kitchen']);
  assert.equal(meta.querySelectorAll('a').length, 0);
});

test('Backlog: a passed chase turns the calendar page late', () => {
  // Monday 12 October, the day before today.
  const late = { ...vm.waiting[0], chase: '2026-10-12', calWeekday: 'MON', calDay: 12, late: true };
  const [, waiting] = parts(rendered({ ...vm, waiting: [late] }));
  const cal = waiting.querySelector('.brain-cal');
  assert.equal(cal?.className, 'brain-cal brain-is-late');
  assert.equal(cal?.getAttribute('aria-label'), 'Chase date passed, Monday 12 October');
});

test('Backlog: a waiting tile without a chase date has no calendar page', () => {
  const none = { ...vm.waiting[0], chase: '', calWeekday: '', calDay: 0, late: false };
  const [, waiting] = parts(rendered({ ...vm, waiting: [none] }));
  assert.equal(waiting.querySelector('li.brain-tile .brain-card-title')?.textContent, 'Bram');
  assert.equal(waiting.querySelectorAll('.brain-cal').length, 0);
});

test('Backlog: links and Enter open the note', () => {
  const { actions, calls } = recorder();
  const [backlog] = parts(rendered(vm, actions));
  const someday = backlog.querySelector<HTMLElement>('li[data-menu="project"]');
  assert.ok(someday);
  someday.querySelector<HTMLElement>('.brain-task-text')?.click();
  fire(someday, 'keydown', { key: 'Enter' });
  // The first someday row is Organise a reunion weekend (see the tile test above).
  const path = '03 Projects/Organise a reunion weekend/Organise a reunion weekend.md';
  assert.deepEqual(calls, [['open', path, undefined], ['open', path, undefined]]);
});

test('Backlog: Someday draws its five newest, newest first', () => {
  const [backlog] = parts(rendered(vm));
  const [, , someday] = [...backlog.querySelectorAll<HTMLElement>(':scope > .brain-grid > section.brain-tile')];
  assert.ok(someday);
  const titles = [...someday.querySelectorAll<HTMLElement>(':scope > ul.brain-tasks > li.brain-task')]
    .map((li) => li.querySelector('.brain-task-text')?.textContent);
  assert.deepEqual(titles, [
    'Organise a reunion weekend', 'Run a half marathon', 'Plan summer vacation', 'Repaint the bedroom', 'Build a vegetable garden',
  ]);
});

test('Backlog: an empty vault shows both heads and calm lines', () => {
  const [backlog, waiting] = parts(rendered(buildBacklog({ notes: [] }, TODAY)));
  assert.equal(backlog.querySelector('.brain-title')?.textContent, '0 to sort');
  assert.deepEqual(
    [...backlog.querySelectorAll('.brain-tile > p.brain-empty')].map((p) => p.textContent),
    ['Nothing to sort.', 'Every task has a date.', 'No someday projects.'],
  );
  assert.equal(waiting.querySelector('.brain-title')?.textContent, '0 open');
  assert.equal(waiting.querySelectorAll('.brain-figure').length, 0);
  assert.equal(waiting.querySelector(':scope > p.brain-empty')?.textContent, 'Not waiting on anyone.');
});

// ---------- Show all on Someday (Task 11) ----------

test('Backlog: the Someday tile draws its 5 newest, and its label row reads Someday, 12 and Show all 12', () => {
  const [backlog] = parts(rendered(vm));
  const tile = backlog.querySelectorAll<HTMLElement>(':scope > .brain-grid > section.brain-tile')[2];
  const head = tile.querySelector<HTMLElement>(':scope > .brain-label-row');
  assert.ok(head);
  assert.deepEqual([...head.children].map((el) => el.textContent), ['Someday', '12', 'Show all 12']);
  assert.equal(tile.querySelectorAll(':scope > .brain-tasks > li.brain-task').length, 5);
});

test('Backlog: Show all on Someday opens the list with its 12 cards and no drag', () => {
  const specs: ListSpec[] = [];
  const actions: Actions = {
    ...recorder().actions,
    showAll(spec) {
      specs.push(spec);
      return { update() {}, close() {}, isOpen: () => true };
    },
  };
  const [backlog] = parts(rendered(vm, actions));
  backlog.querySelector<HTMLButtonElement>('.brain-label-row > button.brain-more')?.click();
  assert.deepEqual([specs[0].key, specs[0].title, specs[0].count, specs[0].entries.length, specs[0].drag], ['someday', 'Someday', 12, 12, false]);
});

test('Backlog: Space on a someday row completes the project', () => {
  const { actions, calls } = recorder();
  const [backlog] = parts(rendered(vm, actions));
  fire(backlog.querySelector<HTMLElement>('li[data-menu="project"]')!, 'keydown', { key: ' ' });
  assert.deepEqual(calls, [['setNoteStatus', '03 Projects/Organise a reunion weekend/Organise a reunion weekend.md', 'done']]);
});

test('Backlog: a Someday of exactly the limit has no Show all, and its label row reads its count', () => {
  const [backlog] = parts(rendered({ ...vm, someday: vm.someday.slice(0, vm.somedayLimit) }));
  const tile = backlog.querySelectorAll<HTMLElement>(':scope > .brain-grid > section.brain-tile')[2];
  assert.deepEqual([...tile.querySelector(':scope > .brain-label-row')!.children].map((el) => el.textContent), ['Someday', '5']);
});

test('Backlog: a someday row opens the project card with its status', () => {
  const { actions } = recorder();
  const [backlog] = parts(rendered(vm, actions));
  const someday = backlog.querySelector<HTMLElement>('li[data-menu="project"]')!;
  fire(someday, 'contextmenu', { clientX: 40, clientY: 48 });
  const card = document.querySelector('.brain-popover');
  assert.equal(card?.getAttribute('data-kind'), 'project');
  assert.equal(card?.querySelector('[data-set="someday"]')?.getAttribute('aria-checked'), 'true');
  card?.remove();
});
