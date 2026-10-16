import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RowVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { absent, fire, recorder, rowFor, same, sampleLine, sampleNote } from '../../test/ui.ts';
import { lineRow } from '../model/rows.ts';
import { h } from './dom.ts';
import { taskRow } from './task.ts';
import { cardContext, closeCard, openCard, placeCard, rowCard } from './popover.ts';

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

test('the planner card: the any-day button, seven day chips (Mon disabled, Tue today, Sun planned), the pair and the five states', () => {
  reset();
  const { el } = openFor(energy(), recorder().actions);
  assert.equal(el.getAttribute('role'), 'dialog');
  assert.equal(el.getAttribute('data-kind'), 'task');
  assert.equal(el.getAttribute('aria-label'), 'Plan “Compare energy contracts”');
  assert.equal(el.querySelector('.brain-plan-title')?.textContent, 'Compare energy contracts');
  assert.equal(el.querySelector('.brain-plan-main')?.textContent, 'This week, any day');
  assert.equal(el.querySelector('.brain-plan-main')?.getAttribute('aria-pressed'), 'false');
  assert.equal(el.querySelector('.brain-plan-days')?.getAttribute('aria-label'), 'Days of this week');
  const chips = [...el.querySelectorAll('.brain-plan-chip')];
  assert.equal(chips.length, 7);
  assert.equal(chips[0].hasAttribute('disabled'), true);             // Mon 12 Oct, before today
  assert.equal(chips[1].classList.contains('brain-is-today'), true);  // Tue 13 Oct
  assert.equal(chips[1].getAttribute('aria-current'), 'date');
  assert.equal(chips[6].getAttribute('aria-pressed'), 'true');        // Sun 18 Oct: the do day
  assert.deepEqual([...el.querySelectorAll('.brain-plan-pair .brain-plan-go')].map((b) => b.textContent), ['Next week', 'Later']);
  assert.deepEqual([...el.querySelectorAll('.brain-state')].map((b) => [b.getAttribute('data-set'), b.getAttribute('aria-checked')]), [
    ['todo', 'true'], ['doing', 'false'], ['waiting', 'false'], ['done', 'false'], ['dropped', 'false'],
  ]);
  closeCard();
});

test('a day chip alternates do, due, do: each write takes the target the last write returned, and the card stays open', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy();
  const { el } = openFor(row, actions);
  const chip = (day: string) => el.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  fire(chip('2026-10-16'), 'click');
  await settle();
  fire(chip('2026-10-16'), 'click');
  await settle();
  fire(chip('2026-10-13'), 'click');
  await settle();
  const t1 = { ...row.target, raw: '- [ ] Compare energy contracts [scheduled:: 2026-10-16]' };
  const t2 = { ...row.target, raw: '- [ ] Compare energy contracts [due:: 2026-10-16]' };
  assert.deepEqual(calls, [
    ['plan', row.target, { day: '2026-10-16' }],
    ['due', t1, '2026-10-16'],
    ['plan', t2, { day: '2026-10-13' }],
  ]);
  same(document.querySelector('.brain-popover'), el);
  assert.equal(chip('2026-10-13').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('2026-10-16').classList.contains('brain-is-due'), true);
  closeCard();
});

test('a click on the red chip makes it the do day and removes the deadline: plan, then due null', async () => {
  reset();
  const { actions, calls } = recorder();
  const { el } = openFor(energy({ scheduled: '2026-10-13', due: '2026-10-16' }), actions);
  fire(el.querySelector('[data-day="2026-10-16"]')!, 'click');
  await settle();
  assert.deepEqual(calls.map((c) => [c[0], c[2]]), [['plan', { day: '2026-10-16' }], ['due', null]]);
  assert.equal(el.querySelector('[data-day="2026-10-16"]')?.getAttribute('aria-pressed'), 'true');
  assert.equal(el.querySelector('[data-day="2026-10-16"]')?.classList.contains('brain-is-due'), false);
  closeCard();
});

