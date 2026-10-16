import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { renderToday } from './today.ts';
import { buildToday } from '../model/today.ts';
import { loadSample } from '../../test/sample.ts';
import type { EventVM, RowVM, TodayVM } from '../model/types.ts';

const TODAY = '2026-10-13';   // Tuesday
const vm = buildToday(loadSample(), TODAY);
const { actions } = recorder();

function rendered(model: TodayVM): HTMLElement {
  const root = document.createElement('div');
  renderToday(root, model, actions);
  return root;
}

test('Today: the view wrapper, page and header, replaced on each render', () => {
  const root = rendered(vm);
  renderToday(root, vm, actions);
  assert.equal(root.querySelectorAll('.brain-view').length, 1);
  const page = root.querySelector(':scope > .brain-view > .brain-page');
  assert.ok(page);
  assert.equal(page.getAttribute('data-view'), 'today');
  assert.equal(page.querySelector(':scope > .brain-head .brain-title')?.textContent, '13 October');
  assert.ok(page.querySelector(':scope > .brain-head .brain-label')?.classList.contains('brain-label-accent'));
  // Now: header and compare prices (doing). Today: physio (overdue) and the hallway switch (due today).
  assert.equal(page.querySelector('.brain-figure > span')?.textContent, '4 left');
  assert.equal(page.querySelector('.brain-figure .brain-ring')?.getAttribute('aria-label'), '0 of 4 done today');
});

test('Today: Now and Today tiles hold 2 rows each, then the schedule; no Done today at 0', () => {
  const root = rendered(vm);
  const grid = root.querySelector('.brain-page > .brain-grid.brain-today');
  assert.ok(grid);
  const now = grid.querySelector(':scope > .brain-tile.brain-area-now');
  const today = grid.querySelector(':scope > .brain-tile.brain-area-today');
  assert.equal(now?.querySelectorAll('.brain-tasks > .brain-task').length, 2);
  assert.equal(now?.querySelector('.brain-label-row > .brain-count')?.textContent, '2');
  assert.equal(today?.querySelectorAll('.brain-tasks > .brain-task').length, 2);
  assert.equal(today?.querySelector('.brain-label-row > .brain-count')?.textContent, '2');
  assert.ok(grid.querySelector(':scope > .brain-area-sched'));   // the dance class
  assert.equal(root.querySelectorAll('.brain-fold').length, 0);
  assert.equal(root.querySelectorAll('.brain-empty').length, 0);
});

// styles.css pins Now, Today and Schedule to named grid areas, so an omitted tile leaves its slot blank.
test('Today: nothing in progress still renders the Now tile, with one calm line', () => {
  const grid = rendered({ ...vm, now: [] }).querySelector('.brain-page > .brain-grid.brain-today');
  assert.ok(grid);
  const now = grid.querySelector(':scope > .brain-tile.brain-area-now');
  assert.ok(now);
  assert.equal(now.querySelector('.brain-label-row > .brain-count')?.textContent, '0');
  assert.equal(now.querySelectorAll('.brain-tasks').length, 0);
  assert.equal(now.querySelector(':scope > p.brain-empty')?.textContent, 'Nothing in progress.');
  assert.equal(grid.querySelectorAll(':scope > .brain-tile.brain-area-today .brain-task').length, 2);
});

test('Today: nothing due still renders the Today tile, with one calm line', () => {
  const grid = rendered({ ...vm, today: [] }).querySelector('.brain-page > .brain-grid.brain-today');
  assert.ok(grid);
  const today = grid.querySelector(':scope > .brain-tile.brain-area-today');
  assert.ok(today);
  assert.equal(today.querySelector('.brain-label-row > .brain-count')?.textContent, '0');
  assert.equal(today.querySelectorAll('.brain-tasks').length, 0);
  assert.equal(today.querySelector(':scope > p.brain-empty')?.textContent, 'Nothing due today.');
  assert.equal(grid.querySelectorAll(':scope > .brain-tile.brain-area-now .brain-task').length, 2);
});

test('Today: a day without appointments still renders Schedule, saying so', () => {
  const grid = rendered({ ...vm, schedule: [] }).querySelector('.brain-page > .brain-grid.brain-today');
  assert.ok(grid);
  assert.deepEqual(
    [...grid.querySelectorAll(':scope > .brain-tile')].map((t) => t.className),
    ['brain-tile brain-area-now', 'brain-tile brain-area-today', 'brain-tile brain-area-sched'],
  );
  const sched = grid.querySelector(':scope > .brain-area-sched');
  assert.ok(sched);
  assert.equal(sched.querySelector('.brain-label-row > .brain-count')?.textContent, '0');
  assert.equal(sched.querySelector('.brain-agenda > li.brain-empty')?.textContent, 'No appointments');
  assert.equal(sched.querySelectorAll('.brain-timeline').length, 0);
});

