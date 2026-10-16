import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EventVM } from '../model/types.ts';
import { absent, fire, recorder, same, sampleNote } from '../../test/ui.ts';
import { schedule, scheduleWhole, tickNow, timeline } from './schedule.ts';

function event(name: string, start: string, end: string, where: string): EventVM {
  const path = sampleNote(name).path;
  return { key: path, path, title: name, start, end, where };
}
const dance = event('Dance class', '20:15', '22:15', 'Studio Tempo');          // every Tuesday
const contractorVisit = event('Contractor visit', '17:30', '18:30', 'Home');   // Thu 2026-10-15
const dentist = event('Dentist', '10:00', '10:30', 'Bright Dental');            // Fri 2026-10-16
// The same dentist appointment without a time: the model gives start '' (and no end, no place).
const untimed: EventVM = { key: dentist.key, path: dentist.path, title: 'Dentist', start: '' };

/** A busy day, as the author's options page has it: seven appointments from 08:00 to 21:15, so a timeline of 07:00 to 23:00. */
const busy: EventVM[] = [
  event('Dance class', '08:00', '09:00', 'Health'), event('Dentist', '09:30', '10:00', 'Admin'),
  event('Contractor visit', '11:30', '12:30', 'Renovate the kitchen'), event('Dance class', '13:00', '14:00', 'Friends'),
  event('Dentist', '15:00', '15:45', 'Health'), event('Contractor visit', '17:30', '18:30', 'Home'), event('Dance class', '20:15', '21:15', 'Dance'),
];

const tools = (tile: Element) => [...tile.querySelectorAll('.brain-label-row .brain-tools > button')];

test('schedule: Dance class 20:15–22:15 fits 19:00–24:00, a block a quarter down and 0.4 long', () => {
  const { actions, calls } = recorder();
  const tile = schedule([dance], actions);
  assert.equal(tile.tagName, 'SECTION');
  assert.equal(tile.className, 'brain-tile brain-area-sched');
  // A day that fits the window has nothing to scroll: the timeline stands on its own.
  assert.deepEqual([...tile.children].map((c) => c.className), ['brain-label-row', 'brain-timeline', 'brain-agenda']);
  assert.equal(tile.querySelector('h3.brain-label')?.textContent, 'Schedule');
  assert.equal(tile.querySelector('.brain-count')?.textContent, '1');

  const timeline = tile.querySelector<HTMLElement>('.brain-timeline')!;
  assert.equal(timeline.style.getPropertyValue('--brain-hours'), '5');
  const hours = [...timeline.querySelectorAll<HTMLElement>('.brain-hour')];
  assert.deepEqual(hours.map((hr) => [hr.textContent, hr.style.getPropertyValue('--brain-at')]), [
    ['19', '0'], ['20', '0.2'], ['21', '0.4'], ['22', '0.6'], ['23', '0.8'], ['00', '1'],
  ]);
  assert.equal(hours.every((hr) => hr.getAttribute('aria-hidden') === 'true'), true);

  const block = timeline.querySelector<HTMLElement>('a.brain-event')!;
  assert.equal(block.style.getPropertyValue('--brain-at'), '0.25');
  assert.equal(block.style.getPropertyValue('--brain-len'), '0.4');
  fire(block, 'click');
  assert.deepEqual(calls, [['open', dance.path, undefined]]);

  const item = tile.querySelector('ol.brain-agenda > li.brain-agenda-item')!;
  assert.equal(item.querySelector('time.brain-agenda-time')?.getAttribute('datetime'), '20:15');
  assert.equal(item.querySelector('a')?.className, 'brain-link brain-stretch');
  assert.equal(item.querySelector('.brain-agenda-where')?.textContent, 'Studio Tempo');
});

test('schedule: Contractor visit 17:30–18:30 fits 16:00–20:00', () => {
  const timeline = schedule([contractorVisit], recorder().actions).querySelector<HTMLElement>('.brain-timeline')!;
  assert.equal(timeline.style.getPropertyValue('--brain-hours'), '4');
  assert.deepEqual([...timeline.querySelectorAll('.brain-hour')].map((hr) => hr.textContent), ['16', '17', '18', '19', '20']);
  const block = timeline.querySelector<HTMLElement>('.brain-event')!;
  assert.equal(block.style.getPropertyValue('--brain-at'), '0.375');
  assert.equal(block.style.getPropertyValue('--brain-len'), '0.25');
});

