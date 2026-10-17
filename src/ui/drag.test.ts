import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Actions } from './actions.ts';
import { noteRow } from '../model/rows.ts';
import { absent, fire, recorder, rowFor, sampleNote } from '../../test/ui.ts';
import { h } from './dom.ts';
import { cancelDrags, dropLists, enableDrag } from './drag.ts';
import type { DragOpts, DropTarget } from './drag.ts';
import { taskRow } from './task.ts';

const TODAY = '2026-10-13';

const titleOf = (item: Element) => item.querySelector('.brain-task-text, .brain-card-title')?.textContent;

/**
 * Turns dragging on in root, with the pointer over whatever `over` last named (at first `under`). linkedom
 * has no layout, and pointer capture does nothing. Each drop is kept as the dropped item's title and where it
 * landed: a failed assertion then prints titles, not linkedom nodes.
 */
function listen(root: HTMLElement, under: Element, opts?: DragOpts) {
  Object.assign(root.ownerDocument, { elementFromPoint: () => under });
  root.setPointerCapture = () => {};
  const drops: [string | null | undefined, DropTarget][] = [];
  enableDrag(root, (item, target) => { drops.push([titleOf(item), target]); }, opts);
  return { drops, over: (el: Element) => { under = el; } };
}

// A cut-down Week board: Clean the gutters in To do, and a second column to drop on. A test may name the
// first column's states and the second column's attributes.
function board(
  target: Record<string, string>,
  makeRow: (actions: Actions) => HTMLLIElement = (actions) =>
    taskRow(rowFor('Clean the gutters', { meta: [{ text: 'Home' }, { text: 'Thu' }], draggable: true }), actions),
  ownStates = 'todo',
) {
  const { actions, calls } = recorder();
  const row = makeRow(actions);
  const todo = h('section', 'brain-col', { 'data-states': ownStates }, [h('ul', 'brain-col-items', {}, [row])]);
  const other = h('section', 'brain-col', target, [h('ul', 'brain-col-items')]);
  const root = h('div', 'brain-board', {}, [todo, other]);
  return { root, row, todo, other, calls, ...listen(root, row) };
}

const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y });
const column = (name: string, index: number | null = null): DropTarget => ({ kind: 'column', column: name, index });

test('a mouse drag past 4px lifts the row and drops it on another column, without moving it', () => {
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', mouse(12, 12));   // 2.8px: still a click
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);

  b.over(b.other.querySelector('.brain-col-items')!);
  fire(title, 'pointermove', mouse(200, 30));
  assert.equal(b.row.classList.contains('brain-is-lifted'), true);
  assert.equal(b.other.classList.contains('brain-is-drop'), true);

  fire(b.root, 'pointerup', mouse(200, 30));
  assert.deepEqual(b.drops, [['Clean the gutters', column('doing')]]);   // the first word of data-states
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  assert.equal(b.other.classList.contains('brain-is-drop'), false);
  assert.equal(b.row.closest('.brain-col') === b.todo, true);   // the view re-renders from the vault
});

test('data-column names the drop too, and the whole column takes it, below its items as well', () => {
  const b = board({ 'data-column': 'done' });
  const title = b.row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  b.over(b.other);   // the column itself: the empty space below its list
  fire(title, 'pointermove', mouse(200, 300));
  fire(b.root, 'pointerup', mouse(200, 300));
  assert.deepEqual(b.drops, [['Clean the gutters', column('done')]]);
});

test('no drop for a click, a drop on its own column, or a press on the check', () => {
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  fire(b.root, 'pointerup', mouse(11, 10));

  b.over(b.todo);
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', mouse(10, 60));
  assert.equal(b.todo.classList.contains('brain-is-drop'), false);   // its own column, which can't be arranged
  fire(b.root, 'pointerup', mouse(10, 60));

  b.over(b.other);
  const check = b.row.querySelector('.brain-check')!;
  fire(check, 'pointerdown', mouse(10, 10));
  fire(check, 'pointermove', mouse(200, 30));
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  fire(b.root, 'pointerup', mouse(200, 30));

  assert.deepEqual(b.drops, []);
});

test('Waiting holds waiting rows: a waiting row dropped on Waiting is no drop, and on To do it is "todo"', () => {
  // Get the written quote from Bram is waiting: the board lists it in Waiting, whose data-states is "waiting".
  const waiting = (actions: Actions) => taskRow(rowFor('Get the written quote from Bram', { meta: [{ text: 'Chase Thu' }], draggable: true }), actions);
  const b = board({ 'data-states': 'todo' }, waiting, 'waiting');
  assert.equal(b.row.getAttribute('data-state'), 'waiting');
  const title = b.row.querySelector('.brain-task-text')!;

  b.over(b.todo);
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', mouse(10, 60));
  fire(b.root, 'pointerup', mouse(10, 60));
  assert.deepEqual(b.drops, []);

  b.over(b.other);
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', mouse(200, 30));
  fire(b.root, 'pointerup', mouse(200, 30));
  assert.deepEqual(b.drops, [['Get the written quote from Bram', column('todo')]]);
});

test('a row without draggable lifts nothing: pressing and moving it drops nothing', () => {
  // An area's non-repeating task note (Dentist checkup without its repeat): noteRow gives it draggable false.
  const note = (actions: Actions) => taskRow(noteRow({ ...sampleNote('Dentist checkup'), repeat: undefined }, TODAY), actions);
  const b = board({ 'data-states': 'doing waiting' }, note);
  assert.equal(b.row.classList.contains('brain-draggable'), false);
  const title = b.row.querySelector('.brain-task-text')!;
  b.over(b.other);
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', mouse(200, 30));
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  fire(b.root, 'pointerup', mouse(200, 30));
  assert.deepEqual(b.drops, []);
});

test('touch: a 500ms press lifts; releasing without moving opens the row\'s card, once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  const touch = { ...mouse(10, 10), pointerType: 'touch' };
  fire(title, 'pointerdown', touch);
  t.mock.timers.tick(500);
  assert.equal(b.row.classList.contains('brain-is-lifted'), true);
  fire(b.root, 'pointerup', touch);
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  assert.deepEqual(b.calls, []);
  assert.equal(b.row.ownerDocument.querySelectorAll('.brain-popover').length, 1);
  b.row.ownerDocument.querySelector('.brain-popover')?.remove();
  assert.deepEqual(b.drops, []);
});