test('moving a task to next week takes the red chip away: the plan removes the deadline it leaves behind, and no due write follows', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy({ scheduled: '2026-10-13', due: '2026-10-15' });
  const { el } = openFor(row, actions);
  assert.equal(el.querySelector('[data-day="2026-10-15"]')?.classList.contains('brain-is-due'), true);
  fire(el.querySelector('[data-go="week"]')!, 'click');   // Next week
  await settle();
  fire(el.querySelector('.brain-plan-main')!, 'click');   // Next week, any day
  await settle();
  assert.deepEqual(calls, [['plan', row.target, { week: '2026-10-19' }]]);
  fire(el.querySelector('[data-go="week"]')!, 'click');   // back to This week
  await settle();
  assert.equal(el.querySelector('.brain-plan-main')?.textContent, 'This week, any day');
  absent(el.querySelector('.brain-is-due'));
  assert.equal(el.querySelector('[data-day="2026-10-15"]')?.getAttribute('aria-label'), 'Thursday 15 October');
  assert.equal(el.querySelector('[data-day="2026-10-13"]')?.getAttribute('aria-pressed'), 'false');
  closeCard();
});

test('a day in the deadline\'s own week keeps the red chip', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy({ scheduled: '2026-10-13', due: '2026-10-15' });
  const { el } = openFor(row, actions);
  fire(el.querySelector('[data-day="2026-10-17"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['plan', row.target, { day: '2026-10-17' }]]);
  assert.equal(el.querySelector('[data-day="2026-10-15"]')?.classList.contains('brain-is-due'), true);
  closeCard();
});

test('the any-day button of a week that is already planned still clears a deadline in an earlier week: the red chip goes', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy({ start: '2026-10-19', due: '2026-10-15' });
  const { el } = openFor(row, actions);
  assert.equal(el.querySelector('[data-day="2026-10-15"]')?.classList.contains('brain-is-due'), true);
  fire(el.querySelector('[data-go="week"]')!, 'click');   // Next week: its any-day button is pressed
  await settle();
  assert.equal(el.querySelector('.brain-plan-main')?.getAttribute('aria-pressed'), 'true');
  fire(el.querySelector('.brain-plan-main')!, 'click');
  await settle();
  assert.deepEqual(calls, [['plan', row.target, { week: '2026-10-19' }]]);
  assert.equal(el.querySelector('.brain-plan-main')?.getAttribute('aria-pressed'), 'true');
  fire(el.querySelector('[data-go="week"]')!, 'click');   // back to This week
  await settle();
  absent(el.querySelector('.brain-is-due'));
  closeCard();
});

test('a pressed any-day button with no deadline behind it still writes nothing', async () => {
  reset();
  const { actions, calls } = recorder();
  const { el } = openFor(energy({ start: '2026-10-19', due: '2026-10-21' }), actions);
  fire(el.querySelector('[data-go="week"]')!, 'click');
  await settle();
  fire(el.querySelector('.brain-plan-main')!, 'click');
  await settle();
  assert.deepEqual(calls, []);
  closeCard();
});

