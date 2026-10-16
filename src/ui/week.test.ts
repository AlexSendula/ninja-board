import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, recorder, sampleNote } from '../../test/ui.ts';   // first: it installs the DOM
import { dropOnWeek, renderWeek } from './week.ts';
import { wakeAt } from './clock.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample, loadSampleWithoutPoints, readSample } from '../../test/sample.ts';
import type { BoardItem, ThisWeekVM, WeekVM } from '../model/types.ts';
import type { DropTarget } from './drag.ts';
import { noteRow } from '../model/rows.ts';
import type { Actions } from './actions.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42: Mon 12 to Sun 18 October
const vm = thisWeek(buildWeek(loadSample(), TODAY));

/** The live board of today's week. */
function thisWeek(model: WeekVM): ThisWeekVM {
  assert.ok(model.kind === 'this', 'expected this week');
  return model;
}

function rendered(model: WeekVM, actions: Actions = recorder().actions): HTMLElement {
  const root = document.createElement('div');
  renderWeek(root, model, actions);
  return root;
}

function columns(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.brain-page > .brain-board.brain-board-week > section.brain-col')];
}

function item(title: string): BoardItem {
  const all = [...vm.columns.todo, ...vm.columns.doing, ...vm.columns.waiting, ...vm.columns.done];
  const found = all.find((i) => (i.kind === 'row' ? i.row.title : i.card.title) === title);
  assert.ok(found, 'no item ' + title);
  return found;
}

function elementFor(root: HTMLElement, i: BoardItem): HTMLElement {
  const key = i.kind === 'row' ? i.row.key : i.card.key;
  const el = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((e) => e.dataset.key === key);
  assert.ok(el, 'no element for ' + key);
  return el;
}

test('Week: header with ring and figure, then the strip, Coming up and the board', () => {
  const root = rendered(vm);
  const page = root.querySelector(':scope > .brain-view > .brain-page');
  assert.ok(page);
  assert.equal(page.querySelector(':scope > .brain-head .brain-label')?.textContent, 'WEEK 42');
  assert.equal(page.querySelector(':scope > .brain-head .brain-title')?.textContent, '12–18 October');
  assert.equal(page.querySelector('.brain-figure > span')?.textContent, '2/14');   // the tasks figure: done out of all (Stage B replaced "12 left")
  assert.equal(page.querySelector('.brain-figure .brain-ring')?.getAttribute('aria-label'), '2 of 14 done this week');
  const parts = ['brain-head', 'brain-strip', 'brain-week-line', 'brain-board-week'];
  assert.deepEqual([...page.children].map((c) => parts.find((p) => c.classList.contains(p))), parts);
});

test('Week: To do, Doing, Waiting and Done hold 7, 2, 1 and 2 items', () => {
  const cols = columns(rendered(vm));
  assert.deepEqual(cols.map((c) => c.dataset.column), ['todo', 'doing', 'waiting', 'done']);
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-label-row > .brain-label')?.textContent), ['To do', 'Doing', 'Waiting', 'Done']);
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-label-row > .brain-count')?.textContent), ['7', '2', '1', '2']);
  assert.deepEqual(cols.map((c) => c.querySelectorAll(':scope > .brain-col-items > [data-key]').length), [7, 2, 1, 2]);
});

test('Week: every board row drags, a repeating one included', () => {
  const dentist = item('Dentist checkup');
  assert.ok(dentist.kind === 'row' && dentist.row.repeating);
  const el = elementFor(rendered(vm), dentist);
  assert.equal(el.classList.contains('brain-draggable'), true);
  assert.equal(el.hasAttribute('data-repeat'), true);
});

/** A drop on a column; no place: a Done column, or a call that only changes the state. */
const onto = (column: string, index: number | null = null): DropTarget => ({ kind: 'column', column, index });

