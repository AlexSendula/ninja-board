import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { dropOnPlan, planParts, planWasOpen } from './plan.ts';
import { renderWeek } from './week.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample } from '../../test/sample.ts';
import type { RowVM, UpcomingWeekVM, VaultSnapshot, WeekVM } from '../model/types.ts';
import type { Actions } from './actions.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42; week 43 is Mon 19 to Sun 25 October

function upcoming(s: VaultSnapshot, start: string): UpcomingWeekVM {
  const vm = buildWeek(s, TODAY, { start });
  if (vm.kind !== 'upcoming') throw new Error(`expected an upcoming week, got ${vm.kind}`);
  return vm;
}

const w43 = upcoming(loadSample(), '2026-10-19');

function fresh(): HTMLElement {
  return document.createElement('div');
}

function rendered(vm: WeekVM, actions: Actions = recorder().actions): HTMLElement {
  const root = fresh();
  renderWeek(root, vm, actions);
  return root;
}

/** A row of week 43, from Planned or due or from To plan. */
function rowOf(title: string): RowVM {
  const all = [
    ...w43.byDay.flatMap((g) => g.rows),
    ...w43.toPlan.open,
    ...w43.toPlan.dueSoon,
    ...w43.toPlan.noDate.flatMap((g) => g.rows),
  ];
  const found = all.find((r) => r.title === title);
  assert.ok(found, 'no row ' + title);
  return found;
}

/** The element drawn for this row key, within `within`. */
function keyed(within: Element, key: string): HTMLElement {
  const el = [...within.querySelectorAll<HTMLElement>('[data-key]')].find((e) => e.dataset.key === key);
  assert.ok(el, 'no element for ' + key);
  return el;
}

// Each item of a list: a row's text, or a story card's title (a card's lines are not items of the list).
const titles = (el: Element): (string | null)[] => [...el.querySelectorAll('ul.brain-tasks:not(.brain-story-lines) > li')]
  .map((li) => li.querySelector('.brain-task-text, .brain-card-title')?.textContent ?? null);

test('week 43: the head holds the Plan this week pill beside the title, and the counts are 5 in the week, 3 due', () => {
  const page = rendered(w43).querySelector(':scope > .brain-view > .brain-page');
  assert.ok(page);
  const row = page.querySelector(':scope > .brain-head > div > .brain-title-row');
  assert.ok(row);
  assert.deepEqual([...row.children].map((c) => c.tagName), ['H2', 'BUTTON']);
  assert.equal(row.querySelector('.brain-plan-toggle > span')?.textContent, 'Plan this week');
  assert.equal(page.querySelector(':scope > .brain-head .brain-counts')?.getAttribute('aria-label'), '5 in the week, 3 due');
});

test('week 43: under the strip the plan body, Planned or due beside To plan; the days take drops, a past week has none', () => {
  const page = rendered(w43).querySelector(':scope > .brain-view > .brain-page');
  assert.ok(page);
  const parts = ['brain-head', 'brain-strip', 'brain-plan'];
  assert.deepEqual([...page.children].map((c) => parts.find((p) => c.classList.contains(p))), parts);
  const days = [...page.querySelectorAll('.brain-strip > ol.brain-days > li.brain-day')];
  assert.deepEqual(days.map((d) => [d.getAttribute('data-drop'), d.getAttribute('data-date')]), w43.days.map((d) => ['day', d.iso]));
  assert.equal(page.querySelectorAll('.brain-strip > .brain-picks > button[data-drop="day"]').length, 7);
  const plan = page.querySelector(':scope > .brain-plan');
  assert.ok(plan);
  assert.deepEqual([...plan.children].map((c) => c.className), ['brain-tile brain-planned', 'brain-tile brain-to-plan']);
  // A past week is read-only: nothing on it takes a drop.
  assert.equal(rendered(buildWeek(loadSample(), TODAY, { start: '2026-09-28' })).querySelectorAll('[data-drop]').length, 0);
});

