import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MetaPart, RowVM } from '../model/types.ts';
import { absent, fire, recorder, rowFor, same, sampleLine, sampleNote } from '../../test/ui.ts';
import { enableDrag } from './drag.ts';
import { h } from './dom.ts';
import { closeCard } from './popover.ts';
import { taskRow } from './task.ts';
import { META_BREAK, noteRow } from '../model/rows.ts';

// Rows as the mockup draws them (Today view, lines 534–567; Week board, 678–705).
const header = () => rowFor('Build the homepage header', {
  meta: [{ text: 'Website for Sam' }],
  ariaLabel: 'Build the homepage header, in progress',
});
// Due 2026-10-10, three days before 2026-10-13. On the Week board, so draggable.
const physio = () => rowFor('Book a physio session', {
  meta: [{ text: 'Health' }, { text: '3 days overdue', tone: 'overdue' }],
  ariaLabel: 'Book a physio session, 3 days overdue',
  draggable: true,
});
// Dentist checkup (due 2026-10-16, a Friday; repeats every 6 months): a note row, ticked like any row.
const dentist = (meta: MetaPart[]): RowVM => {
  const path = sampleNote('Dentist checkup').path;
  return { key: path, target: { kind: 'note', path, state: 'todo' }, title: 'Dentist checkup', state: 'todo', meta, repeating: true, draggable: false, ariaLabel: 'Dentist checkup' };
};

test('a doing row: li, check button and stretched title, as in the mockup', () => {
  const row = header();
  const li = taskRow(row, recorder().actions);
  assert.equal(li.className, 'brain-task');
  assert.equal(li.getAttribute('data-state'), 'doing');
  assert.equal(li.getAttribute('tabindex'), '0');
  assert.equal(li.getAttribute('data-key'), row.key);

  const check = li.children[0];
  assert.equal(check.tagName, 'BUTTON');
  assert.equal(check.className, 'brain-lead brain-check');
  assert.equal(check.getAttribute('role'), 'checkbox');
  assert.equal(check.getAttribute('aria-checked'), 'mixed');
  assert.equal(check.getAttribute('aria-label'), 'Build the homepage header, in progress');
  assert.equal(check.querySelector('.brain-mark-tick') !== null, true);

  const body = li.children[1];
  assert.equal(body.className, 'brain-task-body');
  const title = body.children[0];
  assert.equal(title.tagName, 'A');
  assert.equal(title.className, 'brain-task-text brain-link brain-stretch');
  assert.equal(title.getAttribute('href'), '#');
  assert.equal(title.getAttribute('tabindex'), '-1');
  assert.equal(title.textContent, 'Build the homepage header');
  assert.equal(body.children[1].tagName, 'P');
  assert.equal(body.children[1].className, 'brain-meta');
  absent(li.querySelector('[draggable]'));   // not on a board
});

test('aria-checked: true when done, false for to do, waiting and dropped', () => {
  const { actions } = recorder();
  const checked = (row: RowVM) => taskRow(row, actions).querySelector('.brain-check')?.getAttribute('aria-checked');
  assert.equal(checked(rowFor('Pick design B with Sam')), 'true');
  assert.equal(checked(rowFor('Clean the gutters')), 'false');
  assert.equal(checked(rowFor('Get the written quote from Bram')), 'false');
  // The state sheet's dropped row (mockup line 1095).
  const dropped = taskRow(rowFor('Check passport expiry dates', { state: 'dropped' }), actions);
  assert.equal(dropped.getAttribute('data-state'), 'dropped');
  assert.equal(dropped.querySelector('.brain-check')?.getAttribute('aria-checked'), 'false');
});

test('meta: the row\'s own note is a link, tones become classes, the rest are spans', () => {
  const { actions } = recorder();
  const parts = (row: RowVM) => [...taskRow(row, actions).querySelector('.brain-meta')!.children]
    .map((el) => [el.tagName, el.className, el.textContent]);
  assert.deepEqual(parts(physio()), [['A', 'brain-link', 'Health'], ['SPAN', 'brain-overdue', '3 days overdue']]);
  // Clean the gutters is planned 2026-10-15: "Planned Thu".
  assert.deepEqual(parts(rowFor('Clean the gutters', { meta: [{ text: 'Home' }, { text: 'Planned Thu', when: 'plan' }] })),
    [['A', 'brain-link', 'Home'], ['SPAN', '', 'Planned Thu']]);
  // The state sheet's passed chase (mockup line 1086).
  const late = rowFor('Get the written quote from Bram', {
    meta: [{ text: 'Choose a contractor' }, { text: 'Chase yesterday', tone: 'late' }],
  });
  assert.deepEqual(parts(late), [['A', 'brain-link', 'Choose a contractor'], ['SPAN', 'brain-late', 'Chase yesterday']]);
});

