import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder, sampleNote } from '../../test/ui.ts';   // first: it installs the DOM
import { pastParts } from './past.ts';
import { renderWeek } from './week.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample, readSample, readSampleWithoutPoints } from '../../test/sample.ts';
import type { PastWeekVM, WeekVM } from '../model/types.ts';
import type { Actions } from './actions.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42
const sample = loadSample();
// Week 41 (5–11 October) has a frozen record in its plan note; week 40 (28 Sep – 4 Oct) has no plan.
const w41Plan = readSampleWithoutPoints().find((n) => n.path === '08 Weeks/2026/2026-W41.md');
const record = past(buildWeek(sample, TODAY, { start: '2026-10-05', plan: w41Plan }));
const fromNotes = past(buildWeek(sample, TODAY, { start: '2026-09-28' }));

function past(vm: WeekVM): PastWeekVM {
  if (vm.kind !== 'past') throw new Error(`expected a past week, got ${vm.kind}`);
  return vm;
}

function rendered(vm: WeekVM, actions: Actions = recorder().actions): HTMLElement {
  const root = document.createElement('div');
  renderWeek(root, vm, actions);
  return root;
}

function columns(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.brain-page > .brain-board.brain-board-week > section.brain-col')];
}

/** The row whose title reads `title`. */
function row(root: HTMLElement, title: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('li.brain-task')]
    .find((li) => li.querySelector('.brain-task-text')?.textContent === title);
  assert.ok(found, 'no row ' + title);
  return found;
}

const texts = (els: Iterable<Element>) => [...els].map((el) => el.textContent);
const meta = (li: HTMLElement) => texts(li.querySelectorAll('.brain-meta > *'));

test('Week 41: the head, the strip, the record line, three columns, then the Backlog', () => {
  const root = rendered(record);
  const page = root.querySelector(':scope > .brain-view > .brain-page');
  assert.ok(page);
  const parts = ['brain-head', 'brain-strip', 'brain-week-line', 'brain-board-week', 'brain-fold'];
  assert.deepEqual([...page.children].map((c) => parts.find((p) => c.classList.contains(p))), parts);
  assert.equal(page.querySelector(':scope > .brain-head .brain-title')?.textContent, '5–11 October');
  assert.deepEqual(texts(page.querySelectorAll(':scope > .brain-week-line > p.brain-meta > span')), ['Record', 'frozen Mon 12 Oct']);
  // Done out of done, in progress and not done: 5 of 5 + 2 + 3. The Backlog isn't counted.
  assert.equal(page.querySelector('.brain-figure .brain-ring')?.getAttribute('aria-label'), '5 of 10 done that week');
  assert.equal(page.querySelector('.brain-figure > span')?.textContent, '5/10');   // the tasks figure: done out of all, then the icon
  const cols = columns(root);
  assert.deepEqual(cols.map((c) => c.querySelector(':scope > .brain-label-row > .brain-label')?.textContent), ['Not done', 'In progress', 'Done']);
  assert.deepEqual(cols.map((c) => c.querySelector(':scope > .brain-label-row > .brain-count')?.textContent), ['3', '2', '5']);
  assert.deepEqual(cols.map((c) => c.querySelectorAll(':scope > ul.brain-col-items > li.brain-task').length), [3, 2, 5]);
  assert.deepEqual(cols.map((c) => c.hasAttribute('data-column')), [false, false, false]);
});

test('Week 41: nothing on the board is a control; each mark shows its state', () => {
  const root = rendered(record);
  const board = root.querySelector('.brain-board');
  assert.ok(board);
  assert.equal(board.querySelectorAll('button, [tabindex], .brain-draggable, [data-key], [data-plannable]').length, 0);
  const leads = [...board.querySelectorAll('li.brain-task > .brain-lead')];
  assert.equal(leads.length, 10);
  assert.ok(leads.every((l) => l.tagName === 'SPAN' && l.className === 'brain-lead brain-check'
    && l.getAttribute('aria-hidden') === 'true' && l.querySelector(':scope > svg.brain-mark') !== null));
  const [notDone, inProgress, done] = columns(root);
  const states = (col: HTMLElement) => [...col.querySelectorAll<HTMLElement>('li.brain-task')].map((li) => li.dataset.state);
  assert.deepEqual(states(notDone), ['todo', 'todo', 'dropped']);
  assert.deepEqual(states(inProgress), ['doing', 'doing']);
  assert.deepEqual(states(done), ['done', 'done', 'done', 'done', 'done']);
  assert.equal(row(root, 'Try a page builder').dataset.state, 'dropped');
  assert.deepEqual(meta(row(root, 'Try a page builder')), ['Website for Sam', 'dropped Sun']);
  assert.deepEqual(meta(row(root, 'Clean the gutters')), ['Home', 'moved → Thu 15 Oct']);
  // A deadline in the record is a due part: red, with the word "Due".
  assert.equal(row(root, 'Book a physio session').querySelector('.brain-meta > span[data-when="due"]')?.textContent, 'Due Sat');
});