test('touch: moving before the long-press is a scroll, not a drag', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', { ...mouse(10, 10), pointerType: 'touch' });
  fire(title, 'pointermove', { ...mouse(10, 30), pointerType: 'touch' });
  t.mock.timers.tick(500);
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  assert.deepEqual(b.calls, []);
});

test('the click that follows a drop is swallowed, and only that one', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  b.over(b.other);
  fire(title, 'pointermove', mouse(200, 30));
  fire(b.root, 'pointerup', mouse(200, 30));
  // A click on the row itself, which has no click handler of its own: defaultPrevented shows the swallowing.
  assert.equal(fire(b.row, 'click').defaultPrevented, true);
  t.mock.timers.tick(0);
  assert.equal(fire(b.row, 'click').defaultPrevented, false);
});

test('touch: a 500ms press lifts the row, and a move and release drop it on another column, with no menu', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  const touch = { ...mouse(10, 10), pointerType: 'touch' };
  b.over(b.other.querySelector('.brain-col-items')!);
  fire(title, 'pointerdown', touch);
  t.mock.timers.tick(500);
  fire(title, 'pointermove', { ...touch, clientX: 200, clientY: 30 });
  fire(b.root, 'pointerup', { ...touch, clientX: 200, clientY: 30 });
  assert.deepEqual(b.drops, [['Clean the gutters', column('doing')]]);
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  assert.equal(b.row.ownerDocument.querySelectorAll('.brain-popover').length, 0);
});

test('a right-button press lifts nothing and drops nothing: only the primary button drags', () => {
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  const right = { ...mouse(10, 10), button: 2 };
  b.over(b.other);
  fire(title, 'pointerdown', right);
  fire(title, 'pointermove', { ...right, clientX: 200, clientY: 30 });
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  fire(b.root, 'pointerup', { ...right, clientX: 200, clientY: 30 });
  assert.deepEqual(b.drops, []);
});

test('a second pointer cannot steer a drag: its moves do not lift or move it, and its release ends nothing', () => {
  const b = board({ 'data-states': 'doing waiting' });
  const title = b.row.querySelector('.brain-task-text')!;
  b.over(b.other);
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', { ...mouse(200, 30), pointerId: 2 });
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  fire(title, 'pointermove', mouse(200, 30));
  assert.equal(b.row.classList.contains('brain-is-lifted'), true);
  fire(b.root, 'pointerup', { ...mouse(10, 30), pointerId: 2 });
  assert.equal(b.row.classList.contains('brain-is-lifted'), true);
  fire(b.root, 'pointerup', mouse(200, 30));
  assert.deepEqual(b.drops, [['Clean the gutters', column('doing')]]);
});

test('touch carry out of a modal: the page does not scroll under the finger, even once the row has moved out of the modal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const c = carry();
  const title = c.row.querySelector('.brain-task-text')!;
  const touch = { ...mouse(10, 10), pointerType: 'touch' };
  fire(title, 'pointerdown', touch);
  assert.equal(fire(title, 'touchmove').defaultPrevented, false, 'an idle press may scroll');
  t.mock.timers.tick(500);
  fire(c.grid, 'pointermove', { ...touch, clientY: 60 });
  assert.equal(c.row.parentElement === c.view, true);
  assert.equal(fire(title, 'touchmove').defaultPrevented, true);
  fire(c.grid, 'pointerup', { ...touch, clientY: 60 });
});

test('Escape during a carry out of a modal is the modal\'s to handle: the carry stays on until its cancel ends it', () => {
  const c = carry();
  press(c.row, 10);
  fire(c.grid, 'pointermove', mouse(10, 60));
  fire(document.body, 'keydown', { key: 'Escape' });
  assert.equal(c.row.parentElement === c.view, true);
  assert.deepEqual(c.events, ['lift']);
  c.cancel();
  assert.deepEqual(c.events, ['lift', 'end false']);
});

test('Escape cancels a lifted drag on a board, even with the focus on the body after a mouse drag: the row goes back, nothing drops', () => {
  const b = board({ 'data-states': 'doing waiting' });
  document.body.append(b.root);   // a key goes to the document through the attached board, as in Obsidian
  const title = b.row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  b.over(b.other);
  fire(title, 'pointermove', mouse(200, 30));
  assert.equal(b.row.classList.contains('brain-is-lifted'), true);
  fire(document.body, 'keydown', { key: 'Escape' });
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  assert.equal(b.other.classList.contains('brain-is-drop'), false);
  fire(b.root, 'pointerup', mouse(200, 30));
  assert.deepEqual(b.drops, []);
  b.root.remove();
});

