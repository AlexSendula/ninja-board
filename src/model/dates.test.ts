import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toISO, addDays, daysBetween, weekdayOf, isoWeek,
  dayWord, dueText, chaseText, plannedText, weekPlanText, doneText, ageText,
  longDate, weekdayLong, monthName,
  dayMonth, dayLabel, shortDate, weekWord, leadDays,
} from './dates.ts';

// A zone with DST and a positive UTC offset, so local-versus-UTC and DST mistakes show up.
// node --test runs each file in its own process, so this stays inside this file.
process.env.TZ = 'Europe/Amsterdam';

const TODAY = '2026-10-13'; // Tuesday, ISO week 2026-W42

test('toISO keeps valid date strings and the date part of date-times', () => {
  assert.equal(toISO('2026-10-13'), '2026-10-13');
  assert.equal(toISO('2026-10-13T09:12'), '2026-10-13');
  assert.equal(toISO('2026-10-12T21:04:00Z'), '2026-10-12');
  assert.equal(toISO(' 2026-10-17 '), '2026-10-17');
  assert.equal(toISO('2028-02-29'), '2028-02-29');
});

test('toISO formats Date objects with local fields', () => {
  assert.equal(toISO(new Date(2026, 9, 13)), '2026-10-13');
  // 00:30 in Amsterdam is still 12 October in UTC.
  assert.equal(toISO(new Date(2026, 9, 13, 0, 30)), '2026-10-13');
});

test('toISO rejects invalid dates and other types', () => {
  for (const bad of [
    '2026-13-40', '2026-02-30', '2026-02-29', '2026-00-10', '2026-10-00',
    '2026-10-1', '13-10-2026', '2026-10-13Tlater', '2026/10/13', '', 'soon',
    20261013, Date.UTC(2026, 9, 13), new Date('nope'), null, undefined, {}, ['2026-10-13'],
  ]) {
    assert.equal(toISO(bad), undefined, `expected undefined for ${String(bad)}`);
  }
});

test('addDays crosses month, year, leap-day and DST boundaries', () => {
  assert.equal(addDays(TODAY, 0), '2026-10-13');
  assert.equal(addDays(TODAY, 7), '2026-10-20');
  assert.equal(addDays(TODAY, -3), '2026-10-10');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // clocks go back on 25 Oct
  assert.equal(addDays('2027-03-27', 2), '2027-03-29'); // clocks go forward on 28 Mar
});

test('daysBetween returns b minus a in whole days', () => {
  assert.equal(daysBetween(TODAY, TODAY), 0);
  assert.equal(daysBetween(TODAY, '2026-10-20'), 7);
  assert.equal(daysBetween(TODAY, '2026-10-10'), -3);
  assert.equal(daysBetween('2026-12-28', '2027-01-03'), 6);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2027-03-27', '2027-03-29'), 2);
});

test('weekdayOf counts 1 = Monday to 7 = Sunday', () => {
  assert.equal(weekdayOf('2026-10-12'), 1);
  assert.equal(weekdayOf(TODAY), 2);
  assert.equal(weekdayOf('2026-10-18'), 7);
  assert.equal(weekdayOf('2027-01-01'), 5);
});

test('isoWeek gives the ISO week with its Monday and Sunday', () => {
  const w42 = { year: 2026, week: 42, start: '2026-10-12', end: '2026-10-18' };
  assert.deepEqual(isoWeek(TODAY), w42);
  assert.deepEqual(isoWeek('2026-10-12'), w42);
  assert.deepEqual(isoWeek('2026-10-18'), w42);
  const w53 = { year: 2026, week: 53, start: '2026-12-28', end: '2027-01-03' };
  assert.deepEqual(isoWeek('2026-12-28'), w53);
  assert.deepEqual(isoWeek('2027-01-01'), w53);
  assert.deepEqual(isoWeek('2027-01-04'), { year: 2027, week: 1, start: '2027-01-04', end: '2027-01-10' });
  assert.deepEqual(isoWeek('2026-01-01'), { year: 2026, week: 1, start: '2025-12-29', end: '2026-01-04' });
});

test('dayWord: Today, Yesterday, a weekday for the next 6 days, else D Mon', () => {
  assert.equal(dayWord(TODAY, TODAY), 'Today');
  assert.equal(dayWord('2026-10-12', TODAY), 'Yesterday');
  assert.equal(dayWord('2026-10-14', TODAY), 'Wed');
  assert.equal(dayWord('2026-10-19', TODAY), 'Mon');
  assert.equal(dayWord('2026-10-20', TODAY), '20 Oct');
  assert.equal(dayWord('2026-10-10', TODAY), '10 Oct');
  assert.equal(dayWord('2026-10-02', TODAY), '2 Oct');
});

test('dayWord adds the year only when it differs, and a weekday wins over it', () => {
  assert.equal(dayWord('2027-01-05', TODAY), '5 Jan 2027');
  assert.equal(dayWord('2025-12-31', TODAY), '31 Dec 2025');
  assert.equal(dayWord('2027-01-02', '2026-12-29'), 'Sat');
});

test('dueText: overdue count, due today, or Due + day word; always a due part', () => {
  assert.deepEqual(dueText('2026-10-10', TODAY), { text: '3 days overdue', tone: 'overdue', when: 'due' });
  assert.deepEqual(dueText('2026-10-12', TODAY), { text: '1 day overdue', tone: 'overdue', when: 'due' });
  assert.deepEqual(dueText(TODAY, TODAY), { text: 'Due today', when: 'due' });
  assert.deepEqual(dueText('2026-10-16', TODAY), { text: 'Due Fri', when: 'due' });
  assert.deepEqual(dueText('2026-10-17', TODAY), { text: 'Due Sat', when: 'due' });
  assert.deepEqual(dueText('2026-10-20', TODAY), { text: 'Due 20 Oct', when: 'due' });
  assert.deepEqual(dueText('2026-11-01', TODAY), { text: 'Due 1 Nov', when: 'due' });
});