test('meta: a part with a when draws data-when on its span, with or without a tone', () => {
  const { actions } = recorder();
  const spans = (row: RowVM) => [...taskRow(row, actions).querySelector('.brain-meta')!.children]
    .map((el) => [el.tagName, el.className, el.getAttribute('data-when'), el.textContent]);
  assert.deepEqual(spans(rowFor('Book a physio session', {
    meta: [{ text: 'Health' }, { text: '3 days overdue', tone: 'overdue', when: 'due' }],
  })), [['A', 'brain-link', null, 'Health'], ['SPAN', 'brain-overdue', 'due', '3 days overdue']]);
  assert.deepEqual(spans(rowFor('Clean the gutters', { meta: [{ text: 'Home' }, { text: 'Planned Thu', when: 'plan' }] })),
    [['A', 'brain-link', null, 'Home'], ['SPAN', '', 'plan', 'Planned Thu']]);
});

test('meta lines: a row with no meta has no meta line; an empty line around META_BREAK is left out', () => {
  const { actions } = recorder();
  const lines = (row: RowVM) => {
    const li = taskRow(row, actions);
    assert.doesNotMatch(li.textContent ?? '', /\n/);   // the break itself is never drawn
    return [...li.querySelectorAll('.brain-meta')].map((p) => [...p.children].map((s) => s.textContent));
  };
  assert.deepEqual(lines(rowFor('Clean the gutters')), []);
  // A repeating note with neither area nor date: its first line would be empty.
  assert.deepEqual(lines(dentist([{ text: META_BREAK }, { text: 'Every 6 months' }])), [['Every 6 months']]);
  assert.deepEqual(lines(dentist([{ text: 'Health' }, { text: 'Due Fri' }, { text: META_BREAK }])), [['Health', 'Due Fri']]);
  assert.deepEqual(lines(dentist([{ text: META_BREAK }])), []);
});

test('clicking the check toggles the row\'s target', () => {
  const { actions, calls } = recorder();
  const row = physio();
  fire(taskRow(row, actions).querySelector('.brain-check')!, 'click');
  assert.deepEqual(calls, [['toggle', row.target]]);
});

test('keys on the row: Space toggles and Enter opens at the line; keys on the button are left alone', () => {
  const { actions, calls } = recorder();
  const row = physio();
  const { path, line } = sampleLine('Book a physio session');
  const li = taskRow(row, actions);
  const space = fire(li, 'keydown', { key: ' ' });
  const enter = fire(li, 'keydown', { key: 'Enter' });
  fire(li.querySelector('.brain-check')!, 'keydown', { key: ' ' });
  assert.deepEqual(calls, [['toggle', row.target], ['open', path, line]]);
  assert.equal(space.defaultPrevented, true);
  assert.equal(enter.defaultPrevented, true);
});

test('a held key repeats nothing: Space toggles once, Enter opens once', () => {
  const { actions, calls } = recorder();
  const row = physio();
  const { path, line } = sampleLine('Book a physio session');
  const li = taskRow(row, actions);
  fire(li, 'keydown', { key: ' ' });
  const heldSpace = fire(li, 'keydown', { key: ' ', repeat: true });
  fire(li, 'keydown', { key: 'Enter' });
  fire(li, 'keydown', { key: 'Enter', repeat: true });
  assert.deepEqual(calls, [['toggle', row.target], ['open', path, line]]);
  assert.equal(heldSpace.defaultPrevented, true);   // a held Space must not scroll the page either
});

test('a held Enter on the check button acts once, as a held Space does', () => {
  const check = taskRow(physio(), recorder().actions).querySelector<HTMLElement>('.brain-check')!;
  // A button clicks on every Enter keydown, repeats included; Space clicks once, on release.
  assert.equal(fire(check, 'keydown', { key: 'Enter' }).defaultPrevented, false);
  assert.equal(fire(check, 'keydown', { key: 'Enter', repeat: true }).defaultPrevented, true);
  assert.equal(fire(check, 'keydown', { key: ' ', repeat: true }).defaultPrevented, false);
});

test('the title opens the line; the meta link opens the note', () => {
  const { actions, calls } = recorder();
  const { path, line } = sampleLine('Book a physio session');
  const li = taskRow(physio(), actions);
  const click = fire(li.querySelector('.brain-task-text')!, 'click');
  fire(li.querySelector('.brain-meta a')!, 'click');
  assert.deepEqual(calls, [['open', path, line], ['open', path, undefined]]);
  assert.equal(click.defaultPrevented, true);
});