test('a lifted drag near the top or bottom of the scrolling view scrolls it, a frame at a time, and the drag follows', (t) => {
  const b = board({ 'data-states': 'doing waiting' });
  // The board sits in a scroller 400px tall, showing 400px of a 1000px view that starts 300px down.
  const scroller = h('div', 'brain-scroll', {}, [b.root]);
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 400 }) as DOMRect;
  Object.defineProperty(scroller, 'clientHeight', { value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
  scroller.scrollTop = 300;

  // The window's frames, run by hand: a request waits in the list until the test runs the list once.
  let queued: { id: number; run: (time: number) => void }[] = [];
  let ids = 0;
  const runFrame = () => {
    const due = queued;
    queued = [];
    for (const f of due) f.run(0);
  };
  const stubs = {
    innerHeight: 400,
    getComputedStyle: (el: Element) => ({ overflowY: el === scroller ? 'auto' : 'visible' }),
    requestAnimationFrame: (run: (time: number) => void) => {
      queued.push({ id: ++ids, run });
      return ids;
    },
    cancelAnimationFrame: (id: number) => { queued = queued.filter((f) => f.id !== id); },
  };
  const view = b.root.ownerDocument.defaultView as unknown as Record<string, unknown>;
  Object.assign(view, stubs);
  t.after(() => { for (const key of Object.keys(stubs)) delete view[key]; });

  // Each step looks the zone up under the pointer again: the count shows whether it did.
  const doc = b.root.ownerDocument;
  const lookup = doc.elementFromPoint;
  let lookups = 0;
  Object.assign(doc, { elementFromPoint: (x: number, y: number) => { lookups++; return lookup(x, y); } });
  t.after(() => { Object.assign(doc, { elementFromPoint: lookup }); });

  // Lift with a mouse near the bottom: a frame scrolls the view down, and the zone is looked up after the step.
  const title = b.row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', mouse(10, 390));
  assert.equal(b.row.classList.contains('brain-is-lifted'), true);
  const looked = lookups;
  runFrame();
  assert.equal(scroller.scrollTop > 300, true);
  assert.equal(lookups > looked, true);

  // Held still in the middle: no frame is queued, and the view stays where it is.
  fire(title, 'pointermove', mouse(10, 200));
  const middle = scroller.scrollTop;
  runFrame();
  assert.equal(queued.length, 0);
  assert.equal(scroller.scrollTop, middle);

  // Near the top: a frame scrolls the view back up.
  fire(title, 'pointermove', mouse(10, 5));
  runFrame();
  assert.equal(scroller.scrollTop < middle, true);

  // Let go while a frame is queued: that frame doesn't scroll.
  assert.equal(queued.length, 1);
  const released = scroller.scrollTop;
  fire(b.root, 'pointerup', mouse(10, 5));
  assert.equal(queued.length, 0);
  runFrame();
  assert.equal(scroller.scrollTop, released);
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
});

test('a lifted drag keeps its item under the pointer while the view scrolls: the box moves with the content', (t) => {
  const b = board({ 'data-states': 'doing waiting' });
  // The same scroller as the test above: 400px tall, showing 400px of a 1000px view that starts 300px down.
  const scroller = h('div', 'brain-scroll', {}, [b.root]);
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 400 }) as DOMRect;
  Object.defineProperty(scroller, 'clientHeight', { value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
  scroller.scrollTop = 300;

  let queued: { id: number; run: (time: number) => void }[] = [];
  let ids = 0;
  const runFrame = () => {
    const due = queued;
    queued = [];
    for (const f of due) f.run(0);
  };
  const stubs = {
    innerHeight: 400,
    getComputedStyle: (el: Element) => ({ overflowY: el === scroller ? 'auto' : 'visible' }),
    requestAnimationFrame: (run: (time: number) => void) => {
      queued.push({ id: ++ids, run });
      return ids;
    },
    cancelAnimationFrame: (id: number) => { queued = queued.filter((f) => f.id !== id); },
  };
  const view = b.root.ownerDocument.defaultView as unknown as Record<string, unknown>;
  Object.assign(view, stubs);
  t.after(() => { for (const key of Object.keys(stubs)) delete view[key]; });

  // A fixed box inside a transformed ancestor: it moves up with the content as the view scrolls, and keeps its translate.
  const { row } = b;
  row.getBoundingClientRect = () => {
    const [tx, ty] = (row.style.getPropertyValue('translate') || '0px 0px').split(' ').map(parseFloat);
    return { left: 10 + tx, top: 500 - (scroller.scrollTop - 300) + ty, width: 200, height: 40 } as DOMRect;
  };

  // Lift at the row's centre, (110, 520), and drag up to (110, 390): the centre is under the pointer.
  const title = row.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(110, 520));
  fire(title, 'pointermove', mouse(110, 390));
  assert.equal(row.classList.contains('brain-is-lifted'), true);
  assert.equal(row.getBoundingClientRect().top + 20, 390);

  // The view scrolls down under the pointer (the queued frame): the box goes with the content, so the centre stays put.
  runFrame();
  assert.equal(scroller.scrollTop > 300, true);
  const r = row.getBoundingClientRect();
  assert.equal(r.top + 20, 390);
  assert.equal(r.left + 100, 110);

  // A wheel scroll with the pointer still, away from the edges: the scroll event alone brings the item back under it.
  fire(title, 'pointermove', mouse(140, 200));
  runFrame();
  scroller.scrollTop = 450;
  b.root.ownerDocument.body.append(scroller);   // a scroll reaches the document's listener only from inside it
  t.after(() => scroller.remove());
  fire(scroller, 'scroll');   // a real scroll doesn't bubble but reaches the capture listener; linkedom has no capture phase, so this one bubbles
  const wheeled = row.getBoundingClientRect();
  assert.equal(wheeled.top + 20, 200);
  assert.equal(wheeled.left + 100, 140);
});

// ---------- Arranging: the landing slot and its place ----------

// An arrangeable To do holding three rows 40px tall (middles at 20, 60 and 100), then a hidden extra when
// asked, and a Done holding one row. linkedom has no layout, so each row's box and height are set by hand.
// The pointer is over To do's list until a test moves it.
function arranging(opts: { hidden?: boolean } = {}) {
  const { actions } = recorder();
  const row = (text: string, top: number) => {
    const li = taskRow(rowFor(text, { draggable: true }), actions);
    li.getBoundingClientRect = () => ({ top, left: 0, width: 200, height: 40 }) as DOMRect;
    Object.defineProperty(li, 'offsetHeight', { value: 40 });
    return li;
  };
  const rows = [row('Book a physio session', 0), row('Fix the hallway light switch', 40), row('Clean the gutters', 80)];
  const extra = opts.hidden ? [h('li', 'brain-task', { 'data-key': 'extra', hidden: '' })] : [];
  const list = h('ul', 'brain-col-items', {}, [...rows, ...extra]);
  const todo = h('section', 'brain-col', { 'data-column': 'todo', 'data-arrange': '' }, [list]);
  const doneRow = row('Pick design B with Sam', 0);
  const done = h('section', 'brain-col', { 'data-column': 'done' }, [h('ul', 'brain-col-items', {}, [doneRow])]);
  const root = h('div', 'brain-board', {}, [todo, done]);
  return { root, rows, list, todo, done, doneRow, ...listen(root, list) };
}

/** A list's children in order: a row's title, "slot", "hidden", or nothing a test looks for. */
const order = (list: Element) => [...list.children].map((el) =>
  el.matches('.brain-drop-slot') ? 'slot'
    : el.matches('[hidden]') ? 'hidden'
      : el.querySelector('.brain-task-text')?.textContent);