test('Week 41: a title opens its note; the row itself never ticks, takes a state or opens', () => {
  const { actions, calls } = recorder();
  const root = rendered(record, actions);
  const physio = row(root, 'Book a physio session');
  fire(physio, 'click');
  fire(physio, 'keydown', { key: ' ' });
  fire(physio, 'keydown', { key: 'Enter' });
  fire(physio, 'contextmenu', { clientX: 10, clientY: 10 });
  assert.deepEqual(calls, []);
  assert.equal(document.querySelectorAll('.brain-popover').length, 0);
  physio.querySelector<HTMLElement>(':scope > .brain-task-body > a.brain-task-text')?.click();
  assert.deepEqual(calls, [['open', sampleNote('Health').path, undefined]]);
});

test('Week 41: the Backlog folds under its count, and stays open across a re-render', () => {
  const root = rendered(record);
  const fold = root.querySelector<HTMLElement>('.brain-page > section.brain-tile.brain-fold[data-fold="backlog"]');
  assert.ok(fold);
  const toggle = fold.querySelector<HTMLElement>(':scope > button.brain-fold-toggle');
  const list = fold.querySelector<HTMLElement>(':scope > ul.brain-tasks');
  assert.ok(toggle && list);
  assert.equal(toggle.querySelector('.brain-label')?.textContent, 'Backlog');
  assert.equal(toggle.querySelector('.brain-count')?.textContent, '4');
  assert.equal(toggle.getAttribute('aria-controls'), list.id);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(list.hidden, true);

  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(list.hidden, false);
  assert.deepEqual(texts(list.querySelectorAll(':scope > li .brain-task-text')),
    ['Podcast tip from Sam', 'Write the About page text', 'Measure the kitchen walls', 'Order new running shoes']);

  renderWeek(root, record, recorder().actions);
  assert.equal(root.querySelector('[data-fold="backlog"] > .brain-fold-toggle')?.getAttribute('aria-expanded'), 'true');
});

test('Week 41: the inbox item in the Backlog has a dot and, its note gone, a plain-text title', () => {
  const tip = row(rendered(record), 'Podcast tip from Sam');
  assert.equal(tip.hasAttribute('data-state'), false);
  assert.equal(tip.querySelectorAll(':scope > span.brain-lead[aria-hidden="true"] > span.brain-dot').length, 1);
  assert.equal(tip.querySelector('.brain-task-text')?.tagName, 'SPAN');
  assert.equal(tip.querySelectorAll('a').length, 0);
  assert.deepEqual(meta(tip), ['Inbox']);
});

test('Week 40, from your notes: the line says so, the figure counts what got done, two columns', () => {
  const root = rendered(fromNotes);
  const page = root.querySelector(':scope > .brain-view > .brain-page');
  assert.ok(page);
  assert.equal(page.querySelector(':scope > .brain-head .brain-title')?.textContent, '28 Sep – 4 Oct');
  assert.deepEqual(texts(page.querySelectorAll(':scope > .brain-week-line > p.brain-meta > span')), ['From your notes']);
  assert.equal(page.querySelectorAll('.brain-figure .brain-ring').length, 0);
  assert.equal(page.querySelector('.brain-figure > span')?.textContent, '5 done');
  const cols = columns(root);
  assert.deepEqual(cols.map((c) => c.querySelector(':scope > .brain-label-row > .brain-label')?.textContent), ['Not done', 'Done']);
  assert.deepEqual(cols.map((c) => c.querySelector(':scope > .brain-label-row > .brain-count')?.textContent), ['0', '5']);
  assert.equal(cols[0].querySelector(':scope > ul.brain-col-items > li.brain-empty')?.textContent, 'Nothing left open');
  assert.deepEqual(texts(cols[1].querySelectorAll('.brain-task-text')), [
    'Move the direct debits', 'Send the meter reading', 'Close the old account', 'Cancel the old bank cards', 'Fix the bike light',
  ]);
  assert.deepEqual(meta(row(root, 'Fix the bike light')), ['Home', 'Done Sat']);
  assert.equal(page.querySelectorAll('.brain-fold').length, 0);
});

test('a past week with nothing to count has no figure; a record with an empty Backlog has no fold', () => {
  assert.equal(rendered({ ...fromNotes, done: 0 }).querySelectorAll('.brain-figure').length, 0);
  assert.equal(rendered({ ...record, done: 0, total: 0 }).querySelectorAll('.brain-figure').length, 0);
  assert.equal(rendered({ ...record, backlog: [] }).querySelectorAll('.brain-fold').length, 0);
});

test('pastParts: the line and the board; a record adds its Backlog fold, open when asked', () => {
  const { actions } = recorder();
  assert.deepEqual(pastParts(fromNotes, actions, false).map((el) => el.className), ['brain-week-line', 'brain-board brain-board-week']);
  const parts = pastParts(record, actions, true);
  assert.deepEqual(parts.map((el) => el.className), ['brain-week-line', 'brain-board brain-board-week', 'brain-tile brain-fold']);
  assert.equal(parts[2].querySelector('.brain-fold-toggle')?.getAttribute('aria-expanded'), 'true');
});
