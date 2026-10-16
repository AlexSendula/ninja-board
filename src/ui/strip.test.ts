import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayVM, EventVM } from '../model/types.ts';
import { weekdayLong } from '../model/dates.ts';
import { absent, fire, recorder, same, sampleNote } from '../../test/ui.ts';
import { weekStrip } from './strip.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample, readSample } from '../../test/sample.ts';

const TODAY = '2026-10-13';

function event(name: string, start: string, end: string, where: string): EventVM {
  const path = sampleNote(name).path;
  return { key: path, path, title: name, start, end, where };
}
const dance = event('Dance class', '20:15', '22:15', 'Studio Tempo');          // every Tuesday
const contractorVisit = event('Contractor visit', '17:30', '18:30', 'Home');   // Thu 2026-10-15
const dentist = event('Dentist', '10:00', '10:30', 'Bright Dental');            // Fri 2026-10-16
// The same dentist appointment without a time: the model gives start '' (and no end, no place).
const untimed: EventVM = { key: dentist.key, path: dentist.path, title: 'Dentist', start: '' };

function day(iso: string, events: EventVM[], planned: number, due = 0): DayVM {
  const long = weekdayLong(iso);
  return {
    iso, weekdayShort: long.slice(0, 3), initial: long[0], dayNum: Number(iso.slice(8)),
    isToday: iso === TODAY, isPast: iso < TODAY, events, planned, due, done: 0,
  };
}

// Week 42. Planned and due per day, from the sample: Tue the homepage header (planned) and the hallway
// switch (due); Wed compare prices (planned); Thu the gutters and the chase of Bram's quote (planned);
// Fri the dentist checkup (due); Sat the hosting options (due); Sun the energy contracts (planned).
const week = [
  day('2026-10-12', [], 0),
  day('2026-10-13', [dance], 1, 1),
  day('2026-10-14', [], 1),
  day('2026-10-15', [contractorVisit], 2),
  day('2026-10-16', [dentist], 0, 1),
  day('2026-10-17', [], 0, 1),
  day('2026-10-18', [], 1),
];

test('week strip: seven day columns, today marked, appointment chips and task counts', () => {
  const { actions, calls } = recorder();
  const strip = weekStrip(week, actions);
  assert.equal(strip.tagName, 'SECTION');
  assert.equal(strip.className, 'brain-tile brain-strip');
  assert.deepEqual([...strip.children].map((c) => c.className), ['brain-days', 'brain-picks', 'brain-agenda brain-strip-agenda']);

  const days = strip.querySelector('ol.brain-days')!;
  assert.equal(days.getAttribute('aria-label'), 'Days of week 42');
  const cols = [...days.children];
  assert.deepEqual(cols.map((c) => c.className), [
    'brain-day brain-is-past', 'brain-day brain-is-today', 'brain-day', 'brain-day', 'brain-day', 'brain-day', 'brain-day',
  ]);
  assert.equal(cols[1].getAttribute('aria-current'), 'date');
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-label')?.textContent), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-day-num')?.textContent), ['12', '13', '14', '15', '16', '17', '18']);
  // The count is a plain span for the planned part and a red span for the due part; the CSS draws the · between.
  const counts = (col: Element) => [...(col.querySelector('.brain-day-count')?.children ?? [])]
    .map((s) => [s.tagName, s.textContent, s.getAttribute('data-when')]);
  assert.deepEqual(cols.map(counts), [
    [],
    [['SPAN', '1 planned', null], ['SPAN', '1 due', 'due']],
    [['SPAN', '1 planned', null]],
    [['SPAN', '2 planned', null]],
    [['SPAN', '1 due', 'due']],
    [['SPAN', '1 due', 'due']],
    [['SPAN', '1 planned', null]],
  ]);
  assert.equal(cols[1].querySelector('.brain-day-count')?.className, 'brain-day-count brain-meta');

  const chip = cols[1].querySelector('ul.brain-day-events > li.brain-chip')!;
  assert.equal(chip.querySelector('.brain-chip-time')?.textContent, '20:15');
  const title = chip.querySelector('a')!;
  assert.equal(title.className, 'brain-chip-title brain-link brain-stretch');
  assert.equal(title.textContent, 'Dance class');
  absent(cols[0].querySelector('.brain-day-events'));
  fire(title, 'click');
  assert.deepEqual(calls, [['open', dance.path, undefined]]);
});