test('No date yet takes the red chip away when the deadline is this week', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy({ scheduled: '2026-10-13', due: '2026-10-15' });
  const { el } = openFor(row, actions);
  fire(el.querySelector('[data-go="later"]')!, 'click');
  await settle();
  fire(el.querySelector('[data-pick="none"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['plan', row.target, null]]);
  fire(el.querySelector('[data-go="later"]')!, 'click');   // back to the days
  await settle();
  absent(el.querySelector('.brain-is-due'));
  closeCard();
});

test('the plan controls follow the state: done, dropped and waiting take them away (their room stays), to do and doing bring them back', async () => {
  reset();
  const { actions, calls } = recorder();
  const { el } = openFor(energy(), actions);
  // The whole plan body: the any-day button, the day row (or Later's scroller) and the two buttons.
  const body = () => ['.brain-plan-main', '.brain-plan-days', '.brain-plan-pair'].map((q) => el.querySelector<HTMLElement>(q)!);
  const hidden = () => body().map((n) => n.style.getPropertyValue('visibility') === 'hidden');
  const live = () => [...el.querySelectorAll<HTMLElement>('.brain-plan-main, .brain-plan-days, .brain-plan-pair')]
    .flatMap((n) => [n, ...n.querySelectorAll<HTMLElement>('button')]).filter((n) => n.localName === 'button' && !n.hasAttribute('disabled'));
  const pick = async (state: string) => {
    fire(el.querySelector(`[data-set="${state}"]`)!, 'click');
    await settle();
  };
  assert.deepEqual(hidden(), [false, false, false]);
  const open = live().length;
  assert.equal(open, 1 + 6 + 2);   // the any-day button, six days from today, Next week and Later
  for (const state of ['done', 'dropped', 'waiting']) {
    await pick(state);
    assert.deepEqual(hidden(), [true, true, true], state);
    assert.equal(live().length, 0, state);
    assert.equal(body().every((n) => n.getAttribute('aria-hidden') === 'true'), true, state);
    // The states stay: the way back is the same row.
    assert.equal(el.querySelector(`[data-set="${state}"]`)?.getAttribute('aria-checked'), 'true');
    assert.equal(el.querySelectorAll('.brain-state:not([disabled])').length, 5);
    // Keyboard stops skip the hidden controls.
    assert.equal([...el.querySelectorAll('button:not([disabled])')].every((b) => b.classList.contains('brain-state')), true);
    // A click on a hidden control does nothing.
    fire(el.querySelector('[data-pick="week"]')!, 'click');
    await settle();
  }
  assert.deepEqual(calls.map((c) => c[0]), ['setState', 'setState', 'setState']);   // no plan write
  await pick('doing');
  assert.deepEqual(hidden(), [false, false, false]);
  assert.equal(live().length, open);
  assert.equal(body().some((n) => n.hasAttribute('aria-hidden')), false);
  await pick('done');
  await pick('todo');
  assert.deepEqual(hidden(), [false, false, false]);
  closeCard();
});

test('the plan controls of a card on Later follow the state too', async () => {
  reset();
  const { actions } = recorder();
  const { el } = openFor(energy(), actions);
  fire(el.querySelector('[data-go="later"]')!, 'click');
  await settle();
  const later = () => [...el.querySelectorAll<HTMLElement>('.brain-plan-scroll, [data-pick="none"], .brain-plan-pair')];
  assert.equal(later().length, 3);
  fire(el.querySelector('[data-set="waiting"]')!, 'click');
  await settle();
  assert.deepEqual(later().map((n) => n.style.getPropertyValue('visibility')), ['hidden', 'hidden', 'hidden']);
  closeCard();
});

test('the any-day button plans the shown week, any day, and is then pressed', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy();
  const { el } = openFor(row, actions);
  fire(el.querySelector('.brain-plan-main')!, 'click');
  await settle();
  assert.deepEqual(calls, [['plan', row.target, { week: '2026-10-12' }]]);
  assert.equal(el.querySelector('.brain-plan-main')?.getAttribute('aria-pressed'), 'true');
  closeCard();
});

// Naming follows Task 14's weekName: from a this-week card, the next week reads 'Next week'.
// Spec §4 names 'Week 43, any day' for an upcoming week, so this is an open ruling (see Task 14): change weekName and this test together.
test('Next week: from a this-week card the card plans next week, and the other button reads This week, with the back arrow; no write', async () => {
  reset();
  const { actions, calls } = recorder();
  const { el } = openFor(energy(), actions);
  fire(el.querySelector('[data-go="week"]')!, 'click');
  await settle();
  assert.equal(el.querySelector('.brain-plan-main')?.textContent, 'Next week, any day');
  assert.equal(el.querySelector('.brain-plan-days')?.getAttribute('aria-label'), 'Days of next week');
  assert.equal(el.querySelector('.brain-plan-chip')?.getAttribute('data-day'), '2026-10-19');
  assert.equal(el.querySelector('[data-go="week"]')?.textContent, 'This week');
  assert.equal(el.querySelector('[data-go="week"] path')?.getAttribute('d'), 'M13 8H3M7 3.5 2.5 8 7 12.5');
  assert.deepEqual(calls, []);
  closeCard();
});