/** Presses the row's title at (10, y); the first move past 4px lifts it. */
const press = (row: Element, y: number) => fire(row.querySelector('.brain-task-text')!, 'pointerdown', mouse(10, y));
const move = (row: Element, y: number) => fire(row.querySelector('.brain-task-text')!, 'pointermove', mouse(10, y));

test('the landing slot: at the top, between two items, at the end; its height is the item\'s; a drop takes it away', () => {
  const b = arranging();
  const gutters = b.rows[2];
  press(gutters, 90);
  move(gutters, 10);
  assert.deepEqual(order(b.list), ['slot', 'Book a physio session', 'Fix the hallway light switch', 'Clean the gutters']);
  const slot = b.list.querySelector<HTMLElement>(':scope > li.brain-drop-slot[aria-hidden="true"]');
  assert.ok(slot);
  assert.equal(slot.style.getPropertyValue('--brain-slot'), '40px');   // the lifted row's height, no gap
  assert.equal(slot.classList.contains('brain-is-card'), false);
  assert.equal(b.todo.classList.contains('brain-is-drop'), true);   // its own column: it can be arranged

  move(gutters, 50);
  assert.deepEqual(order(b.list), ['Book a physio session', 'slot', 'Fix the hallway light switch', 'Clean the gutters']);
  move(gutters, 200);
  assert.deepEqual(order(b.list), ['Book a physio session', 'Fix the hallway light switch', 'Clean the gutters', 'slot']);

  fire(b.root, 'pointerup', mouse(10, 200));
  assert.equal(b.root.querySelectorAll('.brain-drop-slot').length, 0);
  assert.equal(b.todo.classList.contains('brain-is-drop'), false);
  // Its place among the other two: the dragged row isn't counted.
  assert.deepEqual(b.drops, [['Clean the gutters', column('todo', 2)]]);
});

test('a lifted row is fixed where it was, by its classes, and has no inline style once it lands', () => {
  const b = arranging();
  const gutters = b.rows[2];
  press(gutters, 90);
  move(gutters, 60);
  assert.equal(gutters.classList.contains('brain-is-floating'), true);   // fixed at the origin, no margin: styles.css
  assert.equal(gutters.classList.contains('brain-is-lifted'), true);     // no pointer events: styles.css
  assert.equal(gutters.style.getPropertyValue('width'), '200px');   // its width at lift, the only inline style it keeps
  fire(b.root, 'pointerup', mouse(10, 60));
  assert.equal(gutters.classList.contains('brain-is-floating'), false);
  assert.equal(gutters.classList.contains('brain-is-lifted'), false);
  assert.equal(gutters.getAttribute('style') ?? '', '');
});

test('a drop reports the slot\'s place among the other items', () => {
  const b = arranging();
  const [physio, , gutters] = b.rows;
  press(gutters, 90);
  move(gutters, 10);
  fire(b.root, 'pointerup', mouse(10, 10));
  press(physio, 10);
  move(physio, 70);   // below the hallway switch's middle (60): after it
  fire(b.root, 'pointerup', mouse(10, 70));
  assert.deepEqual(b.drops, [['Clean the gutters', column('todo', 0)], ['Book a physio session', column('todo', 1)]]);
});

test('a hidden item is not counted, and the slot lands at the end after it', () => {
  const b = arranging({ hidden: true });
  const physio = b.rows[0];
  press(physio, 10);
  move(physio, 200);
  assert.deepEqual(order(b.list), ['Book a physio session', 'Fix the hallway light switch', 'Clean the gutters', 'hidden', 'slot']);
  fire(b.root, 'pointerup', mouse(10, 200));
  assert.deepEqual(b.drops, [['Book a physio session', column('todo', 2)]]);
});

test('a cancelled drag takes the slot, the tint and the lift away, and drops nothing', () => {
  const b = arranging();
  const gutters = b.rows[2];
  press(gutters, 90);
  move(gutters, 10);
  fire(b.root, 'pointercancel', mouse(10, 10));
  assert.equal(b.root.querySelectorAll('.brain-drop-slot').length, 0);
  assert.equal(b.todo.classList.contains('brain-is-drop'), false);
  assert.equal(gutters.classList.contains('brain-is-lifted'), false);
  fire(b.root, 'pointerup', mouse(10, 10));
  assert.deepEqual(b.drops, []);
});

test('Done keeps time order: it only tints, shows no slot, and the drop has no place', () => {
  const b = arranging();
  const gutters = b.rows[2];
  press(gutters, 90);
  b.over(b.done);
  move(gutters, 10);
  assert.equal(b.done.classList.contains('brain-is-drop'), true);
  assert.equal(b.root.querySelectorAll('.brain-drop-slot').length, 0);
  fire(b.root, 'pointerup', mouse(10, 10));
  assert.deepEqual(b.drops, [['Clean the gutters', column('done', null)]]);
});

test('a done row dropped back on its own Done is no drop, and Done doesn\'t tint for it', () => {
  const b = arranging();
  b.over(b.done);
  press(b.doneRow, 10);
  move(b.doneRow, 60);
  assert.equal(b.done.classList.contains('brain-is-drop'), false);
  fire(b.root, 'pointerup', mouse(10, 60));
  assert.deepEqual(b.drops, []);
});

test('a repeating row drags like any row: Done tints, and a drop there is a state change; it arranges in its column too', () => {
  const b = arranging();
  const dentist = taskRow({ ...noteRow(sampleNote('Dentist checkup'), TODAY), draggable: true }, recorder().actions);
  b.list.append(dentist);
  press(dentist, 10);
  b.over(b.done);
  move(dentist, 60);
  assert.equal(b.done.classList.contains('brain-is-drop'), true);
  fire(b.root, 'pointerup', mouse(10, 60));
  assert.deepEqual(b.drops, [['Dentist checkup', column('done')]]);
  // And within its own column, it arranges with a place, as any row does.
  press(dentist, 10);
  b.over(b.list);
  move(dentist, 200);
  assert.equal(b.todo.classList.contains('brain-is-drop'), true);
  fire(b.root, 'pointerup', mouse(10, 200));
  assert.deepEqual(b.drops.at(-1), ['Dentist checkup', column('todo', 3)]);
});

