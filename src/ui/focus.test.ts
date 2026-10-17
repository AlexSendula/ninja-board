import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { h, link } from './dom.ts';
import { focusedKey, markKeyboardFocus, pagerFocus, refocus, refocusPager, returnFocus } from './focus.ts';
import { renderWeek } from './week.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample } from '../../test/sample.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42

/** Records the focus() calls on these elements, by name. linkedom has no focus state. */
function spy(els: Record<string, HTMLElement>) {
  const calls: Array<[string, unknown]> = [];
  for (const [name, el] of Object.entries(els)) el.focus = (options) => void calls.push([name, options]);
  return calls;
}

test('refocus gives a keyed element with a tabindex focus itself, without scrolling', () => {
  const inner = link('Ring the dentist', 'brain-task-text', () => {});
  inner.setAttribute('tabindex', '-1');   // the row is the focus stop, as in task.ts
  const row = h('li', 'brain-task', { tabindex: '0', 'data-key': 'Health/Dentist checkup.md' }, [inner]);
  const calls = spy({ row, inner });
  refocus(h('ul', undefined, {}, [row]), 'Health/Dentist checkup.md');
  assert.deepEqual(calls, [['row', { preventScroll: true }]]);
});

test('refocus hands focus to the link in a keyed element that is not a focus stop', () => {
  const inner = link('Plan the trip', 'brain-task-text', () => {});
  const row = h('li', 'brain-task', { 'data-key': "00 Inbox/Choose hosting for Sam's site.md" }, [
    h('span', 'brain-lead', {}, [h('span', 'brain-dot')]),
    inner,
  ]);
  const other = h('li', 'brain-task', { 'data-key': '00 Inbox/Other.md' }, [link('Other', 'brain-task-text', () => {})]);
  const calls = spy({ row, inner, other });
  refocus(h('ul', undefined, {}, [other, row]), "00 Inbox/Choose hosting for Sam's site.md");
  assert.deepEqual(calls, [['inner', { preventScroll: true }]]);
});

test('refocus gives a keyed button focus itself: the Schedule switch and the strip\'s +N more keep it across a redraw', () => {
  const switcher = h('button', 'brain-quiet', { 'data-key': 'schedule-switch' }, ['Compact']);
  const sibling = h('button', 'brain-quiet', {}, ['Whole day']);
  const more = h('button', 'brain-quiet', { 'data-key': 'more:2026-10-15' }, ['+4 more']);
  const calls = spy({ switcher, sibling, more });
  const root = h('div', undefined, {}, [h('span', 'brain-tools', {}, [sibling, switcher]), h('li', undefined, {}, [more])]);
  refocus(root, 'schedule-switch');
  refocus(root, 'more:2026-10-15');
  assert.deepEqual(calls, [['switcher', { preventScroll: true }], ['more', { preventScroll: true }]]);
});

test('refocus does nothing when the key is gone or nothing in the element can take focus', () => {
  const bare = h('li', 'brain-tile', { 'data-key': 'Waiting/Sam.md' }, [h('h3', undefined, {}, ['Sam'])]);
  const calls = spy({ bare });
  const root = h('ul', undefined, {}, [bare]);
  refocus(root, 'Waiting/Sam.md');
  refocus(root, 'Missing.md');
  assert.deepEqual(calls, []);
});

test('focusedKey is the data-key of the keyed element that holds focus inside root, else undefined', () => {
  const inner = link('Ring the dentist', 'brain-task-text', () => {});
  const row = h('li', 'brain-task', { tabindex: '0', 'data-key': 'Health/Dentist checkup.md' }, [inner]);
  const outside = h('button', undefined, { 'data-key': 'Health/Dentist checkup.md' }, ['elsewhere']);   // the same key as the row, in another view
  const root = h('ul', undefined, {}, [row]);
  document.body.append(root, outside);
  let active: Element | null = null;
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => active });
  try {
    assert.equal(focusedKey(root), undefined);
    active = row;
    assert.equal(focusedKey(root), 'Health/Dentist checkup.md');
    active = inner;   // a descendant of the keyed element: its key
    assert.equal(focusedKey(root), 'Health/Dentist checkup.md');
    active = outside;   // focus outside root
    assert.equal(focusedKey(root), undefined);
  } finally {
    delete (document as unknown as Record<string, unknown>).activeElement;
    root.remove();
    outside.remove();
  }
});

test('returnFocus: a closed modal gives the focus back to the button that opened it, or to the one with its key when a redraw replaced it', () => {
  const root = h('div', undefined, {}, []);
  document.body.append(root);
  const log: string[] = [];
  const opener = h('button', undefined, { 'data-key': 'show-all:someday' }, ['Show all 12']);
  root.append(opener);
  opener.focus = () => { log.push('opener'); };
  returnFocus(opener, 'show-all:someday', root);
  opener.remove();
  const fresh = h('button', undefined, { 'data-key': 'show-all:someday' }, ['Show all 12']);
  root.append(fresh);
  fresh.focus = () => { log.push('fresh'); };
  returnFocus(opener, 'show-all:someday', root);
  assert.deepEqual(log, ['opener', 'fresh']);
  root.remove();
});

// ---------- The pager's focus across a render ----------

/** linkedom has no focus state: this makes el the active element, as a click or Tab would. */
function focusOn(el: Element | null | undefined): void {
  Object.defineProperty(document, 'activeElement', { value: el ?? null, configurable: true });
}