test('Week: a drop on another column sets the line state or the story status', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  const drop = dropOnWeek(vm, actions);
  const gutters = item('Clean the gutters');
  const done = item('Pick design B with Sam');
  assert.ok(gutters.kind === 'row' && done.kind === 'row');

  drop(elementFor(root, gutters), onto('doing'));
  drop(elementFor(root, done), onto('todo'));
  drop(elementFor(root, item('Choose a contractor')), onto('todo'));
  drop(elementFor(root, item("Choose hosting for Sam's site")), onto('done'));
  // No change: the same column, or an unknown one.
  drop(elementFor(root, item('Build the homepage header')), onto('doing'));
  drop(elementFor(root, gutters), onto('later'));

  // A move also saves the column it left; the arranging tests below check those lists.
  assert.deepEqual(calls.filter(([name]) => name !== 'arrange'), [
    ['setState', gutters.row.target, 'doing'],
    ['setState', done.row.target, 'todo'],
    ['setNoteStatus', '03 Projects/Renovate the kitchen/Choose a contractor.md', 'open'],
    ['setNoteStatus', "03 Projects/Website for Sam/Choose hosting for Sam's site.md", 'done'],
  ]);
});

test('Week: a task note row moves by its note target; a repeating row changes state by its note target, too', () => {
  const { actions, calls } = recorder();
  // Renew passport: an area's task note that doesn't repeat, so its row is set on its note.
  const note = noteRow(sampleNote('Renew passport'), TODAY);
  const noteItem: BoardItem = { kind: 'row', row: note, arrangeKey: 'Renew passport' };
  const shaped: ThisWeekVM = { ...vm, columns: { todo: [noteItem], doing: [], waiting: [], done: [] } };
  dropOnWeek(shaped, actions)(elementFor(rendered(shaped, actions), noteItem), onto('doing'));
  assert.deepEqual(calls, [['setState', note.target, 'doing']]);   // To do had no saved list: it stays automatic

  calls.length = 0;
  const drop = dropOnWeek(vm, actions);
  const dentist = elementFor(rendered(vm, actions), item('Dentist checkup'));
  drop(dentist, onto('doing'));
  drop(dentist, onto('done'));
  // A repeating row changes state like any row; a drop on Done is the write that completes its occurrence.
  assert.deepEqual(calls.filter((c) => c[0] === 'setState').map((c) => c[2]), ['doing', 'done']);
});

test('Week: an empty week keeps its columns, each with a calm line', () => {
  const root = rendered(buildWeek({ notes: [] }, TODAY));
  assert.equal(root.querySelectorAll('.brain-figure').length, 0);
  const cols = columns(root);
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-count')?.textContent), ['0', '0', '0', '0']);
  assert.deepEqual(
    cols.map((c) => c.querySelector('.brain-col-items > li.brain-empty')?.textContent),
    ['Nothing planned this week', 'Nothing in progress', 'Nothing waiting', 'Nothing done this week yet'],
  );
});

/** The pager button with this aria-label, or this text when it has none. */
function pagerButton(root: HTMLElement, name: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('.brain-head .brain-pager > button')]
    .find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name);
  assert.ok(found, 'no pager button ' + name);
  return found;
}

test('Week paging: this week has ‹ WEEK 42 › and no This week; ‹ and › show the weeks either side', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  const pager = root.querySelector('.brain-page > .brain-head > div > .brain-pager');
  assert.ok(pager);
  assert.deepEqual([...pager.children].map((c) => [c.tagName, c.className, c.getAttribute('aria-label') ?? c.textContent]), [
    ['BUTTON', 'brain-step', 'Previous week'],
    ['P', 'brain-label', 'WEEK 42'],
    ['BUTTON', 'brain-step', 'Next week'],
  ]);
  assert.deepEqual([...pager.querySelectorAll('button > svg.brain-step-icon')].map((s) => s.getAttribute('aria-hidden')), ['true', 'true']);
  pagerButton(root, 'Previous week').click();
  pagerButton(root, 'Next week').click();
  assert.deepEqual(calls, [['showWeek', '2026-10-05'], ['showWeek', '2026-10-19']]);
});