test('week strip, compact: seven day buttons, today pressed, a dot where something is on', () => {
  const strip = weekStrip(week, recorder().actions);
  const group = strip.querySelector('.brain-picks')!;
  assert.equal(group.getAttribute('role'), 'group');
  assert.equal(group.getAttribute('aria-label'), 'Days of week 42');
  const picks = [...group.children];
  assert.deepEqual(picks.map((p) => p.className), [
    'brain-day-pick brain-is-past', 'brain-day-pick brain-is-today', 'brain-day-pick', 'brain-day-pick',
    'brain-day-pick', 'brain-day-pick', 'brain-day-pick',
  ]);
  assert.deepEqual(picks.map((p) => p.getAttribute('aria-pressed')), ['false', 'true', 'false', 'false', 'false', 'false', 'false']);
  assert.equal(picks[1].getAttribute('aria-current'), 'date');
  assert.deepEqual(picks.map((p) => p.getAttribute('data-date')), week.map((d) => d.iso));
  assert.deepEqual(picks.map((p) => p.getAttribute('aria-label')), [
    'Monday 12', 'Tuesday 13, 1 planned and 1 due', 'Wednesday 14, 1 planned',
    'Thursday 15, 2 planned', 'Friday 16, 1 due',
    'Saturday 17, 1 due', 'Sunday 18, 1 planned',
  ]);
  assert.deepEqual(picks.map((p) => p.querySelector('.brain-label')?.textContent), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.deepEqual(picks.map((p) => p.querySelector('.brain-day-dot') !== null), [false, true, true, true, true, true, true]);
});

test('picking a day lists its appointments beneath, or "No appointments"', () => {
  const strip = weekStrip(week, recorder().actions);
  const picks = [...strip.querySelectorAll('.brain-day-pick')];
  assert.equal(picks[0].getAttribute('data-key'), `pick:${picks[0].getAttribute('data-date')}`);
  const agenda = strip.querySelector('.brain-strip-agenda')!;
  assert.equal(agenda.getAttribute('aria-live'), 'polite');
  const items = () => [...agenda.children].map((li) => [li.className, li.querySelector('time')?.textContent, li.querySelector('a')?.textContent]);
  assert.deepEqual(items(), [['brain-agenda-item', '20:15', 'Dance class']]);

  fire(picks[3], 'click');
  assert.deepEqual(picks.map((p) => p.getAttribute('aria-pressed')), ['false', 'false', 'false', 'true', 'false', 'false', 'false']);
  assert.deepEqual(items(), [['brain-agenda-item', '17:30', 'Contractor visit']]);

  fire(picks[2], 'click');
  assert.deepEqual([...agenda.children].map((li) => [li.className, li.textContent]), [['brain-empty', 'No appointments']]);
});

test('week strip: an appointment without a time is a chip and an agenda line with no time element', () => {
  const strip = weekStrip([...week.slice(0, 4), day('2026-10-16', [untimed, dentist], 0, 1), ...week.slice(5)], recorder().actions);
  assert.doesNotMatch(strip.outerHTML, /NaN|datetime=""/);
  const chips = [...strip.querySelectorAll('.brain-days li.brain-chip')].filter((c) => c.querySelector('a')?.textContent === 'Dentist');
  assert.deepEqual(chips.map((c) => [...c.children].map((x) => x.className)), [
    ['brain-chip-title brain-link brain-stretch'],                          // untimed: the title alone
    ['brain-chip-time', 'brain-chip-title brain-link brain-stretch'],       // timed: time, then the title
  ]);

  // The picked day's list.
  fire(strip.querySelectorAll('.brain-day-pick')[4], 'click');
  const items = [...strip.querySelectorAll('.brain-strip-agenda > li')].map((li) => [li.querySelector('time')?.textContent ?? null, li.querySelector('a')?.textContent]);
  assert.deepEqual(items, [[null, 'Dentist'], ['10:00', 'Dentist']]);
});

test("week strip, a past week: each day's done count, also in the pick's label and dot", () => {
  const plan = readSample().find((n) => n.path === '08 Weeks/2026/2026-W41.md');
  const w41 = buildWeek(loadSample(), TODAY, { start: '2026-10-05', plan });
  const strip = weekStrip(w41.days, recorder().actions, { record: true });
  const cols = [...strip.querySelectorAll('ol.brain-days > li')];
  assert.deepEqual(cols.map((c) => c.querySelector('.brain-day-count')?.textContent ?? ''), ['', '2 done', '', '1 done', '1 done', '', '1 done']);
  // A done count is plain: no meta class and no screen-reader text.
  assert.equal(cols[1].querySelector('.brain-day-count')?.className, 'brain-day-count');
  assert.equal(strip.querySelectorAll('.brain-day-count .brain-sr').length, 0);
  // The record's appointments, each with its note.
  assert.deepEqual(cols.map((c) => [...c.querySelectorAll('.brain-chip a')].map((a) => a.textContent)),
    [[], ['Dance class'], [], ['Kitchen showroom'], [], [], []]);
  const picks = [...strip.querySelectorAll('.brain-day-pick')];
  assert.deepEqual(picks.map((p) => p.getAttribute('aria-label')), [
    'Monday 5', 'Tuesday 6, 2 done', 'Wednesday 7', 'Thursday 8, 1 done', 'Friday 9, 1 done', 'Saturday 10', 'Sunday 11, 1 done',
  ]);
  assert.deepEqual(picks.map((p) => p.querySelector('.brain-day-dot') !== null), [false, true, false, true, true, false, true]);
  // No day is today, so the first is picked.
  assert.deepEqual(picks.map((p) => p.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false', 'false', 'false', 'false']);
});

test('week strip: an appointment whose note is gone is plain text, in the chip and in the list', () => {
  const { actions, calls } = recorder();
  const gone: EventVM = { ...dance, key: 'record@0', path: '' };
  const strip = weekStrip([week[0], day('2026-10-13', [gone], 0), ...week.slice(2)], actions);
  const chip = strip.querySelector('ol.brain-days > li.brain-is-today li.brain-chip');
  assert.ok(chip);
  assert.deepEqual([...chip.children].map((c) => [c.tagName, c.className, c.textContent]), [
    ['SPAN', 'brain-chip-time', '20:15'], ['SPAN', 'brain-chip-title', 'Dance class'],
  ]);
  // Tuesday is today, so its list shows: the title is a plain span between the time and the place.
  const item = strip.querySelector('.brain-strip-agenda > li.brain-agenda-item');
  assert.ok(item);
  assert.deepEqual([...item.children].map((c) => [c.tagName, c.textContent]), [['TIME', '20:15'], ['SPAN', 'Dance class'], ['SPAN', 'Studio Tempo']]);
  fire(chip.children[1], 'click');
  fire(item.children[1], 'click');
  assert.deepEqual(calls, []);
});

test('week strip for planning: each day from today on, and its button, take a drop for their date; a past day and a plain strip take none', () => {
  const zones = (strip: HTMLElement) => [...strip.querySelectorAll('[data-drop]')]
    .map((z) => [z.className.split(' ')[0], z.getAttribute('data-drop'), z.getAttribute('data-date')]);
  // Today is Tuesday 13 October: Monday 12 is past, and takes no drop.
  const open = week.filter((d) => !d.isPast);
  assert.equal(open.length, week.length - 1);
  assert.deepEqual(zones(weekStrip(week, recorder().actions, { drop: true })), [
    ...open.map((d) => ['brain-day', 'day', d.iso]),
    ...open.map((d) => ['brain-day-pick', 'day', d.iso]),
  ]);
  // Another week's days all lie ahead of today: every one takes a drop.
  const ahead = week.map((d) => ({ ...d, isPast: false, isToday: false }));
  assert.equal(zones(weekStrip(ahead, recorder().actions, { drop: true })).length, week.length * 2);
  const plain = weekStrip(week, recorder().actions);
  assert.deepEqual(zones(plain), []);
  assert.equal(plain.querySelectorAll('ol.brain-days > li[data-date]').length, 0);
});

// ---------- Busy days: what is still to come, +N more / N earlier, and the day's full view ----------

const THU = '2026-10-15';   // the options page's busy week, with the clock on Thursday

function appt(title: string, time: string, where: string): EventVM {
  const [start, end] = time.split('–');
  return { key: `${title}@${start}`, path: `${title}.md`, title, start, end, where };
}
function dayOn(today: string, iso: string, events: EventVM[]): DayVM {
  const long = weekdayLong(iso);
  return {
    iso, weekdayShort: long.slice(0, 3), initial: long[0], dayNum: Number(iso.slice(8)),
    isToday: iso === today, isPast: iso < today, events, planned: 0, due: 0, done: 0,
  };
}
/** Week 42, 12–18 October, today being `today`: Wednesday has 5 appointments, Thursday 7. */
function busyWeek(today = THU): DayVM[] {
  return [
    dayOn(today, '2026-10-12', [appt('Gym', '08:00–09:00', 'Health')]),
    dayOn(today, '2026-10-13', [appt('Check-in', '09:30–10:00', 'Admin'), appt('Dance class', '20:15–22:15', 'Studio Tempo')]),
    dayOn(today, '2026-10-14', [
      appt('Planning call', '09:00–10:00', 'Admin'), appt('Call with Pat', '10:30–11:00', 'Admin'), appt('Lunch with Lena', '12:30–13:30', 'Family'),
      appt('Piano lesson', '16:00–17:00', 'Music'), appt('Kitchen showroom', '18:30–20:00', 'Renovate the kitchen')]),
    dayOn(today, THU, [
      appt('Gym', '08:00–09:00', 'Health'), appt('Check-in', '09:30–10:00', 'Admin'), appt('Call with Bram', '11:30–12:30', 'Renovate the kitchen'),
      appt('Lunch with Sam', '13:00–14:00', 'Friends'), appt('Dentist', '15:00–15:45', 'Health'), appt('Contractor visit', '17:30–18:30', 'Home'),
      appt('Dance class', '20:15–21:15', 'Dance')]),
    dayOn(today, '2026-10-16', [appt('Physio', '10:00–10:45', 'Health'), appt('Pizza night', '19:00–22:00', 'Friends')]),
    dayOn(today, '2026-10-17', [appt('Friend’s birthday', '16:00–18:00', 'Friends')]),
    dayOn(today, '2026-10-18', []),
  ];
}
const chipTitles = (col: Element) => [...col.querySelectorAll('.brain-day-events > .brain-chip')].map((c) => c.querySelector('.brain-chip-title')?.textContent);
const more = (col: Element) => col.querySelector<HTMLButtonElement>('.brain-day-events > .brain-more-item > button');
const columns = (strip: HTMLElement) => [...strip.querySelectorAll('ol.brain-days > li')];

test('busy week, Thursday 10:00: each column shows what is still to come, at most 3, and the earlier ones are past days', () => {
  const cols = columns(weekStrip(busyWeek(), recorder().actions, { now: '10:00' }));
  assert.deepEqual(cols.map(chipTitles), [
    [], [], [],                                                                  // days before today show none
    ['Call with Bram', 'Lunch with Sam', 'Dentist'],                             // Thursday: Gym and Check-in have ended
    ['Physio', 'Pizza night'], ['Friend’s birthday'], [],
  ]);
  assert.deepEqual(cols.map((c) => more(c)?.textContent ?? null), ['1 earlier', '2 earlier', '5 earlier', '+4 more', null, null, null]);
});

test('+N more counts every appointment not shown, the finished ones too; N earlier reads for a day that shows none', () => {
  const cols = columns(weekStrip(busyWeek(), recorder().actions, { now: '10:00' }));
  assert.equal(more(cols[3])?.textContent, '+4 more');   // 2 finished + 2 past the third chip
  assert.equal(more(cols[3])?.getAttribute('aria-label'), '+4 more on Thursday 15');
  assert.equal(more(cols[0])?.getAttribute('aria-label'), '1 earlier on Monday 12');
  assert.equal(more(cols[0])?.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(more(cols[0])?.className, 'brain-quiet');
  assert.equal(more(cols[0])?.closest('li')?.className, 'brain-more-item');
  // Evening: only the dance class is left, and six are behind it.
  const late = columns(weekStrip(busyWeek(), recorder().actions, { now: '20:00' }))[3];
  assert.deepEqual([chipTitles(late), more(late)?.textContent], [['Dance class'], '+6 more']);
  // After the last one: nothing is shown, and all seven are earlier.
  const over = columns(weekStrip(busyWeek(), recorder().actions, { now: '21:15' }))[3];
  assert.deepEqual([chipTitles(over), more(over)?.textContent], [[], '7 earlier']);
});

test('an appointment is finished at its end (at its start, with no end); one with no time on today never is', () => {
  const titles = (now: string, events: EventVM[]) => chipTitles(columns(weekStrip([
    ...busyWeek().slice(0, 3), dayOn(THU, THU, events), ...busyWeek().slice(4)], recorder().actions, { now }))[3]);
  // As the model orders a day: no time first, then by start.
  const errand: EventVM = { key: 'k', path: 'x.md', title: 'Errand', start: '' };
  const call: EventVM = { key: 'c', path: 'c.md', title: 'Call', start: '10:30' };
  const events = [errand, appt('Check-in', '09:30–10:00', 'Admin'), call];
  assert.deepEqual(titles('09:59', events), ['Errand', 'Check-in', 'Call']);
  assert.deepEqual(titles('10:00', events), ['Errand', 'Call']);       // Check-in ended at 10:00
  assert.deepEqual(titles('10:30', events), ['Errand']);               // Call has only a start, and it has passed
  assert.deepEqual(titles('23:59', events), ['Errand']);               // no time: the day is not over
});

test('Thursday morning: no clock given means nothing has ended today; days before today still show none', () => {
  const cols = columns(weekStrip(busyWeek(), recorder().actions));
  assert.deepEqual(cols.map(chipTitles).map((t) => t.length), [0, 0, 0, 3, 2, 1, 0]);
  assert.equal(more(cols[3])?.textContent, '+4 more');   // 7 on the day, 3 shown: the cap alone
});

test('an upcoming week shows its first 3 per day and +N more; nothing in it has finished', () => {
  // Every day lies ahead: Wednesday has 5.
  const ahead = busyWeek('2026-10-05');
  const cols = columns(weekStrip(ahead, recorder().actions, { now: '23:00' }));
  assert.deepEqual(chipTitles(cols[2]), ['Planning call', 'Call with Pat', 'Lunch with Lena']);
  assert.equal(more(cols[2])?.textContent, '+2 more');
  assert.deepEqual(cols.map((c) => more(c)?.textContent ?? null), [null, null, '+2 more', '+4 more', null, null, null]);
});

test('a past week, the record, shows every appointment as it did, with no button', () => {
  const cols = columns(weekStrip(busyWeek('2026-10-26'), recorder().actions, { record: true, now: '10:00' }));
  assert.deepEqual(cols.map((c) => chipTitles(c).length), [1, 2, 5, 7, 2, 1, 0]);   // all of them, even the fourth to seventh
  assert.deepEqual(cols.map((c) => more(c)), [null, null, null, null, null, null, null]);
  assert.equal(cols[3].querySelectorAll('.brain-more-item').length, 0);
});

test('the extra button opens the full view of its day: every appointment, finished ones included, and the clock on today only', () => {
  const { actions, calls } = recorder();
  const cols = columns(weekStrip(busyWeek(), actions, { now: '10:00' }));
  fire(more(cols[3])!, 'click');
  fire(more(cols[2])!, 'click');
  assert.deepEqual(calls, [
    ['showDay', 'Thursday 15 October · 7', ['Gym', 'Check-in', 'Call with Bram', 'Lunch with Sam', 'Dentist', 'Contractor visit', 'Dance class'], '10:00'],
    ['showDay', 'Wednesday 14 October · 5', ['Planning call', 'Call with Pat', 'Lunch with Lena', 'Piano lesson', 'Kitchen showroom'], undefined],
  ]);
});

test('the extra button hands the modal its opener, and carries a key so a redraw keeps the focus on it', () => {
  let opener: HTMLElement | undefined;
  const { actions } = recorder();
  const strip = weekStrip(busyWeek(), { ...actions, showDay: (spec) => { opener = spec.opener; } }, { now: '10:00' });
  const button = more(columns(strip)[3])!;
  fire(button, 'click');
  same(opener, button);
  assert.equal(button.getAttribute('data-key'), 'more:2026-10-15');
});

test('narrow, the picked day follows the same rules: up to 3 still to come, then +N more or N earlier, opening the same modal', () => {
  const { actions, calls } = recorder();
  const strip = weekStrip(busyWeek(), actions, { now: '10:00' });
  const agenda = strip.querySelector('.brain-strip-agenda')!;
  const picks = [...strip.querySelectorAll('.brain-day-pick')];
  const rows = () => [...agenda.children].map((li) => li.className === 'brain-more-item' ? `[${li.textContent}]` : li.querySelector('a')?.textContent);
  // Thursday is today, so it is picked.
  assert.deepEqual(rows(), ['Call with Bram', 'Lunch with Sam', 'Dentist', '[+4 more]']);
  fire(agenda.querySelector('.brain-more-item > button')!, 'click');
  assert.deepEqual(calls.at(-1)?.slice(0, 2), ['showDay', 'Thursday 15 October · 7']);
  assert.equal(agenda.querySelector('.brain-more-item > button')?.getAttribute('data-key'), 'more-agenda:2026-10-15');
  // Monday has ended for good: nothing to come, and the button says how many were earlier.
  fire(picks[0], 'click');
  assert.deepEqual(rows(), ['[1 earlier]']);
  fire(agenda.querySelector('.brain-more-item > button')!, 'click');
  assert.deepEqual(calls.at(-1), ['showDay', 'Monday 12 October · 1', ['Gym'], undefined]);
  // Friday has nothing hidden: its two, and no button. Sunday has none at all.
  fire(picks[4], 'click');
  assert.deepEqual(rows(), ['Physio', 'Pizza night']);
  fire(picks[6], 'click');
  assert.deepEqual([...agenda.children].map((li) => [li.className, li.textContent]), [['brain-empty', 'No appointments']]);
  // Wednesday 14 is past too: all 5 earlier.
  fire(picks[2], 'click');
  assert.deepEqual(rows(), ['[5 earlier]']);
});

test('narrow, a past week keeps its list as it was, and the buttons stay out of it', () => {
  const strip = weekStrip(busyWeek('2026-10-26'), recorder().actions, { record: true });
  fire(strip.querySelectorAll('.brain-day-pick')[3], 'click');
  assert.equal(strip.querySelectorAll('.brain-strip-agenda > li').length, 7);
  assert.equal(strip.querySelectorAll('.brain-more-item').length, 0);
});

test('the counts, the day buttons and the drop targets do not change with the clock', () => {
  const days = busyWeek().map((d, i) => ({ ...d, planned: i === 3 ? 4 : 0, due: i === 3 ? 1 : 0 }));
  const strip = weekStrip(days, recorder().actions, { drop: true, now: '10:00' });
  assert.deepEqual([...strip.querySelectorAll('ol.brain-days > li')[3].querySelectorAll('.brain-day-count > span')].map((s) => [s.textContent, s.getAttribute('data-when')]), [['4 planned', null], ['1 due', 'due']]);
  assert.equal(strip.querySelectorAll('[data-drop="day"]').length, 8);   // Thursday to Sunday, a column and a button each
  assert.equal(strip.querySelectorAll('.brain-day-pick')[3].getAttribute('aria-label'), 'Thursday 15, 4 planned and 1 due');
});
