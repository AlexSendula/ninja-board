// A week's story points: the stories in the week by Part 1's rule (carried-over ones included on this week's board), the
// target from the config, and a past week's record values when the record holds them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import type { PastWeekVM, RawNote, ThisWeekVM, UpcomingWeekVM, VaultSnapshot, WeekVM } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42: Mon 12 to Sun 18 October; week 43 is Mon 19 to Sun 25

const note = (path: string, frontmatter: Record<string, unknown>, lines: string[] = []): RawNote => ({ path, frontmatter, lines });
const project = note('03 Projects/Sam/Sam.md', { type: 'project', status: 'active' });
const story = (name: string, fm: Record<string, unknown>): RawNote => note(`03 Projects/Sam/${name}.md`, { type: 'task', ...fm });

const stories: RawNote[] = [
  story('Wed story', { status: 'open', scheduled: '2026-10-14', points: 3 }),
  story('Fri story', { status: 'open', due: '2026-10-16', points: 5 }),
  story('Mon done', { status: 'done', done: '2026-10-12', points: 2 }),
  story('Carried', { status: 'open', due: '2026-10-08', points: 1 }),   // overdue: carried into this week
  story('Next week', { status: 'open', scheduled: '2026-10-21', points: 8 }),   // planned for week 43
  story('Due 43', { status: 'open', due: '2026-10-22', points: 3 }),
  story('No date', { status: 'open', points: 8 }),                       // no date: in no week
  story('Plain', { status: 'open', due: '2026-10-15' }),               // in the week, no points
];
const area = [
  note('04 Areas/Home/Home.md', { type: 'area' }),
  note('04 Areas/Home/Renew.md', { type: 'task', status: 'open', scheduled: '2026-10-14', points: 8 }),   // not a story: no points
];

const sample = (notes: RawNote[]): VaultSnapshot => buildSnapshot([project, ...notes, ...area]);
const thisWeek = (s: VaultSnapshot, input: { target?: number } = {}): ThisWeekVM => {
  const w = buildWeek(s, TODAY, input);
  assert.ok(w.kind === 'this');
  return w;
};

test('this week: planned is the points of its stories, carried-over ones and done ones included; done is the done ones', () => {
  // Wed 3 + Fri 5 + Mon done 2 + Carried 1 = 11 planned; Mon done 2 = done. Next week, no date, Plain and the area task are out.
  assert.deepEqual(thisWeek(sample(stories)).points, { planned: 11, done: 2, target: 8 });
});

test('this week: the target is points_per_week from the config, 8 when none is given', () => {
  assert.equal(thisWeek(sample(stories), { target: 12 }).points?.target, 12);
});

test('this week: no story with points in it means no points figure', () => {
  const plain = sample([story('Plain', { status: 'open', due: '2026-10-15' }), story('Area-like', { status: 'open', scheduled: '2026-10-14' })]);
  assert.equal(thisWeek(plain).points, undefined);
});

test('an upcoming week counts the stories planned or due in it, with no carry-over; the target is the config\'s', () => {
  const w = buildWeek(sample(stories), TODAY, { start: '2026-10-19', target: 10 });
  assert.ok(w.kind === 'upcoming');
  const upcoming: UpcomingWeekVM = w;
  assert.deepEqual(upcoming.points, { planned: 11, done: 0, target: 10 });   // Next week 8 + Due 43 3; Carried and Wed story are not in it
});

test('a past week with a record shows its record\'s points; without them, none', () => {
  const lines = ['### Appointments', '', '### Done', '', '### In progress', '', '### Not done', '', '### Backlog', ''];
  const plan = (fm: Record<string, unknown>): RawNote => note('08 Weeks/2026/2026-W41.md', { week: '2026-W41', ...fm }, lines);
  const past = (p: RawNote | undefined): PastWeekVM => {
    const w: WeekVM = buildWeek(sample(stories), TODAY, { start: '2026-10-05', plan: p });
    assert.ok(w.kind === 'past');
    return w;
  };
  assert.deepEqual(past(plan({ points_planned: 7, points_done: 4 })).points, { planned: 7, done: 4, target: 8 });
  assert.equal(past(plan({})).points, undefined);
  assert.equal(past(plan({ points_planned: '7', points_done: 4 })).points, undefined);
  assert.equal(past(undefined).points, undefined);   // what the notes say now: no record, no points
});

test('a story carries its points on its row (To plan, Backlog, Planned or due) and its board card; a story without has none', () => {
  const s = sample(stories);
  const board = thisWeek(s).columns.todo.flatMap((i) => (i.kind === 'card' ? [i.card] : []));
  assert.equal(board.find((c) => c.title === 'Wed story')?.points, 3);
  assert.equal(board.find((c) => c.title === 'Plain')?.points, undefined);
  const next = buildWeek(s, TODAY, { start: '2026-10-19' });
  assert.ok(next.kind === 'upcoming');
  const rows = next.byDay.flatMap((g) => g.rows);
  assert.equal(rows.find((r) => r.title === 'Next week')?.points, 8);
  assert.equal(rows.find((r) => r.title === 'Plain')?.points, undefined);
});