test('Today: only a schedule left shows both empty tiles, and no page-level line', () => {
  const root = rendered({ ...vm, now: [], today: [], left: 0 });
  assert.equal(root.querySelectorAll('.brain-grid.brain-today > .brain-area-now, .brain-grid.brain-today > .brain-area-today').length, 2);
  assert.ok(root.querySelector('.brain-grid.brain-today > .brain-area-sched'));
  assert.equal(root.querySelectorAll('.brain-page > p.brain-empty').length, 0);
});

test('Today: Done today starts folded, toggles, and stays open across a re-render', () => {
  const ticked: RowVM = { ...vm.today[1], state: 'done' };
  const model: TodayVM = { ...vm, left: 3, doneToday: 1, today: [vm.today[0]], doneRows: [ticked] };
  const root = rendered(model);
  const toggle = root.querySelector<HTMLElement>('.brain-today > .brain-fold > button.brain-fold-toggle');
  const list = root.querySelector<HTMLElement>('.brain-today > .brain-fold > ul.brain-tasks');
  assert.ok(toggle && list);
  assert.equal(root.querySelector('.brain-today > .brain-fold')?.getAttribute('data-fold'), 'done-today');
  assert.equal(toggle.getAttribute('data-key'), 'fold:done-today');
  assert.equal(toggle.querySelector('.brain-count')?.textContent, '1');
  assert.equal(toggle.getAttribute('aria-controls'), list.id);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(list.hidden, true);
  assert.equal(toggle.querySelector('.brain-fold-hint')?.textContent, 'Show');

  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(list.hidden, false);
  assert.equal(toggle.querySelector('.brain-fold-hint')?.textContent, 'Hide');
  assert.equal(list.querySelectorAll('.brain-task').length, 1);

  renderToday(root, model, actions);
  assert.equal(root.querySelector('.brain-fold-toggle')?.getAttribute('aria-expanded'), 'true');
});

test('Today: Done today lists the rows in the model order, not re-sorted', () => {
  const [a, b] = [vm.today[0], vm.today[1]];
  const model: TodayVM = { ...vm, today: [], doneToday: 2, doneRows: [{ ...b, state: 'done' }, { ...a, state: 'done' }] };
  const keys = [...rendered(model).querySelectorAll<HTMLElement>('.brain-fold .brain-task')].map((li) => li.dataset.key);
  assert.deepEqual(keys, [b.key, a.key]);
});

test('Today: an empty day shows the header without a figure, and one calm line', () => {
  const root = rendered(buildToday({ notes: [] }, TODAY));
  assert.equal(root.querySelector('.brain-head .brain-title')?.textContent, '13 October');
  assert.equal(root.querySelectorAll('.brain-figure').length, 0);
  assert.equal(root.querySelector('.brain-page > p.brain-empty')?.textContent, 'Nothing left for today.');
  assert.equal(root.querySelectorAll('.brain-grid').length, 0);
});

test('Today: the Schedule takes the clock and the view it is handed, and a redraw keeps Whole day open', () => {
  const busy = ['08:00', '09:30', '11:30', '13:00', '15:00', '17:30', '20:15'].map((start, i): EventVM => ({
    key: `k${i}`, path: 'a.md', title: `Event ${i}`, start, end: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}${start.slice(2)}`,
  }));
  const day = { ...vm, schedule: busy };
  const root = document.createElement('div');
  renderToday(root, day, actions, { now: '11:10' });
  assert.equal(root.querySelector('.brain-area-sched')?.className, 'brain-tile brain-area-sched');   // large by default
  assert.equal(root.querySelectorAll('.brain-area-sched .brain-scroll .brain-now-line').length, 1);
  assert.equal(root.querySelector('.brain-area-sched .brain-tools > button')?.textContent, 'Whole day');
  fire(root.querySelector('.brain-area-sched .brain-tools > button')!, 'click');
  renderToday(root, day, actions, { now: '11:11' });   // a tick redraws the view
  assert.equal(root.querySelector('.brain-area-sched .brain-tools > button')?.textContent, 'Fit');
  renderToday(root, day, actions, { now: '11:10', schedule: 'compact' });
  assert.equal(root.querySelector('.brain-area-sched')?.className, 'brain-tile brain-area-sched brain-is-compact');
  assert.equal(root.querySelectorAll('.brain-area-sched .brain-scroll').length, 0);
});

// ---------- The Large window keeps where it was scrolled ----------

/**
 * A ResizeObserver for linkedom, which has no layout. A window it watches is 288px high with its now-line at 500 (its own
 * top at 100, an hour 48px), so opening at now scrolls it to 352. Like the browser's, it calls back after the tile is on the page:
 * the test calls `settle()` for that, or `log.callbacks[n]()` to run an older observer's callback.
 */
function fakeObserver(t: { after(fn: () => void): void }) {
  const log = { observed: 0, disconnected: 0, callbacks: [] as Array<() => void> };
  class Fake {
    private readonly callback: (entries: unknown[], observer: Fake) => void;
    constructor(callback: (entries: unknown[], observer: Fake) => void) {
      this.callback = callback;
    }
    observe(scroller: HTMLElement): void {
      log.observed++;
      Object.assign(scroller, { clientHeight: 288, scrollTop: 0, getBoundingClientRect: () => ({ top: 100 }) });
      Object.assign(scroller.querySelector('.brain-timeline')!, { offsetHeight: 768 });
      Object.assign(scroller.querySelector('.brain-now-line')!, { getBoundingClientRect: () => ({ top: 500 }) });
      log.callbacks.push(() => this.callback([], this));
    }
    disconnect(): void {
      log.disconnected++;
    }
  }
  const view = document.defaultView as unknown as Record<string, unknown>;
  view.ResizeObserver = Fake;
  t.after(() => delete view.ResizeObserver);
  return { log, settle: () => log.callbacks.at(-1)?.() };
}

/** A page the tile is drawn into, on the document, as the browser needs for it to be laid out. */
function page(t: { after(fn: () => void): void }, day: string): HTMLElement {
  const root = document.createElement('div');
  root.dataset.today = day;
  document.body.append(root);
  t.after(() => root.remove());
  return root;
}

const busyDay = (): TodayVM => ({
  ...vm,
  schedule: ['08:00', '09:30', '11:30', '13:00', '15:00', '17:30', '20:15'].map((start, i): EventVM => ({
    key: `k${i}`, path: 'a.md', title: `Event ${i}`, start, end: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}${start.slice(2)}`,
  })),
});
const scroller = (root: HTMLElement) => root.querySelector<HTMLElement>('.brain-scroll')!;