test('a card lifted over an arrangeable column shows a slot of its own shape', () => {
  const p = planning();
  p.over(p.root.querySelector<HTMLElement>('.brain-col')!);
  const title = p.card.querySelector('.brain-card-title')!;
  fire(title, 'pointerdown', mouse(10, 10));
  fire(title, 'pointermove', mouse(10, 300));
  assert.equal(p.root.querySelector<HTMLElement>('.brain-drop-slot')!.classList.contains('brain-is-card'), true);
  fire(p.root, 'pointerup', mouse(10, 300));
  assert.equal(p.root.querySelectorAll('.brain-drop-slot').length, 0);
});

// ---------- Planning zones: a day, a week and To plan ----------

// A strip day and a day pick, To plan holding a plannable row, and an arrangeable To do holding a plannable
// row and a card; the card holds a row of its own, which is still not an item of the column.
function planning() {
  const { actions } = recorder();
  const row = taskRow(rowFor('Clean the gutters', { draggable: true, plan: {} }), actions);
  const planned = taskRow(rowFor('Get photos from Sam', { draggable: true, plan: {} }), actions);
  const inner = taskRow(rowFor('Re-measure the corner under the sink', { draggable: true, plan: {} }), actions);
  const card = h('li', 'brain-tile brain-card brain-draggable', { 'data-state': 'todo', tabindex: '0', 'data-key': 'Order cabinets' }, [
    h('h4', 'brain-card-title', {}, ['Order cabinets']),
    h('ul', 'brain-tasks', {}, [inner]),
  ]);
  const day = h('li', 'brain-day', { 'data-drop': 'day', 'data-date': '2026-10-16' }, [h('span', 'brain-day-num', {}, ['16'])]);
  const pick = h('button', 'brain-day-pick', { 'data-drop': 'day', 'data-date': '2026-10-17' }, [h('span', 'brain-day-num', {}, ['17'])]);
  const toPlan = h('section', 'brain-tile brain-fold brain-to-plan', { 'data-drop': 'unplan' }, [h('ul', 'brain-tasks', {}, [planned])]);
  const todo = h('section', 'brain-col', { 'data-column': 'todo', 'data-arrange': '' }, [h('ul', 'brain-col-items', {}, [row, card])]);
  const root = h('div', 'brain-page', {}, [h('ul', 'brain-strip', {}, [day]), pick, todo, toPlan]);
  return { root, row, planned, inner, card, day, pick, toPlan, ...listen(root, day) };
}

/** Drags the item over `to` and lets go; says whether `to`'s zone was tinted while over it. */
function dragOver(b: ReturnType<typeof planning>, item: HTMLElement, to: Element): boolean {
  b.over(to);
  const handle = item.querySelector('.brain-task-text, .brain-card-title')!;
  fire(handle, 'pointerdown', mouse(10, 10));
  fire(handle, 'pointermove', mouse(300, 300));
  const tinted = to.closest('[data-drop]')!.classList.contains('brain-is-drop');
  fire(b.root, 'pointerup', mouse(300, 300));
  return tinted;
}

test('a strip day and a day pick take a plannable row: the drop reports their date', () => {
  const b = planning();
  assert.equal(dragOver(b, b.row, b.day.querySelector('.brain-day-num')!), true);
  assert.equal(dragOver(b, b.row, b.pick.querySelector('.brain-day-num')!), true);
  assert.deepEqual(b.drops, [
    ['Clean the gutters', { kind: 'day', date: '2026-10-16' }],
    ['Clean the gutters', { kind: 'day', date: '2026-10-17' }],
  ]);
});

test('a day doesn\'t take a card', () => {
  const b = planning();
  assert.equal(dragOver(b, b.card, b.day), false);
  assert.deepEqual(b.drops, []);
});

test('a day takes a plannable story card, as it takes a plannable row: the drop reports its date', () => {
  const b = planning();
  b.card.setAttribute('data-plannable', '');   // a story card Brain may plan
  assert.equal(dragOver(b, b.card, b.day.querySelector('.brain-day-num')!), true);
  assert.deepEqual(b.drops, [['Order cabinets', { kind: 'day', date: '2026-10-16' }]]);
});

test('To plan takes a plannable row from elsewhere, to unplan it, but not one of its own rows', () => {
  const b = planning();
  assert.equal(dragOver(b, b.row, b.toPlan), true);
  assert.equal(dragOver(b, b.planned, b.toPlan), false);
  assert.deepEqual(b.drops, [['Clean the gutters', { kind: 'unplan' }]]);
});

// A Planned or due tile (a week zone) holding its Any day group, or no group, beside an arrangeable To do
// with a row that is plannable unless a test says it is not.
function weekZone(anyGroup: boolean, plannable = true) {
  const { actions } = recorder();
  const row = taskRow(rowFor('Get photos from Sam', plannable ? { draggable: true, plan: {} } : { draggable: true }), actions);
  const list = h('ul', 'brain-tasks');
  const group = h('div', 'brain-group', { 'data-any': '' }, [h('h4', 'brain-group-name', {}, ['Any day']), list]);
  const byDay = h('div', 'brain-by-day', {}, anyGroup ? [group] : []);
  const week = h('section', 'brain-tile brain-planned', {
    'data-drop': 'week', 'data-week': '2026-10-19', 'data-slot-label': 'Any day in week 43',
  }, [byDay]);
  const toDo = h('section', 'brain-col', { 'data-column': 'todo', 'data-arrange': '' }, [h('ul', 'brain-col-items', {}, [row])]);
  const root = h('div', 'brain-page', {}, [toDo, week]);
  return { root, row, toDo, week, byDay, list, ...listen(root, row) };
}

