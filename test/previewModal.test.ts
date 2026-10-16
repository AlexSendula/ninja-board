import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, recorder } from './ui.ts';   // first: it installs the DOM
import { h } from '../src/ui/dom.ts';
import { buildProjects } from '../src/model/projects.ts';
import { loadSample } from './sample.ts';
import { openDayModal, openListModal } from '../preview/modal.ts';
import type { ListSpec } from '../src/ui/actions.ts';

const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y });
const someday = buildProjects(loadSample(), '2026-10-13').columns.find((c) => c.status === 'someday')?.cards ?? [];

test('the preview modal: a re-render during a carry, then Escape, ends the carry and the modal can close', (t) => {
  // The preview's modal is browser code: it reads window and HTMLElement.
  Object.assign(globalThis, { window: document.defaultView, HTMLElement: document.defaultView?.HTMLElement });
  const stage = h('div', 'stage');
  document.body.append(stage);
  t.after(() => stage.remove());
  const zones = h('div', 'brain-view');
  const column = h('section', 'brain-col', { 'data-column': 'active', 'data-arrange': '' }, [h('ul', 'brain-col-items')]);
  zones.append(column);
  stage.append(zones);
  const spec: ListSpec = {
    key: 'someday', title: 'Someday', noun: 'someday projects', count: someday.length,
    entries: someday.map((card) => ({ kind: 'card', card })), drag: true, zones,
  };
  Object.assign(document, { elementFromPoint: () => column.querySelector('.brain-col-items') });
  t.after(() => { delete (document as unknown as Record<string, unknown>).elementFromPoint; });

  const handle = openListModal(stage, spec, recorder().actions);
  const container = stage.querySelector<HTMLElement>('.modal-container');
  const grid = stage.querySelector<HTMLElement>('.brain-modal-grid');
  const card = grid?.querySelector<HTMLElement>(':scope > li.brain-card');
  assert.ok(container && grid && card);
  grid.setPointerCapture = () => {};

  fire(card, 'pointerdown', mouse(10, 10));
  fire(grid, 'pointermove', mouse(10, 40));
  assert.equal(container.style.visibility, 'hidden');
  handle.update(spec);   // the view re-rendered while the card is out
  fire(document.body, 'keydown', { key: 'Escape' });
  assert.equal(container.style.visibility, '');   // the carry ended: the modal is back
  assert.equal(handle.isOpen(), true);
  assert.equal(grid.querySelectorAll(':scope > li.brain-card').length, someday.length);
  fire(document.body, 'keydown', { key: 'Escape' });
  assert.equal(handle.isOpen(), false);
});

test('the preview day modal: the title, the whole day, Escape and the × close it, and the focus goes back to the button', async (t) => {
  Object.assign(globalThis, { window: document.defaultView, HTMLElement: document.defaultView?.HTMLElement });
  const stage = h('div', 'stage', {}, [h('div', 'mock-frame')]);
  document.body.append(stage);
  t.after(() => stage.remove());
  const frame = stage.querySelector<HTMLElement>('.mock-frame')!;
  const opener = h('button', 'brain-quiet', { 'data-key': 'more:2026-10-15' }, ['+4 more']);
  frame.append(opener);
  const focused: unknown[] = [];
  opener.focus = (options) => void focused.push(options);
  const events = [
    { key: 'a', path: 'a.md', title: 'Gym', start: '08:00', end: '09:00', where: 'Health' },
    { key: 'b', path: 'b.md', title: 'Dentist', start: '15:00', end: '15:45', where: 'Health' },
  ];
  const spec = { title: 'Thursday 15 October · 2', events, now: '11:10', opener };

  openDayModal(stage, spec, recorder().actions);
  assert.equal(stage.querySelector('.modal-title')?.textContent, 'Thursday 15 October · 2');
  assert.ok(stage.querySelector('.modal.brain-day-modal > .modal-content.brain-view > .brain-day-scroll'));
  assert.equal(stage.querySelectorAll('.brain-day-scroll .brain-event').length, 2);
  assert.equal(frame.inert, true);
  fire(document.body, 'keydown', { key: 'Escape' });
  absent(stage.querySelector('.modal-container'));
  assert.equal(frame.inert, false);
  await new Promise((resolve) => setTimeout(resolve, 0));   // the focus goes back once the modal is gone, as DayModal does it
  assert.deepEqual(focused, [{ preventScroll: true }]);

  openDayModal(stage, spec, recorder().actions);
  fire(stage.querySelector('.modal-close-button')!, 'click');
  absent(stage.querySelector('.modal-container'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(focused.length, 2);
});