test("Coming up: under this week's strip, the next three weeks with their counts; a chip shows its week", () => {
  const { actions, calls } = recorder();
  const nav = rendered(vm, actions).querySelector<HTMLElement>('.brain-page > nav.brain-week-line');
  assert.ok(nav);
  const heading = nav.querySelector(':scope > h3.brain-label');
  assert.equal(heading?.textContent, 'Coming up');
  assert.ok(heading?.id);
  assert.equal(nav.getAttribute('aria-labelledby'), heading?.id);
  const chips = [...nav.querySelectorAll<HTMLElement>(':scope > div.brain-week-chips > button.brain-week-chip')];
  assert.deepEqual(chips.map((c) => c.getAttribute('aria-label')), [
    'Week 43, 5 planned or due', 'Week 44, 1 planned or due', 'Week 45, nothing planned or due',
  ]);
  assert.deepEqual(chips.map((c) => [c.firstChild?.textContent, c.querySelector(':scope > span')?.textContent]), [
    ['Week 43', '5'], ['Week 44', '1'], ['Week 45', '0'],
  ]);
  // A week with nothing in it is muted.
  assert.deepEqual(chips.map((c) => c.classList.contains('brain-is-empty')), [false, false, true]);
  chips[1].click();
  assert.deepEqual(calls, [['showWeek', '2026-10-26']]);
});

test('Week: an upcoming week with nothing planned or due has no figure, not "0 planned or due"', () => {
  const next = rendered({ ...buildWeek(loadSampleWithoutPoints(), TODAY, { start: '2026-10-19' }), planned: 0 } as WeekVM);
  absent(next.querySelector('.brain-head .brain-figure'));
});

test('Week paging: an upcoming and a past week have This week; an upcoming week counts what is planned or due', () => {
  const upcoming = recorder();
  const next = rendered(buildWeek(loadSampleWithoutPoints(), TODAY, { start: '2026-10-19' }), upcoming.actions);
  assert.equal(next.querySelector('.brain-head .brain-label')?.textContent, 'WEEK 43');
  assert.equal(next.querySelector('.brain-head .brain-counts')?.getAttribute('aria-label'), '5 in the week, 3 due');
  assert.equal(next.querySelectorAll('.brain-figure .brain-ring, nav.brain-week-line, .brain-board').length, 0);
  pagerButton(next, 'This week').click();
  pagerButton(next, 'Next week').click();
  assert.deepEqual(upcoming.calls, [['showWeek', '2026-10-12'], ['showWeek', '2026-10-26']]);

  const earlier = recorder();
  const before = rendered(buildWeek(loadSample(), TODAY, { start: '2026-09-28' }), earlier.actions);
  assert.equal(before.querySelector('.brain-head .brain-label')?.textContent, 'WEEK 40');
  assert.equal(before.querySelectorAll('nav.brain-week-line').length, 0);
  const back = pagerButton(before, 'This week');
  assert.equal(back.className, 'brain-quiet');
  back.click();
  pagerButton(before, 'Previous week').click();
  assert.deepEqual(earlier.calls, [['showWeek', '2026-10-12'], ['showWeek', '2026-09-21']]);
});

// ---------- Arranging ----------

test('Week: To do, Doing and Waiting can be arranged; Done keeps its time order', () => {
  assert.deepEqual(columns(rendered(vm)).map((c) => c.hasAttribute('data-arrange')), [true, true, true, false]);
});

test('Week: Clean the gutters dropped at the top of To do saves To do\'s new order, and changes no state', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  dropOnWeek(vm, actions)(elementFor(root, item('Clean the gutters')), onto('todo', 0));
  assert.deepEqual(calls, [['arrange', {
    todo: [
      'Home › Clean the gutters', 'Health › Book a physio session', 'Home › Fix the hallway light switch', 'Dentist checkup',
      'Website for Sam › Send Sam the hosting options', 'Money › Compare energy contracts', 'Home › Back up the photos',
    ],
  }]]);
});