test('a week zone takes a plannable row: the drop reports its week, and the slot sits labelled in the Any day group', () => {
  const b = weekZone(true);
  b.over(b.byDay);
  press(b.row, 10);
  move(b.row, 300);
  const slot = b.root.querySelector<HTMLElement>('.brain-drop-slot')!;
  assert.equal(slot.parentElement === b.list, true);
  assert.equal(slot.getAttribute('data-label'), 'Any day in week 43');
  assert.equal(b.week.classList.contains('brain-is-drop'), true);
  fire(b.root, 'pointerup', mouse(10, 300));
  assert.deepEqual(b.drops, [['Get photos from Sam', { kind: 'week', start: '2026-10-19' }]]);
  assert.equal(b.root.querySelectorAll('.brain-drop-slot').length, 0);
});

test('a week zone with no Any day group gets a temporary one, gone when the pointer leaves the zone', () => {
  const b = weekZone(false);
  b.over(b.byDay);
  press(b.row, 10);
  move(b.row, 300);
  const group = b.byDay.querySelector<HTMLElement>(':scope > [data-any]');
  assert.equal(group?.querySelector('.brain-group-name')?.textContent, 'Any day');
  assert.equal(group?.querySelector('.brain-drop-slot')?.getAttribute('data-label'), 'Any day in week 43');
  b.over(b.toDo);
  move(b.row, 20);
  assert.equal(b.byDay.querySelectorAll('[data-any]').length, 0);
  assert.equal(b.week.classList.contains('brain-is-drop'), false);
  fire(b.root, 'pointerup', mouse(10, 20));
  assert.deepEqual(b.drops, [['Get photos from Sam', column('todo', 0)]]);
  assert.equal(b.byDay.querySelectorAll('[data-any]').length, 0);
});

test('a row that is not plannable gets no day, week or unplan zone', () => {
  const b = weekZone(true, false);
  b.over(b.byDay);
  press(b.row, 10);
  move(b.row, 300);
  assert.equal(b.week.classList.contains('brain-is-drop'), false);
  assert.equal(b.root.querySelectorAll('.brain-drop-slot').length, 0);
  fire(b.root, 'pointerup', mouse(10, 300));
  assert.deepEqual(b.drops, []);
});

test('a planning zone refuses the row it holds: moved and released inside its own Planned or due tile, it tints and drops nothing', () => {
  // A plannable row in the Any day group of its own week tile: the zone it is already in.
  const { actions } = recorder();
  const row = taskRow(rowFor('Get photos from Sam', { draggable: true, plan: {} }), actions);
  const list = h('ul', 'brain-tasks', {}, [row]);
  const group = h('div', 'brain-group', { 'data-any': '' }, [h('h4', 'brain-group-name', {}, ['Any day']), list]);
  const byDay = h('div', 'brain-by-day', {}, [group]);
  const week = h('section', 'brain-tile brain-planned', {
    'data-drop': 'week', 'data-week': '2026-10-19', 'data-slot-label': 'Any day in week 43',
  }, [byDay]);
  const root = h('div', 'brain-page', {}, [week]);
  const b = listen(root, byDay);
  press(row, 10);
  move(row, 300);
  assert.equal(week.classList.contains('brain-is-drop'), false);
  assert.equal(root.querySelectorAll('.brain-drop-slot').length, 0);
  fire(root, 'pointerup', mouse(10, 300));
  assert.deepEqual(b.drops, []);
});

// ---------- Alt+↑ / Alt+↓ ----------

const alt = (key: string) => ({ key, altKey: true });

test('Alt+↑ and Alt+↓ move a focused row or card one place in its arrangeable column', () => {
  const b = arranging();
  const hallway = b.rows[1];
  assert.equal(fire(hallway, 'keydown', alt('ArrowUp')).defaultPrevented, true);
  assert.equal(fire(hallway, 'keydown', alt('ArrowDown')).defaultPrevented, true);
  assert.deepEqual(b.drops, [['Fix the hallway light switch', column('todo', 0)], ['Fix the hallway light switch', column('todo', 2)]]);
  const p = planning();
  fire(p.card, 'keydown', alt('ArrowUp'));
  assert.deepEqual(p.drops, [['Order cabinets', column('todo', 0)]]);
});

test('Alt+↑/↓ does nothing at the column\'s edges, in Done, on a row inside a card, or without Alt', () => {
  const b = arranging();
  fire(b.rows[0], 'keydown', alt('ArrowUp'));     // already first
  fire(b.rows[2], 'keydown', alt('ArrowDown'));   // already last
  fire(b.doneRow, 'keydown', alt('ArrowUp'));     // Done keeps time order
  assert.equal(fire(b.rows[1], 'keydown', { key: 'ArrowUp' }).defaultPrevented, false);
  const p = planning();
  fire(p.inner, 'keydown', alt('ArrowUp'));       // a row inside a card isn't an item of the column
  assert.deepEqual(b.drops, []);
  assert.deepEqual(p.drops, []);
});

// ---------- Carrying out of a modal ----------

// A list modal's grid holding one planned row, carried onto the view: the view holds a strip with one day and
// a To plan tile. The grid's own events come through the grid, as pointer capture would send them.
function carry() {
  const { actions } = recorder();
  const row = taskRow(rowFor('Get photos from Sam', { draggable: true, plan: {} }), actions);
  const grid = h('ul', 'brain-modal-grid', {}, [row]);
  const day = h('li', 'brain-day', { 'data-drop': 'day', 'data-date': '2026-10-16' }, [h('span', 'brain-day-num', {}, ['16'])]);
  const toPlan = h('section', 'brain-tile brain-to-plan', { 'data-drop': 'unplan' }, []);
  const view = h('div', 'brain-view', {}, [h('ul', 'brain-strip', {}, [day]), toPlan]);
  const events: string[] = [];
  let cancelLift = () => {};
  const b = listen(grid, day, {
    zones: view,
    carryTo: view,
    onLift: (cancel) => { events.push('lift'); cancelLift = cancel; },
    onEnd: (dropped) => { events.push(`end ${dropped}`); },
  });
  return { row, grid, view, day, toPlan, events, b, cancel: () => cancelLift() };
}

test('on lift a carried row moves onto the view, and goes back to its place when the drag is cancelled', () => {
  const c = carry();
  press(c.row, 10);
  fire(c.grid, 'pointermove', mouse(10, 60));
  assert.equal(c.row.parentElement === c.view, true);
  assert.deepEqual(c.events, ['lift']);
  fire(c.grid, 'pointercancel', mouse(10, 60));
  assert.equal(c.row.parentElement === c.grid, true);
  assert.deepEqual(c.events, ['lift', 'end false']);
  assert.deepEqual(c.b.drops, []);
});