test('event text: the title on line one, the time and place on line two, one line, with the full text on hover', () => {
  const block = schedule([contractorVisit], recorder().actions).querySelector('.brain-event')!;
  assert.deepEqual([...block.children].map((s) => [s.className, s.textContent]), [
    ['brain-event-title', 'Contractor visit · 17:30'],   // the start is there for Compact, which shows it in a short block
    ['brain-event-meta', '17:30–18:30 · Home'],
  ]);
  assert.equal(block.querySelector('.brain-event-title > .brain-start')?.textContent, ' · 17:30');
  assert.equal(block.getAttribute('title'), 'Contractor visit · 17:30–18:30 · Home');
  assert.equal(block.getAttribute('aria-label'), 'Contractor visit, 17:30–18:30, Home');
});

test('event text: an appointment without a place has its time alone on line two', () => {
  const block = schedule([{ ...dance, where: undefined }], recorder().actions).querySelector('.brain-event')!;
  assert.equal(block.querySelector('.brain-event-meta')?.textContent, '20:15–22:15');
  assert.equal(block.getAttribute('aria-label'), 'Dance class, 20:15–22:15');
});

test('schedule: a 30-minute Dentist is a block of its own, the time and place left for its second line', () => {
  const tile = schedule([dentist], recorder().actions);
  assert.equal(tile.querySelectorAll('.brain-timeline .brain-event').length, 1);
  assert.equal(tile.querySelector<HTMLElement>('.brain-event')!.style.getPropertyValue('--brain-len'), '0.1667');   // 30 of 180 minutes, 09:00–12:00
});

test('schedule: an appointment without a time is listed with no time element, and there is no timeline', () => {
  const { actions, calls } = recorder();
  const tile = schedule([untimed], actions);
  assert.equal(tile.querySelector('.brain-count')?.textContent, '1');
  assert.equal(tile.querySelector('.brain-timeline')?.outerHTML, undefined);
  const item = tile.querySelector('.brain-agenda > li')!;
  assert.equal(item.className, 'brain-agenda-item');
  assert.equal(item.querySelector('time')?.outerHTML, undefined);
  assert.deepEqual([...item.children].map((c) => [c.tagName, c.textContent]), [['A', 'Dentist']]);
  assert.doesNotMatch(tile.outerHTML, /NaN|datetime=""/);
  fire(item.querySelector('a')!, 'click');
  assert.deepEqual(calls, [['open', untimed.path, undefined]]);
});

test('schedule: one untimed event next to a timed one keeps every event in the list, untimed first, with no timeline', () => {
  const tile = schedule([untimed, dance], recorder().actions);
  assert.equal(tile.querySelector('.brain-timeline')?.outerHTML, undefined);   // the list shows at every width, so nothing is lost
  assert.deepEqual([...tile.querySelectorAll('.brain-agenda-item')].map((li) => [li.querySelector('time')?.textContent ?? null, li.querySelector('a')?.textContent]),
    [[null, 'Dentist'], ['20:15', 'Dance class']]);
  assert.doesNotMatch(tile.outerHTML, /NaN|datetime=""/);
  assert.deepEqual(tools(tile), [], 'no timeline to switch, so no buttons');
});

test('schedule: no events, a count of 0 and "No appointments", and no buttons', () => {
  const tile = schedule([], recorder().actions);
  assert.equal(tile.querySelector('.brain-count')?.textContent, '0');
  absent(tile.querySelector('.brain-timeline'));
  assert.deepEqual([...tile.querySelector('.brain-agenda')!.children].map((li) => [li.className, li.textContent]),
    [['brain-empty', 'No appointments']]);
  assert.deepEqual(tools(tile), []);
});

test('Large, a short day: the switch reads Compact and says it switches there; there is no Whole day', () => {
  const { actions, calls } = recorder();
  const tile = schedule([dance], actions, { view: 'large' });
  const [switcher, ...rest] = tools(tile);
  assert.deepEqual(rest, []);
  assert.equal(switcher.textContent, 'Compact');
  assert.equal(switcher.getAttribute('aria-label'), 'Switch to the Compact view');
  assert.equal(switcher.className, 'brain-quiet');
  fire(switcher, 'click');
  assert.deepEqual(calls, [['scheduleView', 'compact']]);
});