test('Week: Clean the gutters dropped second in Doing becomes doing there; Doing is saved, and To do (never arranged) is not', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  const gutters = item('Clean the gutters');
  assert.ok(gutters.kind === 'row');
  dropOnWeek(vm, actions)(elementFor(root, gutters), onto('doing', 1));
  assert.deepEqual(calls, [
    ['setState', gutters.row.target, 'doing'],
    ['arrange', {
      doing: ['Website for Sam › Build the homepage header', 'Home › Clean the gutters', "Choose hosting for Sam's site"],
    }],
  ]);
});

test('Week: a card dropped on Done is done; Waiting, with no saved list, is not written', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  dropOnWeek(vm, actions)(elementFor(root, item('Choose a contractor')), onto('done'));
  assert.deepEqual(calls, [['setNoteStatus', '03 Projects/Renovate the kitchen/Choose a contractor.md', 'done']]);
});

test('Week: a card that leaves a column with a saved list is taken out of that list only; a column without one stays automatic', () => {
  // The author arranged Waiting by hand: its one card first. To do has no saved list.
  const arranged = thisWeek(buildWeek(loadSample(), TODAY, { arrange: { waiting: ['Choose a contractor'] } }));
  const { actions, calls } = recorder();
  const root = rendered(arranged, actions);
  const drop = dropOnWeek(arranged, actions);
  drop(elementFor(root, item('Choose a contractor')), onto('done'));
  // Not the whole shown order: the saved list, without the moved card.
  assert.deepEqual(calls, [
    ['setNoteStatus', '03 Projects/Renovate the kitchen/Choose a contractor.md', 'done'],
    ['arrange', { waiting: [] }],
  ]);

  calls.length = 0;
  // A card that was not in the saved list leaves it as it was: nothing to write for To do. Doing is placed, so it is saved in full.
  const photos = item('Back up the photos');
  assert.ok(photos.kind === 'row');
  drop(elementFor(root, photos), onto('doing', 0));
  assert.deepEqual(calls, [
    ['setState', photos.row.target, 'doing'],
    ['arrange', { doing: [
      'Home › Back up the photos', 'Website for Sam › Build the homepage header', "Choose hosting for Sam's site",
    ] }],
  ]);

  calls.length = 0;
  // Waiting is saved as arranged: the card leaving it is taken out of that list too, and To do writes nothing.
  drop(elementFor(root, item('Choose a contractor')), onto('todo'));
  assert.deepEqual(calls, [
    ['setNoteStatus', '03 Projects/Renovate the kitchen/Choose a contractor.md', 'open'],
    ['arrange', { waiting: [] }],
  ]);
});

test('Week: a drop that keeps the order calls nothing', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  const drop = dropOnWeek(vm, actions);
  drop(elementFor(root, item('Clean the gutters')), onto('todo', 2));     // third of eight, stays third
  drop(elementFor(root, item('Choose a contractor')), onto('waiting', 0));  // the only waiting card, stays first
  assert.deepEqual(calls, []);
});

test('Week: Alt+↑ on the hallway switch, on the board, puts it first in To do', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  fire(elementFor(root, item('Fix the hallway light switch')), 'keydown', { key: 'ArrowUp', altKey: true });
  assert.deepEqual(calls, [['arrange', {
    todo: [
      'Home › Fix the hallway light switch', 'Health › Book a physio session', 'Home › Clean the gutters', 'Dentist checkup',
      'Website for Sam › Send Sam the hosting options', 'Money › Compare energy contracts', 'Home › Back up the photos',
    ],
  }]]);
});

// ---------- Planning on the week view (Task 13) ----------

/** An upcoming week, as buildWeek gives it. */
function upcomingVm(start: string) {
  const model = buildWeek(loadSample(), TODAY, { start });
  if (model.kind !== 'upcoming') throw new Error(`expected an upcoming week, got ${model.kind}`);
  return model;
}