test('a repeating row is ticked like any row, with its repeat on a line of its own', () => {
  const { actions, calls } = recorder();
  const path = sampleNote('Dentist checkup').path;
  // Due 2026-10-16, a Friday; repeats every 6 months (mockup line 1264).
  const row = dentist([{ text: 'Health' }, { text: 'Due Fri' }, { text: META_BREAK }, { text: 'Every 6 months' }]);
  const li = taskRow(row, actions);
  const check = li.querySelector<HTMLButtonElement>('button.brain-check');
  assert.equal(check?.getAttribute('role'), 'checkbox');
  assert.equal(li.getAttribute('data-state'), 'todo');
  assert.equal(li.getAttribute('data-repeat'), '');
  assert.equal(li.getAttribute('tabindex'), '0');
  assert.equal(li.getAttribute('data-key'), path);
  absent(li.querySelector('.brain-repeat'));
  const title = li.querySelector('.brain-task-text')!;
  assert.equal(title.getAttribute('tabindex'), '-1');   // the row is the focus stop, not its link
  assert.deepEqual([...li.querySelectorAll('.brain-meta')].map((p) => [...p.children].map((s) => s.textContent)),
    [['Health', 'Due Fri'], ['Every 6 months']]);
  check?.click();
  assert.deepEqual(calls, [['toggle', row.target]]);
  fire(title, 'contextmenu');
  closeCard();
  fire(title, 'click');
  assert.deepEqual(calls.slice(1), [['open', path, undefined]]);
});

test('a completed occurrence in Done: the repeat mark and no check; Enter opens its note, Space does nothing', () => {
  const { actions, calls } = recorder();
  const path = sampleNote('Dentist checkup').path;
  const occurrence: RowVM = {
    key: `${path}@2026-10-20`, target: { kind: 'note', path, state: 'done' }, title: 'Dentist checkup', state: 'done',
    meta: [{ text: 'Health' }, { text: 'Done Tue' }], repeating: true, occurrence: true, draggable: false, ariaLabel: 'Dentist checkup',
  };
  const li = taskRow(occurrence, actions);
  absent(li.querySelector('button'));
  assert.equal(li.getAttribute('data-state'), 'done');
  assert.equal(li.querySelector('.brain-lead')?.className, 'brain-lead brain-repeat');
  assert.equal(li.querySelector('.brain-mark-dot') !== null, true);
  fire(li, 'keydown', { key: ' ' });
  fire(li, 'keydown', { key: 'ContextMenu' });
  absent(document.querySelector('.brain-popover'));
  fire(li, 'keydown', { key: 'Enter' });
  assert.deepEqual(calls, [['open', path, undefined]]);
});

test('a non-repeating task note (an area\'s, on the Week board): a tickable row on the note target, never draggable', () => {
  const { actions, calls } = recorder();
  // Dentist checkup without its repeat: the model gives it a note target and draggable false.
  const note = { ...sampleNote('Dentist checkup'), repeat: undefined };
  const row = noteRow(note, '2026-10-13');
  assert.deepEqual(row.target, { kind: 'note', path: note.path, state: 'todo' });
  const li = taskRow(row, actions);
  assert.equal(li.className, 'brain-task');
  assert.equal(li.getAttribute('data-state'), 'todo');
  assert.equal(li.getAttribute('data-key'), note.path);
  assert.equal(li.querySelector('[draggable]')?.outerHTML, undefined);

  fire(li.querySelector('.brain-check')!, 'click');
  fire(li, 'keydown', { key: ' ' });
  fire(li.querySelector('.brain-task-text')!, 'click');
  fire(li.querySelector('.brain-task-text')!, 'contextmenu', { clientX: 40, clientY: 48 });
  assert.deepEqual(calls, [
    ['toggle', row.target],
    ['toggle', row.target],
    ['open', note.path, undefined],
  ]);
  // No week is shown in this test, so the planner card falls back to the states card.
  assert.equal(document.querySelector('.brain-popover')?.getAttribute('data-kind'), 'states');
  closeCard();
});

test('right-click opens the states card of a row Brain does not plan, with its state checked; a pick sets the state', async () => {
  const { actions, calls } = recorder();
  const row = physio();
  const li = taskRow(row, actions);
  document.body.append(li);
  const e = fire(li.querySelector('.brain-task-text')!, 'contextmenu', { clientX: 40, clientY: 48 });
  assert.equal(e.defaultPrevented, true);
  const card = document.querySelector('.brain-popover')!;
  assert.equal(card.getAttribute('data-kind'), 'states');
  assert.equal(card.querySelector('[data-set="todo"]')?.getAttribute('aria-checked'), 'true');
  fire(card.querySelector('[data-set="doing"]')!, 'click');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [['setState', row.target, 'doing']]);
  closeCard();
});

