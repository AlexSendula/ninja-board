// Story points on the page (deviation 5): the Week head's two figures (tasks and points), the points ring's arcs and label,
// each story's "N pts", and a story's planner card with its Points row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, recorder, sampleNote } from '../../test/ui.ts';   // first: it installs the DOM
import { renderWeek } from './week.ts';
import { listItem, storyCard } from './card.ts';
import { openCard, closeCard } from './popover.ts';
import { h } from './dom.ts';
import { buildWeek } from '../model/week.ts';
import { buildBacklog } from '../model/backlog.ts';
import { loadSample } from '../../test/sample.ts';
import type { PastWeekVM, RowVM, ThisWeekVM, UpcomingWeekVM, WeekVM } from '../model/types.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42
const AT = { x: 40, y: 48 };
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const fresh = (): HTMLElement => document.createElement('div');

const thisWeek = buildWeek(loadSample(), TODAY) as ThisWeekVM;   // done 2, 12 left: 2/14 on the header

/** Draws a week's page with `vm` (points added by the test) and returns its head's figures row. */
function figuresOf(vm: WeekVM): Element {
  const root = fresh();
  renderWeek(root, vm, recorder().actions);
  const figures = root.querySelector('.brain-head .brain-figures');
  assert.ok(figures, 'no figures row in the head');
  return figures;
}

test('Week: the tasks figure is done out of all, with the checklist icon, and the points ring beside it', () => {
  const figures = figuresOf({ ...thisWeek, points: { planned: 12, done: 3, target: 8 } });
  const [tasks, points] = [...figures.children];
  assert.equal(tasks.className, 'brain-figure');
  assert.equal(tasks.querySelector(':scope > span')?.textContent, `${thisWeek.done}/${thisWeek.done + thisWeek.left}`);
  assert.equal(tasks.querySelector(':scope > .brain-tally-icon') !== null, true);
  assert.equal(tasks.querySelector('.brain-ring')?.getAttribute('aria-label'), `${thisWeek.done} of ${thisWeek.done + thisWeek.left} done this week`);
  assert.equal(points.className, 'brain-figure brain-points');
  assert.equal(points.querySelector('.brain-pts-label')?.textContent, '12/8+4 pts');
  assert.equal(points.querySelector('.brain-pts-label .brain-over')?.textContent, '+4');
  assert.equal(points.querySelector('.brain-ring')?.getAttribute('aria-label'), '12 of 8 points planned, 3 done');
});

test('Week: the points ring draws the planned arc, the done arc, and the overflow lap (half for +4, thin)', () => {
  const figures = figuresOf({ ...thisWeek, points: { planned: 12, done: 3, target: 8 } });
  const ring = figures.querySelector('.brain-points .brain-ring')!;
  const style = (cls: string) => ring.querySelector(`.${cls}`)?.getAttribute('style') ?? '';
  assert.match(style('brain-ring-plan'), /--brain-p:\s*62\.5/);
  assert.match(style('brain-ring-plan'), /--brain-off:\s*37\.5/);
  assert.match(style('brain-ring-fill'), /--brain-p:\s*37\.5/);
  assert.match(style('brain-ring-over'), /--brain-p:\s*50/);
  assert.match(style('brain-ring-over-done'), /--brain-p:\s*0/);
  assert.equal(ring.querySelectorAll('circle').length, 5);
});

test('Week: under the target there is no badge: "5/8 pts", and the overflow arc is empty', () => {
  const points = figuresOf({ ...thisWeek, points: { planned: 5, done: 0, target: 8 } }).querySelector('.brain-points')!;
  assert.equal(points.querySelector('.brain-pts-label')?.textContent, '5/8 pts');
  absent(points.querySelector('.brain-over'));
});

test('Week: no story with points in the week, no points figure', () => {
  const figures = figuresOf({ ...thisWeek, points: undefined });
  assert.equal(figures.querySelectorAll('.brain-points').length, 0);
});

test('an upcoming week shows its tally, then its points ring at the right', () => {
  const next: UpcomingWeekVM = { ...(buildWeek(loadSample(), TODAY, { start: '2026-10-19' }) as UpcomingWeekVM), points: { planned: 8, done: 0, target: 8 } };
  const figures = figuresOf({ ...next, tally: { inWeek: 6, due: 2 }, planned: 8 });
  assert.deepEqual([...figures.children].map((c) => c.className), ['brain-figure brain-counts', 'brain-figure brain-points']);
  assert.equal(figures.querySelector('.brain-points .brain-pts-label')?.textContent, '8/8 pts');
});

