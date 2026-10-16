import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DaySpec } from './actions.ts';
import type { EventVM } from '../model/types.ts';
import { fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { renderDayBody } from './day.ts';
import { tickNow } from './schedule.ts';

const appt = (title: string, start: string, end: string, where: string): EventVM => ({ key: title, path: `${title}.md`, title, start, end, where });
const thursday = [
  appt('Gym', '08:00', '09:00', 'Health'), appt('Check-in', '09:30', '10:00', 'Admin'), appt('Call with Bram', '11:30', '12:30', 'Renovate the kitchen'),
  appt('Dentist', '15:00', '15:45', 'Health'),
];
const spec = (over: Partial<DaySpec> = {}): DaySpec => ({
  title: 'Thursday 15 October · 4', events: thursday, now: '10:00', opener: document.createElement('button'), ...over,
});

function body(over: Partial<DaySpec> = {}, host = { close: () => {} }, actions = recorder().actions) {
  const content = document.createElement('div');
  renderDayBody(content, spec(over), actions, host);
  return content;
}

test('day body: the whole day, the finished ones too, as a timeline with the now-line, and the list beside it for a narrow modal', () => {
  const content = body();
  assert.equal(content.classList.contains('brain-view'), true);
  const scroll = content.querySelector(':scope > .brain-day-scroll')!;
  assert.equal(scroll.getAttribute('role'), 'region');
  assert.equal(scroll.getAttribute('aria-label'), 'Thursday 15 October · 4');
  assert.equal(scroll.getAttribute('tabindex'), '0');
  assert.deepEqual([...scroll.children].map((c) => c.className), ['brain-timeline', 'brain-agenda']);   // the CSS shows the timeline, or the list when narrow
  assert.deepEqual([...scroll.querySelectorAll('.brain-timeline .brain-event-title')].map((t) => t.firstChild?.textContent), ['Gym', 'Check-in', 'Call with Bram', 'Dentist']);
  assert.deepEqual([...scroll.querySelectorAll('.brain-agenda-item a')].map((a) => a.textContent), ['Gym', 'Check-in', 'Call with Bram', 'Dentist']);
  assert.equal(scroll.querySelectorAll('.brain-now-line').length, 1);   // 10:00 is inside 07:00–17:00
});

test('day body: no now-line on a day that is not today, and a tick adds none', () => {
  const content = body({ now: undefined });
  assert.equal(content.querySelectorAll('.brain-now-line').length, 0);
  tickNow(content, '10:00');
  assert.equal(content.querySelectorAll('.brain-now-line').length, 0);
});

test('day body: on today the now-line moves with a tick', () => {
  const content = body();
  const line = content.querySelector<HTMLElement>('.brain-now-line')!;
  const before = line.style.getPropertyValue('--brain-at');
  tickNow(content, '12:00');
  assert.notEqual(line.style.getPropertyValue('--brain-at'), before);
  assert.equal(line.querySelector('.brain-sr')?.textContent, 'Now, 12:00');
});

test('day body: an appointment without an end leaves the list alone, at every width', () => {
  const content = body({ events: [{ key: 'k', path: 'a.md', title: 'Errand', start: '' }, ...thursday] });
  assert.deepEqual([...content.querySelector('.brain-day-scroll')!.children].map((c) => c.className), ['brain-agenda']);
});

test('day body: a title closes the modal first, then opens the note', () => {
  const order: string[] = [];
  const base = recorder();
  const content = body({}, { close: () => order.push('close') }, { ...base.actions, open: (path) => void order.push(`open ${path}`) });
  fire(content.querySelector('.brain-timeline .brain-event')!, 'click');
  fire(content.querySelector('.brain-agenda a')!, 'click');
  assert.deepEqual(order, ['close', 'open Gym.md', 'close', 'open Gym.md']);
});