test('Large, a busy day: the day scrolls in a window, with fades, Whole day and the switch in the label row', () => {
  const tile = schedule(busy, recorder().actions, { now: '11:10' });
  assert.equal(tile.className, 'brain-tile brain-area-sched');
  assert.deepEqual([...tile.children].map((c) => c.className), ['brain-label-row', 'brain-scroll', 'brain-agenda']);
  assert.deepEqual([...tile.querySelector('.brain-label-row')!.children].map((c) => c.className), ['brain-label', 'brain-count', 'brain-tools']);
  assert.equal(tile.querySelector('.brain-count')?.textContent, '7');
  assert.deepEqual(tools(tile).map((b) => [b.textContent, b.getAttribute('aria-expanded'), b.getAttribute('aria-label')]), [
    ['Whole day', 'false', null],
    ['Compact', null, 'Switch to the Compact view'],
  ]);
  const scroller = tile.querySelector<HTMLElement>('.brain-scroll')!;
  assert.equal(scroller.getAttribute('tabindex'), '0');
  assert.equal(scroller.getAttribute('role'), 'region');
  assert.equal(scroller.getAttribute('aria-label'), 'Schedule, scrolls');
  assert.equal(scroller.style.getPropertyValue('--brain-hours'), '16');
  assert.deepEqual([...scroller.children].map((c) => c.className), ['brain-fade brain-fade-top', 'brain-timeline', 'brain-fade brain-fade-bottom']);
  assert.equal(scroller.querySelectorAll('.brain-event').length, 7);
  // 07:00 to 23:00, and the now-line at 11:10: 250 of 960 minutes in.
  assert.equal(scroller.querySelector<HTMLElement>('.brain-now-line')!.style.getPropertyValue('--brain-at'), '0.2604');
});

test('Whole day grows the window to the day and reads Fit; Fit folds it back', () => {
  const tile = schedule(busy, recorder().actions);
  const scroller = tile.querySelector('.brain-scroll')!;
  const [whole] = tools(tile);
  fire(whole, 'click');
  assert.equal(scroller.classList.contains('brain-is-whole'), true);
  assert.deepEqual([whole.textContent, whole.getAttribute('aria-expanded'), whole.getAttribute('aria-label')], ['Fit', 'true', 'Fit to 6 hours']);
  assert.equal(whole.getAttribute('data-key'), 'whole-day', 'keyed, so a redraw keeps the focus on it');
  fire(whole, 'click');
  assert.equal(scroller.classList.contains('brain-is-whole'), false);
  assert.deepEqual([whole.textContent, whole.getAttribute('aria-expanded'), whole.getAttribute('aria-label')], ['Whole day', 'false', null]);
});

test('the Large window fades the edges that have more beyond them, and the fades follow the scroll', () => {
  const tile = schedule(busy, recorder().actions, { now: '11:10' });
  const scroller = tile.querySelector<HTMLElement>('.brain-scroll')!;
  Object.defineProperties(scroller, { scrollHeight: { value: 600 }, clientHeight: { value: 288 } });   // linkedom has no layout
  const at = (top: number) => {
    scroller.scrollTop = top;
    fire(scroller, 'scroll');
    return [scroller.hasAttribute('data-above'), scroller.hasAttribute('data-below')];
  };
  assert.deepEqual(at(0), [false, true]);
  assert.deepEqual(at(150), [true, true]);
  assert.deepEqual(at(312), [true, false]);
});

test('Fit folds the window back, and after the height transition it scrolls the window to now', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const tile = schedule(busy, recorder().actions, { now: '11:10' });
  const scroller = tile.querySelector<HTMLElement>('.brain-scroll')!;
  const timeline = scroller.querySelector<HTMLElement>('.brain-timeline')!;
  const line = scroller.querySelector<HTMLElement>('.brain-now-line')!;
  Object.defineProperties(scroller, { clientHeight: { value: 288 } });
  Object.defineProperties(timeline, { offsetHeight: { value: 960 } });   // 16 hours at 60px
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  line.getBoundingClientRect = () => ({ top: 200 }) as DOMRect;
  scroller.scrollTop = 0;
  const [whole] = tools(tile);
  fire(whole, 'click');   // Fit: grown, nothing to scroll to yet
  assert.equal(scroller.scrollTop, 0);
  fire(whole, 'click');   // Whole day again: folded, and the scroll waits out the transition
  assert.equal(scroller.scrollTop, 0);
  t.mock.timers.tick(320);
  assert.equal(scroller.scrollTop, 140);   // the now-line 200px down, less the hour above it (60px)
});

test('Whole day is remembered by the page: a redraw with whole set starts open, and scheduleWhole reads it', () => {
  const root = document.createElement('div');
  root.append(schedule(busy, recorder().actions));
  assert.equal(scheduleWhole(root), false);
  fire(root.querySelector('.brain-tools > button')!, 'click');
  assert.equal(scheduleWhole(root), true);
  const again = schedule(busy, recorder().actions, { whole: true });
  assert.equal(again.querySelector('.brain-scroll')?.classList.contains('brain-is-whole'), true);
  assert.equal(again.querySelector('.brain-tools > button')?.textContent, 'Fit');
});