test('Shift+F10 opens the card under the row, and the contextmenu event that follows does not reopen it', () => {
  const { actions } = recorder();
  const li = taskRow(header(), actions);
  document.body.append(li);
  // linkedom has no layout, so the row's rect is all zeros: the card goes 24px in and 4px below.
  fire(li, 'keydown', { key: 'F10', shiftKey: true });
  const first = document.querySelector('.brain-popover');
  assert.equal(first?.getAttribute('data-kind'), 'states');
  fire(li, 'contextmenu', { clientX: 0, clientY: 0 });
  same(document.querySelector('.brain-popover'), first);
  closeCard();
});

test('only Shift+F10 and the ContextMenu key open the card: Shift+Tab, a bare Shift and a bare F10 open none and are not swallowed', () => {
  const li = taskRow(header(), recorder().actions);
  document.body.append(li);
  for (const fields of [{ key: 'Tab', shiftKey: true }, { key: 'Shift', shiftKey: true }, { key: 'F10' }]) {
    assert.equal(fire(li, 'keydown', fields).defaultPrevented, false, JSON.stringify(fields));
    absent(document.querySelector('.brain-popover'));
  }
  li.remove();
});

test('the menu key on one row does not swallow a right-click on another', () => {
  const { actions } = recorder();
  const a = taskRow(header(), actions);
  const b = taskRow(physio(), actions);
  document.body.append(a, b);
  fire(a, 'keydown', { key: 'ContextMenu' });
  fire(b, 'contextmenu', { clientX: 40, clientY: 48 });
  assert.equal(document.querySelector('.brain-popover')?.getAttribute('aria-label'), 'State of “Book a physio session”');
  closeCard();
});

test('a touch long-press of 500ms opens the card; moving 4px first cancels it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { actions } = recorder();
  const li = taskRow(header(), actions);
  document.body.append(li);
  const title = li.querySelector('.brain-task-text')!;
  const touch = (x: number, y: number) => ({ pointerId: 1, pointerType: 'touch', button: 0, clientX: x, clientY: y });

  fire(title, 'pointerdown', touch(40, 48));
  t.mock.timers.tick(499);
  absent(document.querySelector('.brain-popover'));
  t.mock.timers.tick(1);
  assert.equal(document.querySelector('.brain-popover')?.getAttribute('data-kind'), 'states');
  fire(title, 'pointerup', touch(40, 48));
  closeCard();

  fire(title, 'pointerdown', touch(40, 48));
  fire(title, 'pointermove', touch(40, 52));
  t.mock.timers.tick(500);
  absent(document.querySelector('.brain-popover'));
});

const touchAt = (x: number, y: number) => ({ pointerId: 1, pointerType: 'touch', button: 0, clientX: x, clientY: y });

test('a touch long-press on the check opens no card: the button is the check, not the row', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const li = taskRow(header(), recorder().actions);
  document.body.append(li);
  fire(li.querySelector('.brain-check')!, 'pointerdown', touchAt(40, 48));
  t.mock.timers.tick(500);
  absent(document.querySelector('.brain-popover'));
  li.remove();
});

test('a touch long-press on a draggable row is left to drag.ts: the row lifts, and the card opens once, on the release', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const li = taskRow(rowFor('Clean the gutters', { draggable: true }), recorder().actions);
  const board = h('div', 'brain-board', {}, [h('ul', 'brain-col-items', {}, [li])]);
  document.body.append(board);
  board.setPointerCapture = () => {};
  enableDrag(board, () => {});
  fire(li.querySelector('.brain-task-text')!, 'pointerdown', touchAt(40, 48));
  t.mock.timers.tick(500);
  assert.equal(li.classList.contains('brain-is-lifted'), true);
  absent(document.querySelector('.brain-popover'));   // the row's own timer does not also open the card
  fire(board, 'pointerup', touchAt(40, 48));
  assert.equal(document.querySelectorAll('.brain-popover').length, 1);
  closeCard();
  board.remove();
});