test("Week: this week's strip days from today on take a drop, each for its date; Monday, already past, takes none", () => {
  const page = rendered(vm).querySelector('.brain-page');
  assert.ok(page);
  const zones = (selector: string) => [...page.querySelectorAll(selector)].map((d) => [d.getAttribute('data-drop'), d.getAttribute('data-date')]);
  const expected = vm.days.map((d) => [d.isPast ? null : 'day', d.iso]);
  assert.deepEqual(expected[0], [null, '2026-10-12']);
  assert.deepEqual(zones('.brain-strip > ol.brain-days > li.brain-day'), expected);
  assert.deepEqual(zones('.brain-strip > .brain-picks > button.brain-day-pick'), expected);
});

test('Week: a board line and a plannable story card dropped on a strip day are planned for it', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  const drop = dropOnWeek(vm, actions);
  const gutters = item('Clean the gutters');
  assert.ok(gutters.kind === 'row');
  drop(elementFor(root, gutters), { kind: 'day', date: '2026-10-15' });
  const hosting = item("Choose hosting for Sam's site");
  assert.ok(hosting.kind === 'card');
  drop(elementFor(root, hosting), { kind: 'day', date: '2026-10-15' });
  assert.deepEqual(calls, [
    ['plan', gutters.row.target, { day: '2026-10-15' }],
    ['plan', { kind: 'note', path: hosting.card.path, state: hosting.card.column }, { day: '2026-10-15' }],
  ]);
});

test('Week: an upcoming week: the head has the pill beside its title, then the strip and the plan', () => {
  const page = rendered(upcomingVm('2026-10-19')).querySelector('.brain-page');
  assert.ok(page);
  assert.equal(page.querySelector(':scope > .brain-head .brain-title-row > .brain-plan-toggle')?.getAttribute('data-week'), '2026-10-19');
  const parts = ['brain-head', 'brain-strip', 'brain-plan'];
  assert.deepEqual([...page.children].map((c) => parts.find((p) => c.classList.contains(p))), parts);
});

test('Week: paging to another week closes To plan, and coming back shows the preview again', () => {
  const { actions } = recorder();
  const root = rendered(upcomingVm('2026-10-19'), actions);
  fire(root.querySelector('.brain-plan-toggle')!, 'click');
  renderWeek(root, upcomingVm('2026-10-26'), actions);
  assert.equal(root.querySelector('.brain-plan-toggle')?.getAttribute('aria-expanded'), 'false');
  assert.equal(root.querySelector('.brain-to-plan')?.hasAttribute('hidden'), true);
  renderWeek(root, upcomingVm('2026-10-19'), actions);
  assert.equal(root.querySelector('.brain-to-plan')?.hasAttribute('hidden'), true);
});

test("Week: To plan's Still open Show all opens the list with its 8 rows", () => {
  const { actions, calls } = recorder();
  const root = rendered(upcomingVm('2026-10-19'), actions);
  fire(root.querySelector('.brain-to-plan .brain-more')!, 'click');
  assert.deepEqual(calls, [['showAll', 'open', 8]]);
});

// ---------- Busy days: the strip at a given time ----------

const strip = (root: HTMLElement) => [...root.querySelectorAll('.brain-strip ol.brain-days > li')];
const dayOf = (root: HTMLElement, iso: string) => strip(root).find((li) => li.getAttribute('data-date') === iso)!;

test('Week, this week at 11:10: the sample Tuesday still has its dance class, and the strip is drawn again at its end', () => {
  const root = document.createElement('div');
  renderWeek(root, vm, recorder().actions, { now: '11:10' });
  const tuesday = dayOf(root, '2026-10-13');
  assert.deepEqual([...tuesday.querySelectorAll('.brain-chip-title')].map((c) => c.textContent), ['Dance class']);
  absent(tuesday.querySelector('.brain-more-item'));
  assert.equal(root.dataset.changeAt, '22:15');   // Dance class ends then: the next change today
});

