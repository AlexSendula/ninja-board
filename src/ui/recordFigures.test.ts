// The Week head's figures for a past week (deviation 5 and the record's figures): a record shows its tasks as done out
// of all, with the checklist icon, and its points as the record. A week with no record keeps its notes' "N done".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { renderWeek } from './week.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample, readSample } from '../../test/sample.ts';
import { weekPlanPath } from '../model/record.ts';
import type { PastWeekVM, UpcomingWeekVM, WeekVM } from '../model/types.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42

/** A past week drawn from its record, as the view reads it: the sample's week plan for that week. */
function recordOf(start: string): PastWeekVM {
  const plan = readSample().find((n) => n.path === weekPlanPath(start));
  return buildWeek(loadSample(), TODAY, { start, plan }) as PastWeekVM;
}

/** Draws a week and returns its head's figures, in order. */
function figuresOf(vm: WeekVM): Element[] {
  const root = document.createElement('div');
  renderWeek(root, vm, recorder().actions);
  return [...root.querySelectorAll('.brain-head .brain-figure')];
}

test('a past week with a record: its tasks figure is done out of all, with the checklist icon', () => {
  const past = recordOf('2026-10-05');
  assert.ok(past.total !== undefined && past.total > 0, 'the sample record has tasks');
  const [tasks] = figuresOf(past);
  assert.equal(tasks.querySelector(':scope > span')?.textContent, `${past.done}/${past.total}`);
  assert.equal(tasks.querySelector('.brain-ring')?.getAttribute('aria-label'), `${past.done} of ${past.total} done that week`);
  const icon = tasks.querySelector(':scope > .brain-tally-icon');
  assert.equal(icon?.getAttribute('role'), 'img');
  assert.equal(icon?.getAttribute('aria-label'), 'tasks done of total');
});

test('a past week with no record keeps its notes figure: "N done", with no ring and no icon', () => {
  const notes = buildWeek(loadSample(), TODAY, { start: '2026-09-28' }) as PastWeekVM;
  assert.equal(notes.total, undefined);
  const figures = figuresOf(notes);
  assert.equal(figures.length, 1);
  assert.equal(figures[0].textContent, `${notes.done} done`);
  absent(figures[0].querySelector('.brain-ring'));
  absent(figures[0].querySelector('.brain-tally-icon'));
});

test('the sample\'s week 41 record holds its points: 7 planned, 6 done, read-only beside the tasks', () => {
  const past = recordOf('2026-10-05');
  assert.deepEqual(past.points, { planned: 7, done: 6, target: 8 });
  const [, points] = figuresOf(past);
  assert.equal(points.querySelector('.brain-pts-label')?.textContent, '7/8 pts');
});

test('a record\'s points figure is marked as the record, with the label the mockup gives', () => {
  const past = recordOf('2026-10-05');
  const [, points] = figuresOf({ ...past, points: { planned: 7, done: 6, target: 8 } });
  assert.equal(points.className, 'brain-figure brain-points brain-record');
  assert.equal(points.querySelector('.brain-ring')?.getAttribute('aria-label'), '7 of 8 points planned, 6 done (the record)');
  assert.equal(points.querySelector('.brain-pts-label')?.textContent, '7/8 pts');
});

test('the planning header\'s count icon is hidden: its count carries the words', () => {
  const next = buildWeek(loadSample(), TODAY, { start: '2026-10-19' }) as UpcomingWeekVM;
  assert.ok(next.planned > 0, 'the sample week has planned items');
  const [counts] = figuresOf(next);
  assert.equal(counts.querySelector(':scope .brain-tally-icon')?.getAttribute('aria-hidden'), 'true');
});