test('the click after a long-press is swallowed once: the note does not open, and the next click does', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const li = taskRow(header(), recorder().actions);
  document.body.append(li);
  fire(li.querySelector('.brain-task-text')!, 'pointerdown', touchAt(40, 48));
  t.mock.timers.tick(500);
  fire(li.querySelector('.brain-task-text')!, 'pointerup', touchAt(40, 48));
  // A click on the row itself, which has no click handler of its own: defaultPrevented shows the swallowing (the click's
  // capture listener on the row stops it before the title's link would open the note).
  assert.equal(fire(li, 'click').defaultPrevented, true);
  assert.equal(fire(li, 'click').defaultPrevented, false);
  closeCard();
  li.remove();
});

test('a draggable row gets brain-draggable, and none of its links starts a native drag', () => {
  const li = taskRow(physio(), recorder().actions);
  assert.equal(li.className, 'brain-task brain-draggable');
  assert.deepEqual([...li.querySelectorAll('a')].map((a) => a.getAttribute('draggable')), ['false', 'false']);
});

test('an open repeating row is a focus stop: Enter opens its note, Space ticks it, and the menu key opens its planner card', () => {
  const { actions, calls } = recorder();
  const path = sampleNote('Dentist checkup').path;
  // An open repeating row carries a plan (rows.ts gives every open or doing note one), and it sits on a board with today.
  const row = { ...dentist([{ text: 'Health' }]), plan: { due: '2026-10-16' } };
  const board = h('div', 'brain-view');
  board.dataset.today = '2026-10-13';
  document.body.append(board);
  const li = taskRow(row, actions);
  board.append(li);
  fire(li, 'keydown', { key: 'ContextMenu' });
  assert.equal(document.querySelector('.brain-popover')?.getAttribute('data-kind'), 'task');
  closeCard();
  assert.deepEqual(calls, []);
  fire(li, 'keydown', { key: ' ' });
  assert.deepEqual(calls, [['toggle', row.target]]);
  fire(li, 'keydown', { key: 'Enter' });
  assert.deepEqual(calls, [['toggle', row.target], ['open', path, undefined]]);
  board.remove();
});

test('a repeating row on the board drags like the others, and is plannable like any task note', () => {
  const li = taskRow({ ...dentist([{ text: 'Health' }]), draggable: true, plan: { due: '2026-10-16' } }, recorder().actions);
  assert.equal(li.className, 'brain-task brain-draggable');
  assert.equal(li.hasAttribute('data-plannable'), true);
});

test('data-plannable follows row.plan: a row Brain may plan carries it, a row without a plan does not', () => {
  assert.equal(taskRow(rowFor('Clean the gutters', { plan: {} }), recorder().actions).hasAttribute('data-plannable'), true);
  assert.equal(taskRow(rowFor('Clean the gutters'), recorder().actions).hasAttribute('data-plannable'), false);
});

test('a story as a row: its ring leads in place of the check, its count ends the row, and Space and Enter act as on a story card', () => {
  const { actions, calls } = recorder();
  // Choose hosting for Sam's site, a doing story with 1 of its 3 lines done, as week 43's Planned or due shows it.
  const row: RowVM = { ...noteRow(sampleNote("Choose hosting for Sam's site"), '2026-10-13'), progress: { done: 1, total: 3 }, draggable: false };
  const li = taskRow(row, actions);
  assert.equal(li.className, 'brain-task');
  assert.deepEqual([li.getAttribute('data-state'), li.getAttribute('data-story'), li.getAttribute('tabindex'), li.getAttribute('data-key')], ['doing', '', '0', row.key]);
  assert.deepEqual([...li.children].map((c) => [c.tagName, c.className]), [['SPAN', 'brain-lead'], ['DIV', 'brain-task-body'], ['SPAN', 'brain-aside']]);
  assert.equal(li.querySelectorAll('button').length, 0);
  assert.equal(li.children[0].querySelector(':scope > svg.brain-ring')?.getAttribute('aria-label'), '1 of 3 done');
  assert.deepEqual([li.children[2].getAttribute('aria-hidden'), li.children[2].textContent], ['true', '1/3']);
  fire(li, 'keydown', { key: ' ' });
  fire(li, 'keydown', { key: 'Enter' });
  assert.deepEqual(calls, [
    ['setNoteStatus', row.target.path, 'done'],
    ['open', row.target.path, undefined],
  ]);
  // Right-click opens the story card, and Escape closes it.
  fire(li.querySelector('.brain-task-text')!, 'contextmenu', { clientX: 40, clientY: 48 });
  assert.equal(document.querySelector('.brain-popover')?.getAttribute('data-kind'), 'story');
  fire(document.querySelector('.brain-popover')!, 'keydown', { key: 'Escape' });
  absent(document.querySelector('.brain-popover'));
});