test('Week, this week at 22:30: the dance class has ended, so Tuesday reads "1 earlier" and opens the day', () => {
  const { actions, calls } = recorder();
  const root = document.createElement('div');
  renderWeek(root, vm, actions, { now: '22:30' });
  const tuesday = dayOf(root, '2026-10-13');
  assert.equal(tuesday.querySelectorAll('.brain-chip').length, 0);
  const button = tuesday.querySelector('.brain-more-item > button')!;
  assert.equal(button.textContent, '1 earlier');
  assert.equal(root.dataset.changeAt, undefined, 'nothing more ends today');
  // Thursday's contractor visit is still ahead.
  assert.deepEqual([...dayOf(root, '2026-10-15').querySelectorAll('.brain-chip-title')].map((c) => c.textContent), ['Contractor visit']);
  fire(button, 'click');
  assert.deepEqual(calls, [['showDay', 'Tuesday 13 October · 1', ['Dance class'], '22:30']]);
});

test('Week, a redraw clears the change time it no longer has', () => {
  const root = document.createElement('div');
  renderWeek(root, vm, recorder().actions, { now: '11:10' });
  assert.equal(root.dataset.changeAt, '22:15');
  renderWeek(root, vm, recorder().actions, { now: '23:00' });
  assert.equal(root.dataset.changeAt, undefined);
  renderWeek(root, vm, recorder().actions);   // no clock: nothing to schedule
  assert.equal(root.dataset.changeAt, undefined);
});

test('Week, an upcoming week and a past week draw their strip by their own rules, whatever the time', () => {
  const root = document.createElement('div');
  const upcoming = buildWeek(loadSample(), TODAY, { start: '2026-10-19' });
  renderWeek(root, upcoming, recorder().actions, { now: '23:59' });
  assert.deepEqual([...root.querySelectorAll('.brain-strip ol.brain-days .brain-chip-title')].map((c) => c.textContent), ['Dance class']);   // Tue 20 October
  assert.equal(root.querySelectorAll('.brain-more-item').length, 0);
  assert.equal(root.dataset.changeAt, undefined);
  // Week 41, the record: Tuesday's dance class and Thursday's showroom, both long over, both still shown.
  const plan = readSample().find((n) => n.path === '08 Weeks/2026/2026-W41.md');
  renderWeek(root, buildWeek(loadSample(), TODAY, { start: '2026-10-05', plan }), recorder().actions, { now: '23:59' });
  assert.deepEqual([...root.querySelectorAll('.brain-strip ol.brain-days .brain-chip-title')].map((c) => c.textContent), ['Dance class', 'Kitchen showroom']);
  assert.equal(root.querySelectorAll('.brain-more-item').length, 0);
  assert.equal(root.dataset.changeAt, undefined);
});

test('Week, the view draws again at the next end: its change time, handed to wakeAt, fires then and the strip has moved on (fake clock)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 13, 11, 10, 20) });
  const root = document.createElement('div');
  const draw = () => renderWeek(root, vm, recorder().actions, { now: '11:10' });
  const redraws = mock.fn(() => {
    // What BrainView does when the timer fires: draw at the clock then.
    const d = new Date();
    renderWeek(root, vm, recorder().actions, { now: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
  });
  draw();
  assert.equal(root.dataset.changeAt, '22:15');
  wakeAt(root.dataset.changeAt, new Date(), redraws);
  t.mock.timers.tick(11 * 60 * 60_000 + 4 * 60_000);   // 22:14:20
  assert.equal(redraws.mock.callCount(), 0);
  assert.equal(dayOf(root, '2026-10-13').querySelectorAll('.brain-chip').length, 1);
  t.mock.timers.tick(42_000);                           // 22:15:02, a second into the minute the dance class ended
  assert.equal(redraws.mock.callCount(), 1);
  assert.equal(dayOf(root, '2026-10-13').querySelectorAll('.brain-chip').length, 0);
  assert.equal(root.dataset.changeAt, undefined);
});
