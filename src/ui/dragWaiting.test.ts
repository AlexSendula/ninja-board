import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RowVM } from '../model/types.ts';
import { noteRow } from '../model/rows.ts';
import { fire, recorder, sampleNote } from '../../test/ui.ts';
import { h } from './dom.ts';
import { enableDrag } from './drag.ts';
import type { DropTarget } from './drag.ts';
import { taskRow } from './task.ts';

const TODAY = '2026-10-13';
const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y });
const alt = (key: string) => ({ key, altKey: true });
const column = (name: string, index: number | null = null): DropTarget => ({ kind: 'column', column: name, index });
const titleOf = (item: Element) => item.querySelector('.brain-task-text, .brain-card-title')?.textContent;

/** A row that sits where its top says: linkedom has no layout, so the drag's middles come from here. */
function placed(li: HTMLLIElement, top: number): HTMLLIElement {
  li.getBoundingClientRect = () => ({ top, left: 0, width: 200, height: 40 }) as DOMRect;
  Object.defineProperty(li, 'offsetHeight', { value: 40 });
  return li;
}

function rowVM(title: string, state: RowVM['state'], extra: Partial<RowVM> = {}): RowVM {
  return { key: title, target: { kind: 'note', path: `${title}.md`, state }, title, state, meta: [], repeating: false, draggable: true, ariaLabel: title, ...extra };
}

/**
 * The Week board in Group view, as the plugin draws it: Doing's own list, then Waiting as its own column (the CSS
 * puts it under Doing, in row 2), and Done beside them. The pointer is over whatever `over` last named.
 */
function groupBoard(opts: { empty?: boolean } = {}) {
  const { actions } = recorder();
  const row = (title: string, state: RowVM['state'], top: number) => placed(taskRow(rowVM(title, state), actions), top);
  const doingRows = [row('Build the homepage header', 'doing', 0), row('Compare prices', 'doing', 40)];
  const waitingRows = [row('Get the written quote from Bram', 'waiting', 200), row('Get the logo files from Sam', 'waiting', 240)];
  const doingList = h('ul', 'brain-col-items', {}, doingRows);
  const waitingList = h('ul', 'brain-col-items', {}, opts.empty ? [h('li', 'brain-empty', {}, ['Nothing waiting'])] : waitingRows);
  const doing = h('section', 'brain-col', { 'data-column': 'doing', 'data-states': 'doing', 'data-arrange': '' }, [doingList]);
  const waiting = h('section', 'brain-col', { 'data-column': 'waiting', 'data-states': 'waiting', 'data-arrange': '' }, [
    h('div', 'brain-label-row', {}, [h('h4', 'brain-group-name', {}, ['Waiting on · 2'])]),
    waitingList,
  ]);
  const done = h('section', 'brain-col', { 'data-column': 'done', 'data-states': 'done' }, [h('ul', 'brain-col-items', {}, [row('Clean the gutters', 'done', 0)])]);
  const root = h('div', 'brain-board brain-board-week', { 'data-waiting': 'group' }, [doing, waiting, done]);
  let under: Element = doingList;
  Object.assign(root.ownerDocument, { elementFromPoint: () => under });
  root.setPointerCapture = () => {};
  const drops: [string | null | undefined, DropTarget][] = [];
  enableDrag(root, (item, target) => { drops.push([titleOf(item), target]); });
  return {
    root, doing, waiting, doingList, waitingList, doingRows, waitingRows, done, drops,
    over: (el: Element) => { under = el; },
  };
}

test('Waiting is a drop zone beside Doing: a Doing row over it tints Waiting, not Doing, and drops as waiting at its place', () => {
  const b = groupBoard();
  const title = b.doingRows[0].querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  b.over(b.waitingList);
  fire(title, 'pointermove', mouse(10, 230));
  assert.equal(b.waiting.classList.contains('brain-is-drop'), true);
  assert.equal(b.doing.classList.contains('brain-is-drop'), false);
  fire(b.root, 'pointerup', mouse(10, 230));
  assert.deepEqual(b.drops, [['Build the homepage header', column('waiting', 1)]]);
});

test('a drop on Doing\'s own rows is a doing drop with Doing\'s places: Waiting\'s rows are not counted', () => {
  const b = groupBoard();
  const title = b.waitingRows[0].querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 210));
  b.over(b.doingList);
  fire(title, 'pointermove', mouse(10, 70));   // below Doing's two rows, above Waiting
  assert.equal(b.waiting.classList.contains('brain-is-drop'), false);
  assert.equal(b.doing.classList.contains('brain-is-drop'), true);
  fire(b.root, 'pointerup', mouse(10, 70));
  assert.deepEqual(b.drops, [['Get the written quote from Bram', column('doing', 2)]]);
});

test('the slot follows the pointer into Waiting: it sits in Waiting\'s list, and none is left in Doing\'s', () => {
  const b = groupBoard();
  const title = b.doingRows[1].querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 50));
  b.over(b.waitingList);
  fire(title, 'pointermove', mouse(10, 250));
  const slot = b.waitingList.querySelector(':scope > .brain-drop-slot');
  assert.equal(slot !== null, true);
  assert.equal(slot?.parentElement === b.waitingList, true);
  assert.equal(b.doingList.querySelector(':scope > .brain-drop-slot') === null, true);
  fire(b.root, 'pointerup', mouse(10, 250));
  assert.deepEqual(b.drops, [['Compare prices', column('waiting', 1)]]);
});

test('an empty Waiting still takes a drop: a row over it lands at its first place', () => {
  const b = groupBoard({ empty: true });
  const title = b.doingRows[0].querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 10));
  b.over(b.waitingList);
  fire(title, 'pointermove', mouse(10, 230));
  assert.equal(b.waiting.classList.contains('brain-is-drop'), true);
  fire(b.root, 'pointerup', mouse(10, 230));
  assert.deepEqual(b.drops, [['Build the homepage header', column('waiting', 0)]]);
});

test('Alt+↓ moves a waiting row one place inside Waiting; Alt+↑ on its first place does nothing', () => {
  const b = groupBoard();
  fire(b.waitingRows[0], 'keydown', alt('ArrowUp'));
  fire(b.waitingRows[0], 'keydown', alt('ArrowDown'));
  assert.deepEqual(b.drops, [['Get the written quote from Bram', column('waiting', 1)]]);
});

test('Alt+↓ on Doing\'s last row does nothing: Waiting is not Doing\'s next place', () => {
  const b = groupBoard();
  fire(b.doingRows[1], 'keydown', alt('ArrowDown'));
  assert.deepEqual(b.drops, []);
});

test('a repeating row in Waiting drags out like any row: Doing tints, and a drop there is a state change', () => {
  const b = groupBoard();
  const dentist = placed(taskRow({ ...noteRow(sampleNote('Dentist checkup'), TODAY), draggable: true }, recorder().actions), 280);
  b.waitingList.append(dentist);
  const title = dentist.querySelector('.brain-task-text')!;
  fire(title, 'pointerdown', mouse(10, 280));
  b.over(b.doingList);
  fire(title, 'pointermove', mouse(10, 60));
  assert.equal(b.doing.classList.contains('brain-is-drop'), true);
  fire(b.root, 'pointerup', mouse(10, 60));
  assert.deepEqual(b.drops.map((d) => d[0]), ['Dentist checkup']);
  assert.equal(b.drops[0]?.[1]?.kind, 'column');
});