test('week 43: Planned or due holds 5, Any day first, then each day, with its label and slot', () => {
  const tile = planParts(w43, fresh(), recorder().actions, false).querySelector<HTMLElement>(':scope > section.brain-planned');
  assert.ok(tile);
  assert.deepEqual([tile.getAttribute('data-drop'), tile.getAttribute('data-week'), tile.getAttribute('data-slot-label')], ['week', '2026-10-19', 'Any day in week 43']);
  assert.equal(tile.querySelector(':scope > .brain-label-row > h3.brain-label')?.textContent, 'Planned or due');
  assert.equal(tile.querySelector(':scope > .brain-label-row > .brain-count')?.textContent, '5');
  const groups = [...tile.querySelectorAll(':scope > .brain-by-day > .brain-group')];
  assert.deepEqual(groups.map((g) => [g.querySelector(':scope > h4.brain-group-name')?.textContent, titles(g)]), [
    ['Any day', ['Book the boiler service']],
    ['Tue 20', ['Get photos from Sam', "Choose hosting for Sam's site"]],
    ['Thu 22', ['Back up the laptop']],
    ['Sat 24', ['Choose a contractor']],
  ]);
  assert.equal(tile.querySelectorAll('.brain-group[data-any]').length, 1);
});

test('week 43: a story in Planned or due is a card, with its ring and count in its card side, and no check', () => {
  const plan = planParts(w43, fresh(), recorder().actions, false);
  const hosting = keyed(plan, rowOf("Choose hosting for Sam's site").key);
  assert.equal(hosting.className, 'brain-tile brain-card brain-foldable');   // it folds by the view's list, as the board's cards do
  assert.deepEqual([hosting.getAttribute('data-state'), hosting.hasAttribute('data-story')], ['doing', true]);
  assert.equal(hosting.querySelector(':scope > .brain-card-head > .brain-card-side .brain-ring')?.getAttribute('aria-label'), '1 of 3 done');
  assert.equal(hosting.querySelector(':scope > .brain-card-head > .brain-card-side > .brain-progress > span[aria-hidden="true"]')?.textContent, '1/3');
  assert.equal(hosting.querySelector(':scope > .brain-story-lines > li .brain-check') !== null, true);
  const contractor = keyed(plan, rowOf('Choose a contractor').key);
  assert.deepEqual([contractor.getAttribute('data-state'), contractor.querySelector('.brain-meta .brain-strong')?.textContent], ['waiting', 'Waiting on Bram']);
  assert.equal(contractor.querySelector(':scope > .brain-card-head .brain-progress .brain-ring')?.getAttribute('aria-label'), '1 of 3 done');
});

test('week 43: Planned or due rows drag only while To plan is open, the repeating note included', () => {
  const dragging = (plan: Element) => [...plan.querySelectorAll('.brain-planned li.brain-draggable')].map((li) => li.querySelector('.brain-task-text, .brain-card-title')?.textContent);
  assert.deepEqual(dragging(planParts(w43, fresh(), recorder().actions, false)), []);
  const open = planParts(w43, fresh(), recorder().actions, true);
  // Get photos from Sam is waiting: its date is a chase date; a story plans like a task note, as a card; a repeating note too.
  assert.deepEqual(dragging(open), ['Book the boiler service', "Choose hosting for Sam's site", 'Back up the laptop']);
});

test('To plan: a group of exactly five rows has no Show all, as five is the most a group draws', () => {
  const trimmed = { ...w43, toPlan: { ...w43.toPlan, open: w43.toPlan.open.slice(0, 5) } };
  const toPlan = planParts(trimmed, fresh(), recorder().actions, false).querySelector<HTMLElement>(':scope > section.brain-to-plan');
  assert.ok(toPlan);
  const row = [...toPlan.querySelectorAll<HTMLElement>(':scope > .brain-label-row')].find((r) => r.querySelector('.brain-label')?.textContent === 'Still open this week');
  assert.ok(row);
  assert.equal(row.querySelector('.brain-count')?.textContent, '5');
  absent(row.querySelector('.brain-more'));
});