test('Compact: the whole day in the window, no scroller, no Whole day, and the switch reads Large', () => {
  const { actions, calls } = recorder();
  const tile = schedule(busy, actions, { view: 'compact', now: '11:10' });
  assert.equal(tile.className, 'brain-tile brain-area-sched brain-is-compact');
  assert.deepEqual([...tile.children].map((c) => c.className), ['brain-label-row', 'brain-timeline', 'brain-agenda']);
  assert.equal(tile.querySelectorAll('.brain-scroll').length, 0);
  assert.deepEqual(tools(tile).map((b) => [b.textContent, b.getAttribute('aria-label')]), [['Large', 'Switch to the Large view']]);
  const timeline = tile.querySelector<HTMLElement>('.brain-timeline')!;
  assert.equal(timeline.style.getPropertyValue('--brain-hours'), '16');
  assert.equal(timeline.querySelectorAll('.brain-event').length, 7);
  assert.equal(timeline.querySelectorAll('.brain-now-line').length, 1);
  fire(tools(tile)[0], 'click');
  assert.deepEqual(calls, [['scheduleView', 'large']]);
});

test('Compact: a day that fits the window is drawn as Large draws it, but in the compact form', () => {
  const tile = schedule([dance], recorder().actions, { view: 'compact' });
  assert.equal(tile.classList.contains('brain-is-compact'), true);
  assert.deepEqual(tools(tile).map((b) => b.textContent), ['Large']);
});

test('the now-line: drawn inside the day, none outside it, and tickNow moves it without a redraw', () => {
  const tile = schedule(busy, recorder().actions, { now: '11:10' });
  const line = () => tile.querySelector<HTMLElement>('.brain-now-line');
  assert.equal(line()?.querySelector('.brain-sr')?.textContent, 'Now, 11:10');
  const first = line()!;
  tickNow(tile, '12:30');
  same(line(), first, 'the same element moves');
  assert.equal(first.style.getPropertyValue('--brain-at'), '0.3438');   // 330 of 960 minutes
  assert.equal(first.querySelector('.brain-sr')?.textContent, 'Now, 12:30');
  tickNow(tile, '23:30');
  absent(line(), 'after the day it is gone');
  tickNow(tile, '07:30');
  assert.ok(line(), 'and it comes back when the clock is inside the day');
  // Dance class alone spans 19:00–24:00: at 11:10 now is not in it.
  absent(schedule([dance], recorder().actions, { now: '11:10' }).querySelector('.brain-now-line'));
  // Without a clock there is no line at all, and a tick leaves the timeline alone.
  const plain = schedule(busy, recorder().actions);
  tickNow(plain, '11:10');
  absent(plain.querySelector('.brain-now-line'));
});

/** A timed appointment with a title of its own (the sample has no such note): for the overlap tests. */
const timed = (title: string, start: string, end: string): EventVM => ({ key: dentist.key, path: dentist.path, title, start, end });

test('overlap: appointments that overlap in time share the width, one lane each, and touching ones keep the full width', () => {
  const tile = schedule([
    timed('Lunch with Ana', '13:00', '14:00'), timed('Double booked', '13:00', '14:00'), timed('Overlap C', '13:30', '14:30'),
    timed('Walk', '09:00', '10:00'), timed('Next', '10:00', '11:00'),
  ], recorder().actions, { now: '11:10' });
  const lanes = [...tile.querySelectorAll<HTMLElement>('.brain-event')].map((b) => [
    b.getAttribute('aria-label')!.split(',')[0], b.style.getPropertyValue('--brain-lane'), b.style.getPropertyValue('--brain-lanes'),
  ]);
  assert.deepEqual(lanes, [
    ['Lunch with Ana', '0', '3'], ['Double booked', '1', '3'], ['Overlap C', '2', '3'],
    ['Walk', '0', '1'], ['Next', '0', '1'],
  ]);
  // The day modal draws the same timeline, so it shares the lanes.
  const modal = timeline([timed('A', '13:00', '14:00'), timed('B', '13:30', '14:30')], recorder().actions)!;
  assert.deepEqual([...modal.querySelectorAll<HTMLElement>('.brain-event')].map((b) => b.style.getPropertyValue('--brain-lane')), ['0', '1']);
});