test('a past week with a record shows its record\'s points, read-only, beside its own figure', () => {
  const past = buildWeek(loadSample(), TODAY, { start: '2026-10-05' }) as PastWeekVM;
  const figures = figuresOf({ ...past, points: { planned: 7, done: 4, target: 8 } });
  assert.equal(figures.querySelectorAll('.brain-points').length, 1);
  assert.equal(figures.querySelector('.brain-points .brain-pts-label')?.textContent, '7/8 pts');
});

test('a story card shows "N pts" under its ring, singular for one point; none without points', () => {
  const card = (points?: number) => storyCard({
    key: 'p', path: 'p', title: 'Choose hosting', column: 'todo', meta: [], done: 1, total: 3, rows: [],
    ...(points !== undefined ? { points } : {}),
  }, recorder().actions);
  const side = card(3).querySelector(':scope > .brain-card-head > .brain-card-side')!;
  assert.equal(side.querySelector(':scope > .brain-progress > span')?.textContent, '1/3');
  assert.equal(side.querySelector(':scope > .brain-pts')?.textContent, '3 pts');
  assert.equal(card(1).querySelector('.brain-pts')?.textContent, '1 pt');
  absent(card().querySelector('.brain-pts'));
});

test('a story in a list card shows its points under its ring', () => {
  const row = buildBacklog(loadSample(), TODAY).noDate.flatMap((g) => g.rows).find((r) => r.title === 'Order cabinets') as RowVM;
  assert.ok(row.progress);
  assert.equal(listItem({ ...row, points: 5 }, recorder().actions, true).querySelector('.brain-card-side > .brain-pts')?.textContent, '5 pts');
  absent(listItem({ ...row, points: undefined }, recorder().actions, true).querySelector('.brain-pts'));
});

// ---- the planner card of a story: its Points row ----

/** A story's planner card, opened at a card on a board of this week. */
function storyPlanner(points?: 1 | 2 | 3 | 5 | 8) {
  closeCard();
  for (const node of [...document.body.children]) node.remove();
  const root = h('div', 'brain-view');
  root.dataset.today = TODAY;
  document.body.append(root);
  const item = h('li', 'brain-tile brain-card', { tabindex: '0', 'data-key': 'story' });
  root.append(item);
  const path = sampleNote('Choose hosting for Sam\'s site').path;
  const rec = recorder();
  const el = openCard(item, AT, {
    kind: 'story', title: 'Choose hosting for Sam\'s site', path, state: 'todo', dates: { scheduled: '2026-10-14' },
    ...(points !== undefined ? { points } : {}),
  }, rec.actions);
  return { el, calls: rec.calls, path };
}

test('a story\'s planner card has a Points row between two separators, before the states: the pressed pick is its points', () => {
  const { el } = storyPlanner(3);
  const row = el.querySelector('.brain-plan-points')!;
  assert.equal(row.querySelector('.brain-plan-points-label')?.textContent, 'Points');
  const picks = [...row.querySelectorAll('.brain-plan-pick')];
  assert.deepEqual(picks.map((p) => p.textContent), ['1', '2', '3', '5', '8']);
  assert.deepEqual(picks.map((p) => p.getAttribute('aria-checked')), ['false', 'false', 'true', 'false', 'false']);
  assert.equal(row.previousElementSibling?.className, 'brain-plan-sep');
  assert.equal(row.nextElementSibling?.className, 'brain-plan-sep');
  assert.equal(row.nextElementSibling?.nextElementSibling?.classList.contains('brain-plan-states'), true);
});

test('a click on a pick sets the story\'s points and the card stays open; a click on the pressed pick removes them', async () => {
  const { el, calls, path } = storyPlanner(3);
  fire(el.querySelector('[data-points="5"]')!, 'click');
  await settle();
  assert.deepEqual(calls.filter((c) => c[0] === 'points'), [['points', { kind: 'note', path, state: 'todo' }, 5]]);
  assert.equal(el.isConnected, true);
  assert.equal(el.querySelector('[data-points="5"]')?.getAttribute('aria-checked'), 'true');
  fire(el.querySelector('[data-points="5"]')!, 'click');
  await settle();
  assert.equal(calls.filter((c) => c[0] === 'points')[1]?.[2], null);
  assert.equal(el.querySelector('[data-points="5"]')?.getAttribute('aria-checked'), 'false');
});

test('a task\'s planner card has no Points row', () => {
  closeCard();
  const root = h('div', 'brain-view');
  root.dataset.today = TODAY;
  document.body.append(root);
  const item = h('li', 'brain-tile brain-card', { tabindex: '0', 'data-key': 'task' });
  root.append(item);
  const el = openCard(item, AT, { kind: 'task', title: 'Compare energy contracts', target: { kind: 'line', path: 'x.md', line: 0, raw: '- [ ] Compare' }, state: 'todo', dates: {} }, recorder().actions);
  absent(el.querySelector('.brain-plan-points'));
});
