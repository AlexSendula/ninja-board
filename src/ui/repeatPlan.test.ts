// A repeating row in To do is planned from its planner card to a day, to next week or to no date, and its deadline stays:
// no deadline is written, and the red day stays red. The drops plan it the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { loadSample } from '../../test/sample.ts';
import type { RowVM, ThisWeekVM, UpcomingWeekVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h } from './dom.ts';
import { closeCard, openCard, rowCard } from './popover.ts';
import { dropOnPlan } from './plan.ts';
import { dropOnWeek } from './week.ts';
import { taskRow } from './task.ts';
import { buildWeek } from '../model/week.ts';

const TODAY = '2026-10-13';   // a Tuesday: this week is 12 to 18 October
const F14 = '2026-10-14';
const F15 = '2026-10-15';
const F16 = '2026-10-16';     // the Dentist checkup's deadline
const F21 = '2026-10-21';
const MON19 = '2026-10-19';
const AT = { x: 40, y: 48 };
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const sample = loadSample();

/** Closes any card and empties the body, so each test starts with no card on the page. */
function reset(): void {
  closeCard();
  for (const node of [...document.body.children]) node.remove();
}

/** The Dentist checkup row as This week's To do shows it. */
function dentistRow(): RowVM {
  const vm = buildWeek(sample, TODAY) as ThisWeekVM;
  const item = vm.columns.todo.find((i) => i.kind === 'row' && i.row.title === 'Dentist checkup');
  if (item?.kind !== 'row') throw new Error('Dentist checkup is not in To do');
  return item.row;
}

/** The row on a board drawn for today, with its planner card opened at it. */
function openDentist(actions: Actions) {
  const row = dentistRow();
  const root = h('div', 'brain-view');
  root.dataset.today = TODAY;
  document.body.append(root);
  const li = taskRow(row, actions);
  root.append(li);
  return { row, li, el: openCard(li, AT, rowCard(row), actions) };
}

const chip = (el: Element, day: string) => el.querySelector<HTMLElement>(`[data-day="${day}"]`)!;

test('the Dentist checkup row in To do opens the planner card: its deadline day is red, and it has the states and no points', () => {
  reset();
  const { row, el } = openDentist(recorder().actions);
  assert.equal(row.repeating, true);
  assert.equal(el.getAttribute('data-kind'), 'task');
  assert.equal(chip(el, F16).classList.contains('brain-is-due'), true);
  assert.equal(el.querySelectorAll('[data-set]').length, 5);
  absent(el.querySelector('.brain-plan-points'));
  closeCard();
});

test('a left click on a day plans the row for that day, and on that day again clears the plan: the deadline stays, and no deadline is written', async () => {
  reset();
  const { actions, calls } = recorder();
  const { row, el } = openDentist(actions);
  fire(chip(el, F14), 'click');
  await settle();
  assert.equal(chip(el, F14).getAttribute('aria-pressed'), 'true');
  fire(chip(el, F14), 'click');
  await settle();
  assert.equal(chip(el, F14).getAttribute('aria-pressed'), 'false');
  assert.equal(chip(el, F16).classList.contains('brain-is-due'), true);
  assert.deepEqual(calls, [['plan', row.target, { day: F14 }], ['plan', row.target, null]]);
  closeCard();
});

test('Next week: its any-day button plans the row for that week, and no deadline is written', async () => {
  reset();
  const { actions, calls } = recorder();
  const { row, el } = openDentist(actions);
  fire(el.querySelector('[data-go="week"]')!, 'click');   // Next week
  await settle();
  fire(el.querySelector('.brain-plan-main')!, 'click');   // Next week, any day
  await settle();
  assert.deepEqual(calls, [['plan', row.target, { week: MON19 }]]);
  closeCard();
});

test('No date yet: a row with no plan writes nothing; after a day, it clears the plan and keeps the deadline', async () => {
  reset();
  const { actions, calls } = recorder();
  const { row, el } = openDentist(actions);
  fire(el.querySelector('[data-go="later"]')!, 'click');   // Later: the scroller and No date yet
  await settle();
  fire(el.querySelector('[data-pick="none"]')!, 'click');
  await settle();
  assert.deepEqual(calls, []);
  fire(el.querySelector('[data-go="later"]')!, 'click');   // back to the days
  await settle();
  fire(chip(el, F14), 'click');
  await settle();
  fire(el.querySelector('[data-go="later"]')!, 'click');
  await settle();
  fire(el.querySelector('[data-pick="none"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['plan', row.target, { day: F14 }], ['plan', row.target, null]]);
  closeCard();
});

test('a right-click on another day moves the deadline there; on the red day it does nothing', async () => {
  reset();
  const { actions, calls } = recorder();
  const { row, el } = openDentist(actions);
  fire(chip(el, F16), 'contextmenu');   // the red day
  await settle();
  assert.deepEqual(calls, []);
  fire(chip(el, F15), 'contextmenu');
  await settle();
  assert.deepEqual(calls, [['due', row.target, F15]]);
  assert.equal(chip(el, F15).classList.contains('brain-is-due'), true);
  closeCard();
});

test('a drop of the row on a day of This week\'s board plans it for that day, and no deadline is written', () => {
  const { actions, calls } = recorder();
  const row = dentistRow();
  const vm = buildWeek(sample, TODAY) as ThisWeekVM;
  dropOnWeek(vm, actions)(taskRow(row, actions), { kind: 'day', date: F14 });
  assert.deepEqual(calls, [['plan', row.target, { day: F14 }]]);
});

test('Back up the laptop, planned or due: a drop on a day plans it, and a drop on To plan takes its plan away; its deadline stays', () => {
  const { actions, calls } = recorder();
  const week = buildWeek(sample, TODAY, { start: MON19 }) as UpcomingWeekVM;
  const laptop = week.byDay.flatMap((g) => g.rows).find((r) => r.title === 'Back up the laptop');
  if (!laptop) throw new Error('Back up the laptop is not planned or due in week 43');
  const item = h('li', 'brain-task', { 'data-key': laptop.key });
  const drop = dropOnPlan(week, actions);
  drop(item, { kind: 'day', date: F21 });
  drop(item, { kind: 'unplan' });
  assert.deepEqual(calls, [['plan', laptop.target, { day: F21 }], ['plan', laptop.target, null]]);
});

test('Done on a repeating note\'s planner card closes it: the occurrence moves the dates the card shows, so it cannot stay open', async () => {
  reset();
  const { actions, calls } = recorder();
  const { row, el } = openDentist(actions);
  fire(el.querySelector('[data-set="done"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['setState', row.target, 'done']]);
  absent(document.querySelector('.brain-popover'), 'the card is still open after Done');
});

test('a left click on a repeating note\'s red day makes it the do day too: the day stays red, and a right-click on it does nothing', async () => {
  reset();
  const { actions, calls } = recorder();
  const { row, el } = openDentist(actions);
  fire(chip(el, F16), 'click');
  await settle();
  assert.equal(chip(el, F16).getAttribute('aria-pressed'), 'true');
  assert.equal(chip(el, F16).classList.contains('brain-is-due'), true);
  fire(chip(el, F16), 'contextmenu');
  await settle();
  assert.deepEqual(calls, [['plan', row.target, { day: F16 }]]);
  closeCard();
});