test('a drop on the view leaves the carried row out, and onEnd reports the drop', () => {
  const c = carry();
  press(c.row, 10);
  fire(c.grid, 'pointermove', mouse(10, 60));
  fire(c.grid, 'pointerup', mouse(10, 60));
  assert.deepEqual(c.b.drops, [['Get photos from Sam', { kind: 'day', date: '2026-10-16' }]]);
  assert.equal(c.row.parentElement === c.view, true);
  assert.deepEqual(c.events, ['lift', 'end true']);
});

test('cancel() ends a lifted carry with no drop, and the row goes back', () => {
  const c = carry();
  press(c.row, 10);
  fire(c.grid, 'pointermove', mouse(10, 60));
  c.cancel();
  assert.equal(c.row.parentElement === c.grid, true);
  fire(c.grid, 'pointerup', mouse(10, 60));
  assert.deepEqual(c.events, ['lift', 'end false']);
  assert.deepEqual(c.b.drops, []);
});

test('To plan takes nothing carried: a row out of a modal is not unplanned by dropping it on To plan', () => {
  const c = carry();
  c.b.over(c.toPlan);
  press(c.row, 10);
  fire(c.grid, 'pointermove', mouse(10, 60));
  assert.equal(c.toPlan.classList.contains('brain-is-drop'), false);
  fire(c.grid, 'pointerup', mouse(10, 60));
  assert.deepEqual(c.b.drops, []);
  assert.deepEqual(c.events, ['lift', 'end false']);
});

// ---------- A re-render during a carry ----------

test('a redraw during a carry: the cancelled item goes to the end of its list, and onEnd still runs', () => {
  const c = carry();
  const other = h('li', 'brain-task', { 'data-key': 'other' });
  c.grid.append(other);
  press(c.row, 10);
  fire(c.grid, 'pointermove', mouse(10, 60));
  c.grid.replaceChildren(h('li', 'brain-task', { 'data-key': 'redrawn' }));   // the row's next sibling is gone
  c.cancel();
  assert.deepEqual([...c.grid.children].map((el) => el.getAttribute('data-key')), ['redrawn', c.row.getAttribute('data-key')]);
  assert.equal(c.row.classList.contains('brain-is-lifted'), false);
  assert.deepEqual(c.events, ['lift', 'end false']);
});

test('a redraw that drew the carried item again leaves one copy; one that took its list away leaves none', () => {
  const key = (el: Element) => el.getAttribute('data-key');
  const again = carry();
  press(again.row, 10);
  fire(again.grid, 'pointermove', mouse(10, 60));
  again.grid.replaceChildren(h('li', 'brain-task', { 'data-key': key(again.row) ?? '' }));
  again.cancel();
  assert.equal(again.grid.children.length, 1);
  assert.equal(again.grid.contains(again.row), false);
  assert.deepEqual(again.events, ['lift', 'end false']);

  // A row in a group: its list is inside a tile that the redraw replaces.
  const { actions } = recorder();
  const row = taskRow(rowFor('Get photos from Sam', { draggable: true, plan: {} }), actions);
  const list = h('ul', 'brain-tasks', {}, [row]);
  const grid = h('ul', 'brain-modal-grid', {}, [h('li', 'brain-tile', {}, [list])]);
  const view = h('div', 'brain-view');
  const events: string[] = [];
  listen(grid, view, { zones: view, carryTo: view, onEnd: (dropped) => { events.push(`end ${dropped}`); } });
  press(row, 10);
  fire(grid, 'pointermove', mouse(10, 60));
  assert.equal(row.parentElement === view, true);
  grid.replaceChildren();
  fire(grid, 'pointercancel', mouse(10, 60));
  absent(row.parentElement);
  assert.deepEqual(events, ['end false']);
});

// ---------- The lists a drop saves ----------

test('dropLists: the column an item leaves is saved only if it has a list, without that one item; the target gets its whole shown order', () => {
  const shown = { todo: ['a', 'b', 'b', 'c'], doing: ['x'] };
  // Nothing saved: the target is placed (the author put it there), the source stays automatic.
  assert.deepEqual(dropLists(shown, {}, { column: 'todo', index: 0 }, 'a', { column: 'doing', index: 1 }), { doing: ['x', 'a'] });
  // A saved source list loses the item, and nothing else of it.
  assert.deepEqual(dropLists(shown, { todo: ['c', 'a'] }, { column: 'todo', index: 0 }, 'a', { column: 'doing', index: null }), { todo: ['c'] });
  // The item is not in the saved list: nothing to write for the source.
  assert.equal(dropLists(shown, { todo: ['c'] }, { column: 'todo', index: 0 }, 'a', { column: 'doing', index: null }), undefined);
  // Two items share a key: the second shown copy is the second listed one.
  assert.deepEqual(dropLists(shown, { todo: ['b', 'c', 'b'] }, { column: 'todo', index: 2 }, 'b', { column: 'doing', index: null }), { todo: ['b', 'c'] });
  assert.equal(dropLists(shown, { todo: ['b'] }, { column: 'todo', index: 2 }, 'b', { column: 'doing', index: null }), undefined);
  // The last item of a saved list: saved empty, which makes the column automatic again.
  assert.deepEqual(dropLists(shown, { doing: ['x'] }, { column: 'doing', index: 0 }, 'x', { column: 'todo', index: null }), { doing: [] });
  // Within a column nothing leaves.
  assert.deepEqual(dropLists(shown, { todo: ['c', 'a'] }, { column: 'todo', index: 0 }, 'a', { column: 'todo', index: 3 }), { todo: ['b', 'b', 'c', 'a'] });
});

