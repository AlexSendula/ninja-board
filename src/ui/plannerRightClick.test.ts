import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RowVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { fire, recorder, rowFor, same } from '../../test/ui.ts';
import { h } from './dom.ts';
import { taskRow } from './task.ts';
import { closeCard, openCard, rowCard } from './popover.ts';

const AT = { x: 40, y: 48 };
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Closes any card and empties the body, so each test starts with no card on the page. */
function reset(): void {
  closeCard();
  for (const node of [...document.body.children]) node.remove();
}

/** A root the way BrainView draws it: today, and the week shown when it is an upcoming one. */
function board(week?: string): HTMLElement {
  const root = h('div', 'brain-view');
  root.dataset.today = '2026-10-13';
  if (week !== undefined) root.dataset.week = week;
  document.body.append(root);
  return root;
}

/** Compare energy contracts (Money.md line 7): open, and by default scheduled for Sun 18 Oct. */
function energy(plan: RowVM['plan'] = { scheduled: '2026-10-18' }): RowVM {
  return rowFor('Compare energy contracts', { plan, draggable: true });
}

/** A row on a board, with its planner card opened at the row. */
function openFor(row: RowVM, actions: Actions, week?: string) {
  const root = board(week);
  const li = taskRow(row, actions);
  root.append(li);
  return { li, el: openCard(li, AT, rowCard(row), actions) };
}

test('a right-click on a day sets the deadline there and keeps the do day', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy();
  const { el } = openFor(row, actions);
  const chip = (day: string) => el.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  const event = fire(chip('2026-10-16'), 'contextmenu', { clientX: 40, clientY: 48 });
  await settle();
  assert.deepEqual(calls, [['due', row.target, '2026-10-16']]);
  assert.equal(chip('2026-10-18').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('2026-10-16').classList.contains('brain-is-due'), true);
  same(document.querySelector('.brain-popover'), el);
  assert.equal(event.defaultPrevented, true);
  closeCard();
});

test('a right-click on the red day removes the deadline and keeps the do day', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy({ scheduled: '2026-10-18', due: '2026-10-16' });
  const { el } = openFor(row, actions);
  const chip = (day: string) => el.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  fire(chip('2026-10-16'), 'contextmenu', { clientX: 40, clientY: 48 });
  await settle();
  assert.deepEqual(calls.map((c) => [c[0], c[2]]), [['due', null]]);
  assert.deepEqual(calls.map((c) => c[1]), [row.target]);
  assert.equal(chip('2026-10-18').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('2026-10-16').classList.contains('brain-is-due'), false);
  closeCard();
});

test('a right-click on the do day makes it the deadline, as a second click does', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy();
  const { el } = openFor(row, actions);
  const chip = (day: string) => el.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  fire(chip('2026-10-18'), 'contextmenu', { clientX: 40, clientY: 48 });
  await settle();
  assert.deepEqual(calls, [['due', row.target, '2026-10-18']]);
  assert.equal(chip('2026-10-18').classList.contains('brain-is-due'), true);
  assert.equal(chip('2026-10-18').getAttribute('aria-pressed'), 'false');
  closeCard();
});

test('a right-click on a day that is both the do day and the deadline makes it the deadline only: it is drawn as the do day, not red', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy({ scheduled: '2026-10-16', due: '2026-10-16' });
  const { el } = openFor(row, actions);
  const chip = (day: string) => el.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  assert.equal(chip('2026-10-16').getAttribute('aria-pressed'), 'true');
  fire(chip('2026-10-16'), 'contextmenu', { clientX: 40, clientY: 48 });
  await settle();
  assert.deepEqual(calls.map((c) => [c[0], c[2]]), [['due', '2026-10-16']]);
  closeCard();
});

test('a right-click on a past day writes nothing', async () => {
  reset();
  const { actions, calls } = recorder();
  const { el } = openFor(energy(), actions);
  const event = fire(el.querySelector<HTMLElement>('[data-day="2026-10-12"]')!, 'contextmenu', { clientX: 40, clientY: 48 });
  await settle();
  assert.deepEqual(calls, []);
  assert.equal(event.defaultPrevented, true);
  closeCard();
});