test('chaseText: lowercase today/yesterday, late tone once passed; always a plan part', () => {
  assert.deepEqual(chaseText('2026-10-15', TODAY), { text: 'Chase Thu', when: 'plan' });
  assert.deepEqual(chaseText('2026-10-20', TODAY), { text: 'Chase 20 Oct', when: 'plan' });
  assert.deepEqual(chaseText(TODAY, TODAY), { text: 'Chase today', when: 'plan' });
  assert.deepEqual(chaseText('2026-10-12', TODAY), { text: 'Chase yesterday', tone: 'late', when: 'plan' });
  assert.deepEqual(chaseText('2026-10-09', TODAY), { text: 'Chase 9 Oct', tone: 'late', when: 'plan' });
});

test('plannedText: today, yesterday, a weekday, a far date, another year; a plan part', () => {
  assert.deepEqual(plannedText(TODAY, TODAY), { text: 'Planned today', when: 'plan' });
  assert.deepEqual(plannedText('2026-10-12', TODAY), { text: 'Planned yesterday', when: 'plan' });
  assert.deepEqual(plannedText('2026-10-14', TODAY), { text: 'Planned Wed', when: 'plan' });
  assert.deepEqual(plannedText('2026-10-26', TODAY), { text: 'Planned 26 Oct', when: 'plan' });
  assert.deepEqual(plannedText('2027-01-05', TODAY), { text: 'Planned 5 Jan 2027', when: 'plan' });
});

test('weekPlanText: This week for this Monday, else its week number', () => {
  assert.deepEqual(weekPlanText('2026-10-12', TODAY), { text: 'This week', when: 'plan' });
  assert.deepEqual(weekPlanText('2026-10-19', TODAY), { text: 'Week 43', when: 'plan' });
});

test('doneText', () => {
  assert.equal(doneText(TODAY, TODAY), 'Done today');
  assert.equal(doneText('2026-10-12', TODAY), 'Done yesterday');
  assert.equal(doneText('2026-10-11', TODAY), 'Done 11 Oct');
  assert.equal(doneText('2026-10-02', TODAY), 'Done 2 Oct');
});

test('ageText takes dates or date-times and ignores invalid ones', () => {
  assert.equal(ageText('2026-10-13T09:12', TODAY), 'Today');
  assert.equal(ageText('2026-10-12T21:04', TODAY), 'Yesterday');
  assert.equal(ageText('2026-10-08', TODAY), '5 days');
  assert.equal(ageText('2026-10-14T08:00', TODAY), 'Today'); // clock skew: never negative
  assert.equal(ageText('2026-13-40', TODAY), '');
  assert.equal(ageText('', TODAY), '');
});

test('longDate, weekdayLong and monthName', () => {
  assert.equal(longDate(TODAY), '13 October');
  assert.equal(longDate('2026-10-02'), '2 October');
  assert.equal(weekdayLong(TODAY), 'Tuesday');
  assert.equal(weekdayLong('2026-10-18'), 'Sunday');
  assert.equal(monthName(1), 'January');
  assert.equal(monthName(10), 'October');
  assert.equal(monthName(12), 'December');
  assert.equal(monthName(13), '');
});

test('dayMonth, dayLabel and shortDate: the short forms of week titles, day groups and records', () => {
  assert.equal(dayMonth('2026-09-28'), '28 Sep');
  assert.equal(dayMonth('2026-10-04'), '4 Oct');
  assert.equal(dayLabel('2026-10-20'), 'Tue 20');
  assert.equal(dayLabel('2026-11-01'), 'Sun 1');
  assert.equal(shortDate('2026-10-15'), 'Thu 15 Oct');
  assert.equal(shortDate('2027-01-05'), 'Tue 5 Jan');
});

test('weekWord: a weekday inside the shown week, else the short date, with the year when it differs', () => {
  const w41 = '2026-10-05';   // Mon 5 to Sun 11 October
  assert.equal(weekWord('2026-10-05', w41), 'Mon');
  assert.equal(weekWord('2026-10-10', w41), 'Sat');
  assert.equal(weekWord('2026-10-11', w41), 'Sun');
  assert.equal(weekWord('2026-10-15', w41), 'Thu 15 Oct');    // moved out of the week
  assert.equal(weekWord('2026-10-04', w41), 'Sun 4 Oct');
  const w53 = '2026-12-28';   // Mon 28 December 2026 to Sun 3 January 2027
  assert.equal(weekWord('2027-01-02', w53), 'Sat');           // inside the week, across the new year
  assert.equal(weekWord('2027-01-05', w53), 'Tue 5 Jan 2027');
  assert.equal(weekWord('2026-12-31', '2027-01-04'), 'Thu 31 Dec 2026');
});

test('a lead time as days: whole weeks, days and hours, largest first; under a day is none', () => {
  assert.equal(leadDays('2w'), 14);
  assert.equal(leadDays('1d'), 1);
  assert.equal(leadDays('2w3d'), 17);
  assert.equal(leadDays('36h'), 1);      // whole days: 36 hours is one day
  assert.equal(leadDays('1h30m'), 0);    // under a day: the window opens on the deadline's own day
  assert.equal(leadDays('90m'), 0);
  assert.equal(leadDays('1d2w'), undefined);   // largest first
  assert.equal(leadDays('soon'), undefined);
  assert.equal(leadDays(''), undefined);
});