test('a carried card is not counted twice: the copy already in the column is left out of the places', () => {
  const { actions } = recorder();
  const rowAt = (text: string, top: number) => {
    const li = taskRow(rowFor(text, { draggable: true }), actions);
    li.getBoundingClientRect = () => ({ top, left: 0, width: 200, height: 40 }) as DOMRect;
    return li;
  };
  // The column shows Clean the gutters already (middles at 20, 60 and 100); a modal carries the same card out.
  const [first, copy, last] = [rowAt('Book a physio session', 0), rowAt('Clean the gutters', 40), rowAt('Fix the hallway light switch', 80)];
  const carried = rowAt('Clean the gutters', 0);
  assert.equal(carried.dataset.key, copy.dataset.key);
  const list = h('ul', 'brain-col-items', {}, [first, copy, last]);
  const view = h('div', 'brain-view', {}, [h('section', 'brain-col', { 'data-column': 'todo', 'data-arrange': '' }, [list])]);
  const grid = h('ul', 'brain-modal-grid', {}, [carried]);
  const b = listen(grid, list, { zones: view, carryTo: view });
  press(carried, 10);
  fire(grid, 'pointermove', mouse(10, 90));   // below the copy's middle (60), above the last row's (100)
  // Among the others (Book a physio session, Fix the hallway light switch) the slot is second, before the last row.
  assert.deepEqual(order(list), ['Book a physio session', 'Clean the gutters', 'slot', 'Fix the hallway light switch']);
  fire(grid, 'pointerup', mouse(10, 90));
  assert.deepEqual(b.drops, [['Clean the gutters', column('todo', 1)]]);
});

test('a day pick dropped on marks its strip, so only the day beneath shows as picked; the mark goes with the drop', () => {
  const { actions } = recorder();
  const row = taskRow(rowFor('Clean the gutters', { draggable: true, plan: {} }), actions);
  const picked = h('button', 'brain-day-pick', { 'aria-pressed': 'true', 'data-drop': 'day', 'data-date': '2026-10-16' }, [h('span', 'brain-day-num', {}, ['16'])]);
  const pick = h('button', 'brain-day-pick', { 'data-drop': 'day', 'data-date': '2026-10-17' }, [h('span', 'brain-day-num', {}, ['17'])]);
  const strip = h('div', 'brain-picks', {}, [picked, pick]);
  const todo = h('section', 'brain-col', { 'data-column': 'todo', 'data-arrange': '' }, [h('ul', 'brain-col-items', {}, [row])]);
  const root = h('div', 'brain-page', {}, [strip, todo]);
  const b = { root, row, ...listen(root, row) };
  const handle = row.querySelector('.brain-task-text')!;
  b.over(pick.querySelector('.brain-day-num')!);
  fire(handle, 'pointerdown', mouse(10, 10));
  fire(handle, 'pointermove', mouse(300, 300));
  assert.deepEqual([pick.classList.contains('brain-is-drop'), strip.classList.contains('brain-picks-drop')], [true, true]);
  fire(root, 'pointerup', mouse(300, 300));
  assert.deepEqual([pick.classList.contains('brain-is-drop'), strip.classList.contains('brain-picks-drop')], [false, false]);
});

test('cancelDrags ends a lifted drag and a touch still in its long-press: the document listeners go, and no timer lifts', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const b = board({ 'data-states': 'doing waiting' });
  // The keydown and scroll listeners a drag adds to the document, until it removes them.
  const doc = b.row.ownerDocument as unknown as Record<'addEventListener' | 'removeEventListener', (...args: unknown[]) => void>;
  const { addEventListener, removeEventListener } = doc;
  const open = new Set<unknown>();
  doc.addEventListener = (type, fn, opts) => {
    if (type === 'keydown' || type === 'scroll') open.add(fn);
    addEventListener.call(doc, type, fn, opts);
  };
  doc.removeEventListener = (type, fn, opts) => {
    open.delete(fn);
    removeEventListener.call(doc, type, fn, opts);
  };
  t.after(() => {
    doc.addEventListener = addEventListener;
    doc.removeEventListener = removeEventListener;
  });
  press(b.row, 10);
  move(b.row, 30);
  assert.equal(b.row.classList.contains('brain-is-lifted'), true);
  assert.equal(open.size, 2);   // Escape and the scroll that follows the pointer
  cancelDrags();
  assert.equal(open.size, 0);
  assert.equal(b.row.classList.contains('brain-is-lifted'), false);
  assert.deepEqual(b.drops, []);
  // A touch still waiting out its long-press holds a timer: cancelDrags clears it, so nothing lifts when it would have.
  const c = board({ 'data-states': 'doing waiting' });
  fire(c.row.querySelector('.brain-task-text')!, 'pointerdown', { ...mouse(10, 10), pointerType: 'touch' });
  cancelDrags();
  t.mock.timers.tick(500);
  assert.equal(c.row.classList.contains('brain-is-lifted'), false);
  assert.equal(c.row.classList.contains('brain-is-floating'), false);
  assert.deepEqual(c.drops, []);
});

test('cancelDrags(view) ends the drags that land in that view, and leaves another view\'s drag lifted', () => {
  const mine = board({ 'data-states': 'doing waiting' });
  const theirs = board({ 'data-states': 'doing waiting' });
  press(mine.row, 10);
  move(mine.row, 30);
  press(theirs.row, 10);
  move(theirs.row, 30);
  cancelDrags(mine.root);
  assert.equal(mine.row.classList.contains('brain-is-lifted'), false);
  assert.equal(theirs.row.classList.contains('brain-is-lifted'), true);
  cancelDrags(theirs.root);
  assert.equal(theirs.row.classList.contains('brain-is-lifted'), false);
});

test('a drag carried out of a modal ends with the view its drop zones are in, not with the modal it started in', () => {
  const { actions } = recorder();
  const row = taskRow(rowFor('Clean the gutters', { meta: [{ text: 'Home' }, { text: 'Thu' }], draggable: true }), actions);
  const view = h('div', 'brain-view', {}, [h('section', 'brain-col', { 'data-states': 'doing waiting' }, [h('ul', 'brain-col-items')])]);
  const modal = h('ul', 'brain-tiles', {}, [h('li', 'brain-tile', {}, [row])]);
  listen(modal, row, { zones: view });   // the modal's grid is the root; the view's root is where the drop zones are
  press(row, 10);
  move(row, 30);
  assert.equal(row.classList.contains('brain-is-lifted'), true);
  cancelDrags(view);
  assert.equal(row.classList.contains('brain-is-lifted'), false);
});