test('week 43: To plan is hidden under its pill and counts 18: Still open 8, Due soon 2, No date 8; no hint line', () => {
  const toPlan = planParts(w43, fresh(), recorder().actions, false).querySelector<HTMLElement>(':scope > section.brain-to-plan');
  assert.ok(toPlan);
  assert.equal(toPlan.hasAttribute('hidden'), true);
  assert.equal(toPlan.getAttribute('data-drop'), 'unplan');
  assert.equal(toPlan.querySelectorAll(':scope > p.brain-meta').length, 0);
  assert.deepEqual(
    [...toPlan.querySelectorAll(':scope > .brain-label-row')].map((r) => [
      r.querySelector('.brain-label')?.textContent,
      r.querySelector('.brain-count')?.textContent,
      r.querySelector('.brain-more')?.textContent ?? null,
    ]),
    [['To plan', '18', null], ['Still open this week', '8', 'Show all 8'], ['Due soon', '2', null], ['No date', '8', 'Show all 8']],
  );
});

test('week 43: opened, To plan lists 5 of Still open, Due soon, and No date by group, with 12 rows drawn', () => {
  const toPlan = planParts(w43, fresh(), recorder().actions, true).querySelector<HTMLElement>(':scope > section.brain-to-plan');
  assert.ok(toPlan);
  assert.equal(toPlan.hasAttribute('hidden'), false);
  assert.deepEqual([...toPlan.querySelectorAll(':scope > ul.brain-tasks')].map((ul) => titles(ul)), [
    ['Book a physio session', 'Fix the hallway light switch', 'Clean the gutters', 'Send Sam the hosting options', 'Compare energy contracts'],
    ['Renew passport', 'Pay the car insurance'],
  ]);
  assert.deepEqual([...toPlan.querySelectorAll(':scope > .brain-group')].map((g) => [g.querySelector(':scope > a.brain-group-name')?.textContent, titles(g)]), [
    ['Website for Sam', ['Write the About page text']],
    ['Renovate the kitchen', ['Order cabinets', 'Measure the kitchen walls']],   // a story comes before the project's own to-dos
    ['Health', ['Order new running shoes']],
    ['Home', ['Replace the bathroom tap washer']],   // five rows are drawn; Sort the winter clothes is behind Show all
  ]);
  assert.equal(toPlan.querySelectorAll('li.brain-draggable').length, 12);   // rows and story cards alike
});

test('week 43: Plan this week shows To plan and drags the planned rows; a second click closes it', () => {
  const root = rendered(w43);
  const toggle = root.querySelector<HTMLButtonElement>('.brain-plan-toggle');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute('data-key'), `plan-toggle:${toggle.getAttribute('data-week')}`);
  const label = () => [toggle.getAttribute('aria-expanded'), toggle.querySelector('span')?.textContent];
  const hidden = () => root.querySelector('.brain-to-plan')?.hasAttribute('hidden');
  const dragging = () => [...root.querySelectorAll('.brain-planned li.brain-draggable')].map((li) => li.querySelector('.brain-task-text, .brain-card-title')?.textContent);
  assert.deepEqual([label(), hidden(), dragging()], [['false', 'Plan this week'], true, []]);
  fire(toggle, 'click');
  // Opening To plan makes the planned rows and story cards drag: a card as a row does, and it is folded behind its chevron.
  assert.deepEqual([label(), hidden(), dragging()], [['true', 'Done planning'], false, ['Book the boiler service', "Choose hosting for Sam's site", 'Back up the laptop']]);
  assert.deepEqual([planWasOpen(root, '2026-10-19'), planWasOpen(root, '2026-10-26')], [true, false]);
  fire(toggle, 'click');
  assert.deepEqual([label(), hidden(), dragging()], [['false', 'Plan this week'], true, []]);
});