test('Today: the Large window opens at now, and a redraw of the same day keeps where it was scrolled', (t) => {
  const { settle } = fakeObserver(t);
  const root = page(t, '2026-10-13');
  renderToday(root, busyDay(), actions, { now: '11:10' });
  settle();
  assert.equal(scroller(root).scrollTop, 352);   // 500 − 100 − 48: the now-line an hour below the top
  scroller(root).scrollTop = 40;                  // the user scrolls up to the morning, then ticks a task
  renderToday(root, busyDay(), actions, { now: '11:11' });
  settle();
  assert.equal(scroller(root).scrollTop, 40);
  renderToday(root, busyDay(), actions, { now: '11:12' });
  settle();
  assert.equal(scroller(root).scrollTop, 40, 'and again');
});

test('Today: a new day opens at now again', (t) => {
  const { settle } = fakeObserver(t);
  const root = page(t, '2026-10-13');
  renderToday(root, busyDay(), actions, { now: '11:10' });
  settle();
  scroller(root).scrollTop = 40;
  root.dataset.today = '2026-10-14';   // midnight: the host redraws with the new day
  renderToday(root, busyDay(), actions, { now: '11:10' });
  settle();
  assert.equal(scroller(root).scrollTop, 352);
});

test('Today: a window that was never placed (drawn narrow, hidden) has no position to keep, and opens at now when it first shows', (t) => {
  const { settle } = fakeObserver(t);
  const root = page(t, '2026-10-13');
  renderToday(root, busyDay(), actions, { now: '11:10' });   // the observer has not called back: not laid out yet
  assert.equal(scroller(root).hasAttribute('data-placed'), false);
  scroller(root).scrollTop = 40;
  renderToday(root, busyDay(), actions, { now: '11:10' });
  settle();
  assert.equal(scroller(root).scrollTop, 352);
  // Hidden after it was placed (the view narrowed): placed is forgotten, so a redraw then starts at now too.
  Object.assign(scroller(root), { clientHeight: 0 });
  settle();
  assert.equal(scroller(root).hasAttribute('data-placed'), false);
  scroller(root).scrollTop = 40;
  renderToday(root, busyDay(), actions, { now: '11:10' });
  settle();
  assert.equal(scroller(root).scrollTop, 352);
});

test('Today: the window of a replaced tile lets go of its observer', (t) => {
  const { log, settle } = fakeObserver(t);
  const root = page(t, '2026-10-13');
  renderToday(root, busyDay(), actions, { now: '11:10' });
  settle();
  assert.equal(log.disconnected, 0, 'a tile that is on the page keeps watching');
  const first = log.callbacks[0];
  renderToday(root, busyDay(), actions, { now: '11:11' });   // the first tile leaves the page
  first();                                                    // what the browser does when a watched tile resizes to nothing
  assert.equal(log.disconnected, 1);
  settle();
  assert.equal(log.disconnected, 1, 'the new tile is still watched');
  assert.equal(log.observed, 2);
});