/** The pager's buttons, in order: ‹ and › are the steps; This week is the quiet one. */
const pagerSteps = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.brain-pager > .brain-step')];

/** The week that holds this Monday, drawn into a fresh root. */
function weekRoot(start?: string): HTMLElement {
  const root = document.createElement('div') as HTMLElement;
  renderWeek(root, buildWeek(loadSample(), TODAY, { start }), recorder().actions);
  return root;
}

test('pager focus: › focused stays on the new page\'s › after paging', () => {
  const root = weekRoot('2026-10-19');   // Week 43, a later week: ‹ › and This week
  focusOn(pagerSteps(root)[1]);
  const was = pagerFocus(root);
  assert.equal(was, 1);
  renderWeek(root, buildWeek(loadSample(), TODAY, { start: '2026-10-26' }), recorder().actions);   // Week 44
  const calls = spy({ next: pagerSteps(root)[1] });
  refocusPager(root, was);
  assert.deepEqual(calls, [['next', { preventScroll: true }]]);
});

test('pager focus: This week focused, then the week shown is this week, lands on the first step', () => {
  const root = weekRoot('2026-10-19');
  focusOn(root.querySelector('.brain-pager > .brain-quiet'));
  const was = pagerFocus(root);
  assert.equal(was, 'first');
  renderWeek(root, buildWeek(loadSample(), TODAY), recorder().actions);   // this week: no This week any more
  const calls = spy({ prev: pagerSteps(root)[0] });
  refocusPager(root, was);
  assert.deepEqual(calls, [['prev', { preventScroll: true }]]);
});

test('pager focus: a step of another view is not this view\'s focus, so it remembers nothing', () => {
  const root = weekRoot('2026-10-19');
  const other = weekRoot('2026-10-19');
  focusOn(pagerSteps(other)[1]);
  assert.equal(pagerFocus(root), undefined);
});

test('pager focus: a Coming up chip counts as This week, and focus elsewhere remembers nothing', () => {
  const root = weekRoot();   // this week: Coming up's chips
  focusOn(root.querySelector('.brain-week-chip'));
  assert.equal(pagerFocus(root), 'first');
  focusOn(root.querySelector('.brain-board li.brain-task'));
  assert.equal(pagerFocus(root), undefined);
  const calls = spy({ prev: pagerSteps(root)[0] });
  refocusPager(root, undefined);
  assert.deepEqual(calls, []);
});

test('keyboard focus inside a section marks it; a click\'s focus, which is not focus-visible, does not', () => {
  const section = h('section', 'brain-col', {}, [h('button', 'brain-switch', {}, [])]);
  const control = section.querySelector<HTMLElement>('button')!;
  markKeyboardFocus(section, 'brain-keyboard-focus');
  // linkedom has no :focus-visible: the test says what the browser says for each kind of focus.
  control.matches = (selector: string) => selector === ':focus-visible';
  fire(control, 'focusin');
  assert.equal(section.classList.contains('brain-keyboard-focus'), true);
  fire(control, 'focusout');
  assert.equal(section.classList.contains('brain-keyboard-focus'), false);
  control.matches = () => false;
  fire(control, 'focusin');
  assert.equal(section.classList.contains('brain-keyboard-focus'), false);
});

test('a focus the browser cannot tell apart (no :focus-visible support) is not keyboard focus', () => {
  const section = h('section', 'brain-col', {}, [h('button', 'brain-switch', {}, [])]);
  markKeyboardFocus(section, 'brain-keyboard-focus');
  fire(section.querySelector('button')!, 'focusin');   // linkedom throws on :focus-visible
  assert.equal(section.classList.contains('brain-keyboard-focus'), false);
});

test('refocus: a row folded away in a shut group takes the focus to the toggle that opens the group, and with no such toggle, to the view', () => {
  const row = h('li', 'brain-task', { tabindex: '0', 'data-key': 'Home/Hallway.md#6' }, [link('Fix the hallway light switch', 'brain-task-text', () => {})]);
  const group = h('ul', 'brain-tasks', { id: 'brain-fold-7', hidden: '' }, [row]);
  const toggle = h('button', 'brain-fold-toggle', { 'aria-controls': 'brain-fold-7', 'data-key': 'fold:done' }, ['Done today']);
  const view = h('div', 'brain-view', { tabindex: '-1' }, [toggle, group]);
  const calls = spy({ view, toggle, row });
  refocus(view, 'Home/Hallway.md#6');
  assert.deepEqual(calls, [['toggle', { preventScroll: true }]]);
  // A shut group that nothing in the view opens: the view takes the focus, so Cmd/Ctrl+Z still reaches it.
  const loose = h('ul', 'brain-tasks', { id: 'brain-fold-8', hidden: '' }, [h('li', 'brain-task', { tabindex: '0', 'data-key': 'Home/Loose.md#2' })]);
  const outer = h('div', 'brain-view', { tabindex: '-1' }, [loose]);
  const looseCalls = spy({ outer });
  refocus(outer, 'Home/Loose.md#2');
  assert.deepEqual(looseCalls, [['outer', { preventScroll: true }]]);
});

test('refocus: a disabled button takes no focus, so the focus goes to the view', () => {
  const undoButton = h('button', 'brain-undo', { 'data-key': 'undo', disabled: '' });
  const view = h('div', 'brain-view', { tabindex: '-1' }, [undoButton]);
  const calls = spy({ view, undoButton });
  refocus(view, 'undo');
  assert.deepEqual(calls, [['view', { preventScroll: true }]]);
});