test('week 43: an open To plan stays open across a re-render of the same week', () => {
  const { actions } = recorder();
  const root = rendered(w43, actions);
  fire(root.querySelector('.brain-plan-toggle')!, 'click');
  renderWeek(root, w43, actions);
  assert.equal(root.querySelector('.brain-plan-toggle')?.getAttribute('aria-expanded'), 'true');
  assert.equal(root.querySelector('.brain-to-plan')?.hasAttribute('hidden'), false);
});

test('dropOnPlan: a To plan row is planned on a day or for the week; a Planned or due row back on To plan has no date; a waiting row is never planned', () => {
  const { actions, calls } = recorder();
  const plan = planParts(w43, fresh(), actions, true);
  const drop = dropOnPlan(w43, actions);
  const boiler = rowOf('Book the boiler service');         // Planned or due
  const photos = rowOf('Get photos from Sam');             // Planned or due, but waiting: no plan
  const physio = rowOf('Book a physio session');           // Still open this week
  const hosting = rowOf("Choose hosting for Sam's site");  // a story: it plans like a task note
  drop(keyed(plan, physio.key), { kind: 'day', date: '2026-10-21' });
  drop(keyed(plan, physio.key), { kind: 'week', start: '2026-10-19' });
  drop(keyed(plan, boiler.key), { kind: 'unplan' });
  drop(keyed(plan, photos.key), { kind: 'unplan' });                       // waiting: its chase date is not a plan
  drop(keyed(plan, photos.key), { kind: 'day', date: '2026-10-21' });
  drop(keyed(plan, physio.key), { kind: 'unplan' });                       // in To plan already: nothing to remove
  drop(keyed(plan, physio.key), { kind: 'column', column: 'todo', index: 0 });   // an upcoming week has no board
  drop(keyed(plan, hosting.key), { kind: 'day', date: '2026-10-21' });
  assert.deepEqual(calls, [
    ['plan', physio.target, { day: '2026-10-21' }],
    ['plan', physio.target, { week: '2026-10-19' }],
    ['plan', boiler.target, null],
    ['plan', hosting.target, { day: '2026-10-21' }],
  ]);
});

test('an empty week: Nothing planned or due, and To plan has Nothing to plan', () => {
  const plan = planParts(upcoming({ notes: [] }, '2026-10-19'), fresh(), recorder().actions, true);
  const [planned, toPlan] = [...plan.children] as HTMLElement[];
  assert.equal(planned.querySelector(':scope > .brain-label-row > .brain-count')?.textContent, '0');
  assert.equal(planned.querySelectorAll('.brain-group').length, 0);
  assert.equal(planned.querySelector(':scope > p.brain-empty')?.textContent, 'Nothing planned or due');
  assert.equal(toPlan.querySelector(':scope > .brain-label-row > .brain-count')?.textContent, '0');
  assert.deepEqual([...toPlan.children].slice(1).map((c) => [c.tagName, c.className, c.textContent]), [['P', 'brain-empty', 'Nothing to plan']]);
});

test('the planner is marked while To plan is open, and Plan this week marks and unmarks it', () => {
  assert.equal(planParts(w43, fresh(), recorder().actions, true).hasAttribute('data-to-plan'), true);
  assert.equal(planParts(w43, fresh(), recorder().actions, false).hasAttribute('data-to-plan'), false);
  const root = rendered(w43);
  const toggle = root.querySelector<HTMLButtonElement>('.brain-plan-toggle')!;
  const marked = () => root.querySelector('.brain-plan')!.hasAttribute('data-to-plan');
  assert.equal(marked(), false);
  fire(toggle, 'click');
  assert.equal(marked(), true);
  fire(toggle, 'click');
  assert.equal(marked(), false);
});