test('Later swaps the days for a week scroller from Wk 44, the earlier arrow stays off, and No date yet records null', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy();
  const { el } = openFor(row, actions);
  fire(el.querySelector('[data-go="later"]')!, 'click');
  await settle();
  const weeks = () => [...el.querySelectorAll('.brain-plan-scroll .brain-plan-chip')].map((c) => c.querySelector('.brain-label')?.textContent);
  assert.deepEqual(weeks(), ['Wk 44', 'Wk 45', 'Wk 46']);
  assert.equal(el.querySelector('[data-step="-1"]')?.hasAttribute('disabled'), true);
  absent(el.querySelector('.brain-plan-main'));
  assert.equal(el.querySelector('[data-go="later"]')?.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(calls, []);
  fire(el.querySelector('[data-step="1"]')!, 'click');
  await settle();
  assert.deepEqual(weeks(), ['Wk 45', 'Wk 46', 'Wk 47']);
  assert.equal(el.querySelector('[data-step="-1"]')?.hasAttribute('disabled'), false);
  fire(el.querySelector('[data-pick="none"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['plan', row.target, null]]);
  closeCard();
});

test('with the Week view on an upcoming week, the card plans that week and the other week is This week', () => {
  reset();
  const { el } = openFor(energy(), recorder().actions, '2026-10-19');
  assert.equal(el.querySelector('.brain-plan-main')?.textContent, 'Week 43, any day');
  assert.equal(el.querySelector('[data-go="week"]')?.textContent, 'This week');
  closeCard();
});

test('a state click writes the state and checks it; a write that resolves to null closes the card', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy();
  const { el } = openFor(row, actions);
  fire(el.querySelector('[data-set="doing"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['setState', row.target, 'doing']]);
  assert.equal(el.querySelector('[data-set="doing"]')?.getAttribute('aria-checked'), 'true');
  assert.equal(el.querySelector('[data-set="todo"]')?.getAttribute('aria-checked'), 'false');
  closeCard();

  reset();
  const refused = { ...recorder().actions, plan: async () => null };
  const again = openFor(energy(), refused).el;
  fire(again.querySelector('[data-day="2026-10-16"]')!, 'click');
  await settle();
  absent(document.querySelector('.brain-popover'));
});

test('a card closes when the focus goes to another note, as a tab switched from the keyboard would leave it floating over that note', () => {
  reset();
  const { el } = openFor(energy(), recorder().actions);
  fire(el.querySelector('[data-set="doing"]')!, 'focusin');   // the focus moves within the card: it stays
  assert.equal(el.isConnected, true);
  const note = h('div', 'cm-editor', {}, []);
  document.body.append(note);
  fire(note, 'focusin');
  assert.equal(el.isConnected, false);
  absent(document.querySelector('.brain-popover'));
});

test('the planner card stays open after a day click and after state clicks, the state row included', async () => {
  reset();
  const { actions } = recorder();
  const { el } = openFor(energy(), actions);
  fire(el.querySelector('[data-day="2026-10-16"]')!, 'click');
  await settle();
  same(document.querySelector('.brain-popover'), el);
  fire(el.querySelector('[data-set="doing"]')!, 'click');
  await settle();
  same(document.querySelector('.brain-popover'), el);
  fire(el.querySelector('[data-set="done"]')!, 'click');   // takes the plan controls away; still open
  await settle();
  same(document.querySelector('.brain-popover'), el);
  closeCard();
});

test('a task row with no week context opens the states card', () => {
  reset();
  const actions = recorder().actions;
  const li = taskRow(energy(), actions);
  document.body.append(li);
  const el = openCard(li, AT, rowCard(energy()), actions);
  assert.equal(el.getAttribute('data-kind'), 'states');
  absent(el.querySelector('.brain-plan-main'));
  assert.equal(el.querySelectorAll('.brain-state').length, 5);
  closeCard();
});

test('an open or doing repeating row gets the planner card, as a task note does: its plan picks, then its five states, and no points', () => {
  reset();
  const path = sampleNote('Dentist checkup').path;
  const row: RowVM = {
    key: path, target: { kind: 'note', path, state: 'todo' }, title: 'Dentist checkup', state: 'todo',
    meta: [], repeating: true, draggable: false, ariaLabel: 'Dentist checkup', plan: { due: '2026-10-16' },
  };
  const rec = recorder();
  const { el } = openFor(row, rec.actions);
  assert.equal(el.getAttribute('aria-label'), 'Plan “Dentist checkup”');
  assert.equal(el.querySelectorAll('[data-set]').length, 5);
  assert.equal(el.querySelectorAll('.brain-plan-chip').length, 7);
  absent(el.querySelector('.brain-plan-points'));
  assert.deepEqual(rec.calls, []);
  closeCard();
});

test('a story card: its states write the story status (To do as open), the row\'s state is checked, and a pick closes the card', async () => {
  reset();
  const { actions, calls } = recorder();
  const path = sampleNote("Choose hosting for Sam's site").path;
  const item = h('li', 'brain-tile brain-card', { tabindex: '0', 'data-state': 'doing' });
  document.body.append(item);
  const focused: string[] = [];
  item.focus = () => { focused.push('item'); };
  const el = openCard(item, AT, { kind: 'story', title: "Choose hosting for Sam's site", path, state: 'doing' }, actions);
  assert.equal(el.getAttribute('data-kind'), 'story');
  assert.equal(el.querySelector('[data-set="doing"]')?.getAttribute('aria-checked'), 'true');
  fire(el.querySelector('[data-set="todo"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['setNoteStatus', path, 'open']]);
  assert.equal(document.querySelectorAll('.brain-popover').length, 0);
  assert.deepEqual(focused, ['item']);
});

test('a project card: five state icons with the status checked, and a pick writes setNoteStatus and closes the card', async () => {
  reset();
  const { actions, calls } = recorder();
  const path = sampleNote('Run a half marathon').path;
  const item = h('li', 'brain-tile brain-card', { tabindex: '0' });
  document.body.append(item);
  const focused: string[] = [];
  item.focus = () => { focused.push('item'); };
  const el = openCard(item, AT, { kind: 'project', title: 'Run a half marathon', path, status: 'someday' }, actions);
  assert.equal(el.querySelectorAll('.brain-state').length, 5);
  assert.equal(el.querySelectorAll('[data-state]').length, 0);
  assert.equal(el.querySelector('[data-set="someday"]')?.getAttribute('aria-checked'), 'true');
  assert.equal(el.querySelector('[data-set="someday"] svg')?.getAttribute('class'), 'brain-mark brain-state-icon');
  fire(el.querySelector('[data-set="active"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['setNoteStatus', path, 'active']]);
  assert.equal(document.querySelectorAll('.brain-popover').length, 0);
  assert.deepEqual(focused, ['item']);
  closeCard();
});

test('a states card closes after a state click, and the focus goes back to its row', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = rowFor('Fix the bike light');   // a done line: no plan, so the states card
  const li = taskRow(row, actions);
  board().append(li);
  const focused: string[] = [];
  li.focus = () => { focused.push('row'); };
  const el = openCard(li, AT, rowCard(row), actions);
  assert.equal(el.getAttribute('data-kind'), 'states');
  fire(el.querySelector('[data-set="doing"]')!, 'click');
  await settle();
  assert.deepEqual(calls, [['setState', row.target, 'doing']]);
  assert.equal(document.querySelectorAll('.brain-popover').length, 0);
  assert.deepEqual(focused, ['row']);
});

test('a states card whose write resolves to null closes without moving the focus', async () => {
  reset();
  const row = rowFor('Fix the bike light');
  const actions = { ...recorder().actions, setState: async () => null };
  const li = taskRow(row, actions);
  document.body.append(li);
  const focused: string[] = [];
  li.focus = () => { focused.push('row'); };
  const el = openCard(li, AT, rowCard(row), actions);
  fire(el.querySelector('[data-set="doing"]')!, 'click');
  await settle();
  assert.equal(document.querySelectorAll('.brain-popover').length, 0);
  assert.deepEqual(focused, []);
});

test('a done line opens the states card, with its state checked', () => {
  reset();
  const row = rowFor('Fix the bike light');
  const actions = recorder().actions;
  const li = taskRow(row, actions);
  document.body.append(li);
  const el = openCard(li, AT, rowCard(row), actions);
  assert.equal(el.getAttribute('data-kind'), 'states');
  assert.equal(el.querySelector('[data-set="done"]')?.getAttribute('aria-checked'), 'true');
  closeCard();
});

test('Tab and ArrowRight move to the next enabled button, Shift+Tab and ArrowLeft back, and the ends wrap', () => {
  reset();
  const { el } = openFor(energy(), recorder().actions);
  const stops = [...el.querySelectorAll<HTMLElement>('button:not([disabled])')];
  const log: number[] = [];
  for (const [i, b] of stops.entries()) b.focus = () => { log.push(i); };
  fire(stops[0], 'keydown', { key: 'Tab' });
  fire(stops[1], 'keydown', { key: 'ArrowRight' });
  fire(stops[0], 'keydown', { key: 'Tab', shiftKey: true });
  fire(stops[stops.length - 1], 'keydown', { key: 'ArrowDown' });
  fire(stops[2], 'keydown', { key: 'ArrowLeft' });
  fire(stops[0], 'keydown', { key: 'ArrowUp' });   // back from the first stop wraps to the last
  assert.deepEqual(log, [1, 2, stops.length - 1, 0, 1, stops.length - 1]);
  closeCard();
});

test('Escape closes the card and focuses the item again', () => {
  reset();
  const row = energy();
  const actions = recorder().actions;
  const root = board();
  const li = taskRow(row, actions);
  root.append(li);
  const focused: string[] = [];
  li.focus = () => { focused.push('item'); };
  const el = openCard(li, AT, rowCard(row), actions);
  fire(el.querySelector('[data-day="2026-10-16"]')!, 'keydown', { key: 'Escape' });
  absent(document.querySelector('.brain-popover'));
  assert.deepEqual(focused, ['item']);
});

test('Escape closes the card and stops there: a list modal beneath it is not closed as well', () => {
  reset();
  const { el } = openFor(energy(), recorder().actions);
  let reached = false;
  const seen = () => { reached = true; };
  document.body.addEventListener('keydown', seen);
  fire(el, 'keydown', { key: 'Escape' });
  document.body.removeEventListener('keydown', seen);
  assert.equal(reached, false);
  absent(document.querySelector('.brain-popover'));
});

test('a pointerdown outside the card closes it; one inside keeps it open', () => {
  reset();
  const { el } = openFor(energy(), recorder().actions);
  fire(el.querySelector('[data-day="2026-10-16"]')!, 'pointerdown');
  same(document.querySelector('.brain-popover'), el);
  fire(document.body, 'pointerdown');
  absent(document.querySelector('.brain-popover'));
});

test('closeCard says whether it closed a card, and opening a second card closes the first', () => {
  reset();
  const actions = recorder().actions;
  const first = openFor(energy(), actions).el;
  const second = openFor(energy(), actions).el;
  assert.equal(document.querySelectorAll('.brain-popover').length, 1);
  same(document.querySelector('.brain-popover'), second);
  absent(first.parentNode);
  assert.equal(closeCard(), true);
  assert.equal(closeCard(), false);
  absent(document.querySelector('.brain-popover'));
});

test('a card whose container has gone is not open: closeCard says so, and the next close is a no-op', () => {
  reset();
  const modal = h('div', 'modal-container');
  document.body.append(modal);
  const actions = recorder().actions;
  const li = taskRow(energy(), actions);
  modal.append(li);
  openCard(li, AT, rowCard(energy()), actions);
  modal.remove();
  assert.equal(closeCard(), false);
  assert.equal(closeCard(), false);
});

test('inside a .modal-container the card is appended to the container, not the body', () => {
  reset();
  const modal = h('div', 'modal-container');
  document.body.append(modal);
  const actions = recorder().actions;
  const li = taskRow(energy(), actions);
  modal.append(li);
  const el = openCard(li, AT, rowCard(energy()), actions);
  same(el.parentNode, modal);
  closeCard();
});

test('placeCard: below the anchor when it fits, above when not, pinned to the bottom when neither, and clamped on both sides', () => {
  const view = { w: 400, h: 300 };
  const size = { w: 200, h: 100 };
  assert.deepEqual(placeCard({ left: 10, top: 100, right: 60, bottom: 120 }, size, view), { left: 10, top: 124 });
  assert.deepEqual(placeCard({ left: 10, top: 250, right: 60, bottom: 270 }, size, view), { left: 10, top: 146 });
  assert.deepEqual(placeCard({ left: 10, top: 20, right: 60, bottom: 40 }, { w: 200, h: 290 }, view), { left: 10, top: 8 });
  assert.deepEqual(placeCard({ left: 380, top: 100, right: 430, bottom: 120 }, size, view), { left: 192, top: 124 });
  assert.deepEqual(placeCard({ left: -50, top: 100, right: -5, bottom: 120 }, size, view), { left: 8, top: 124 });
});

test('cardContext reads today and the shown week from the nearest [data-today]; none outside one', () => {
  reset();
  const root = board('2026-10-19');
  const li = h('li', 'brain-task');
  root.append(li);
  assert.deepEqual(cardContext(li), { today: '2026-10-13', shown: '2026-10-19' });
  assert.deepEqual(cardContext(board()), { today: '2026-10-13' });
  const loose = h('li', 'brain-task');
  document.body.append(loose);
  assert.equal(cardContext(loose), undefined);
});

test('rowCard: an open or doing repeating row gets the planner card; a waiting, done or dropped one the states card; a story row the story card, anything else the states card', () => {
  const base = rowFor('Fix the bike light');
  const repeating = { ...base, repeating: true };
  // A row's plan is set only while its note is open or doing (rows.ts), so these rows carry none when they are waiting, done or dropped.
  for (const state of ['todo', 'doing'] as const) assert.equal(rowCard({ ...repeating, state, plan: { due: '2026-10-16' } }).kind, 'task');
  for (const state of ['waiting', 'done', 'dropped'] as const) assert.equal(rowCard({ ...repeating, state }).kind, 'states');
  assert.equal(rowCard({ ...base, progress: { done: 1, total: 3 } }).kind, 'story');
  assert.equal(rowCard(energy()).kind, 'task');
  assert.equal(rowCard(base).kind, 'states');
});

test('a waiting line has no plan, so it gets the states card and no planning drop', () => {
  const waiting = lineRow(sampleLine('Get photos from Sam'), sampleNote('Website for Sam'), '2026-10-13', { draggable: true });
  assert.equal(waiting.state, 'waiting');
  assert.equal('plan' in waiting, false);
  assert.equal(rowCard(waiting).kind, 'states');
  assert.equal(taskRow(waiting, recorder().actions).hasAttribute('data-plannable'), false);
});

/** Runs `run` with every card's height read from its content: 300px drawn, 14px empty (the empty box a browser measures). */
function withCardHeights(run: () => void): void {
  const proto = Object.getPrototypeOf(document.createElement('div'));
  const before = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains('brain-popover')) return 0;
      return this.children.length > 0 ? 300 : 14;
    },
  });
  try {
    run();
  } finally {
    if (before) Object.defineProperty(proto, 'offsetHeight', before);
    else delete (proto as { offsetHeight?: number }).offsetHeight;
  }
}

test('the card is painted before it is placed: a row near the bottom of the view gets its card above it', () => {
  reset();
  withCardHeights(() => {
    const root = board();
    const row = energy();
    const actions = recorder().actions;
    const li = taskRow(row, actions);
    li.getBoundingClientRect = () => ({ left: 40, top: 700, right: 200, bottom: 720, width: 160, height: 20 }) as DOMRect;
    root.append(li);
    const el = openCard(li, AT, rowCard(row), actions);
    // The view is 768 high here: a 300px card does not fit under a row that ends at 720, so it goes above the row (700 - 300 - 4).
    assert.equal(el.style.getPropertyValue('top'), '396px');
    closeCard();
  });
});

test('Escape after a pick and a re-render puts the focus on the new row with the same key', async () => {
  reset();
  const { actions } = recorder();
  const root = board();
  const row = energy();
  const li = taskRow(row, actions);
  root.append(li);
  const el = openCard(li, AT, rowCard(row), actions);
  fire(el.querySelector('[data-day="2026-10-16"]')!, 'click');
  await settle();
  // The view draws again: the row is a new element with the same key, and the old one has left the tree.
  const fresh = taskRow(row, actions);
  const focused: string[] = [];
  fresh.focus = () => { focused.push(fresh.getAttribute('data-key') ?? ''); };
  root.replaceChildren(fresh);
  fire(el, 'keydown', { key: 'Escape' });
  assert.deepEqual(focused, [row.key]);
  absent(document.querySelector('.brain-popover'));
});

test('three clicks with no await between them write in order, each on the target the last write returned', async () => {
  reset();
  const { actions, calls } = recorder();
  const row = energy();
  const { el } = openFor(row, actions);
  const chip = (day: string) => el.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  fire(chip('2026-10-16'), 'click');
  fire(chip('2026-10-16'), 'click');
  fire(chip('2026-10-13'), 'click');
  await settle();
  const t1 = { ...row.target, raw: '- [ ] Compare energy contracts [scheduled:: 2026-10-16]' };
  const t2 = { ...row.target, raw: '- [ ] Compare energy contracts [due:: 2026-10-16]' };
  assert.deepEqual(calls, [
    ['plan', row.target, { day: '2026-10-16' }],
    ['due', t1, '2026-10-16'],
    ['plan', t2, { day: '2026-10-13' }],
  ]);
  same(document.querySelector('.brain-popover'), el);
  closeCard();
});

test('a write that throws is logged, not swallowed, and closes the card', async (t) => {
  reset();
  const logged = t.mock.method(console, 'error', () => {});
  const boom = new Error('the vault refused the write');
  const actions = { ...recorder().actions, plan: async () => { throw boom; } };
  const el = openFor(energy(), actions).el;
  fire(el.querySelector('[data-day="2026-10-16"]')!, 'click');
  await settle();
  assert.equal(logged.mock.calls.length, 1);
  assert.equal(logged.mock.calls[0].arguments[0], boom);
  absent(document.querySelector('.brain-popover'));
});

test('a held Enter on a day chip is cancelled, as the check button cancels it; a first Enter is not', () => {
  reset();
  const { actions, calls } = recorder();
  const { el } = openFor(energy(), actions);
  const chip = el.querySelector<HTMLElement>('[data-day="2026-10-16"]')!;
  assert.equal(fire(chip, 'keydown', { key: 'Enter' }).defaultPrevented, false);
  assert.equal(fire(chip, 'keydown', { key: 'Enter', repeat: true }).defaultPrevented, true);
  assert.deepEqual(calls, []);
  closeCard();
});
