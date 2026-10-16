// A story as a row carries its lines for its card, and an upcoming week counts what it holds in two parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildBacklog } from './backlog.ts';
import { buildSnapshot } from './snapshot.ts';
import { loadSample } from '../../test/sample.ts';
import type { RawNote, RowVM, UpcomingWeekVM, VaultSnapshot } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42; week 43 is Mon 19 to Sun 25 October

function upcoming(s: VaultSnapshot, start: string): UpcomingWeekVM {
  const w = buildWeek(s, TODAY, { start });
  assert.ok(w.kind === 'upcoming', 'expected an upcoming week');
  return w;
}

const titleOf = (row: RowVM) => row.title;
const linesOf = (row: RowVM) => (row.lines ?? []).map((l) => [l.title, l.state, l.meta.map((m) => m.text).join('/')]);

test('a story row in No date carries its lines in file order, each with its state', () => {
  const noDate = buildBacklog(loadSample(), TODAY).noDate.flatMap((g) => g.rows);
  const cabinets = noDate.find((r) => titleOf(r) === 'Order cabinets');
  assert.ok(cabinets?.progress);
  assert.deepEqual(linesOf(cabinets), [
    ['Re-measure the corner under the sink', 'todo', ''],
    ['Pick the cabinet colour and handles', 'todo', ''],
  ]);
});

test('a story planned or due in a week carries its lines too, a done one with no date', () => {
  const w = upcoming(loadSample(), '2026-10-19');
  const hosting = w.byDay.flatMap((g) => g.rows).find((r) => titleOf(r) === "Choose hosting for Sam's site");
  assert.ok(hosting?.progress);
  assert.deepEqual(linesOf(hosting), [
    ['List three hosting options', 'done', ''],
    ['Compare prices and bandwidth', 'doing', 'Planned Wed'],
    ['Ask Sam about the custom domain', 'todo', ''],
  ]);
});

test('a week counts everything in Planned or due, and how many of those have their own deadline in the week', () => {
  const w = upcoming(loadSample(), '2026-10-19');
  // In the week: Book the boiler service (any day), Get photos from Sam (its chase), and Choose hosting, Back up the laptop, Choose a contractor (deadlines).
  assert.deepEqual(w.tally, { inWeek: 5, due: 3 });
  assert.equal(w.tally.inWeek, w.planned);
});

test('a lead window that reaches the week with no date in it is planned, not due', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    { path: '04 Areas/Home/Renew the car tax.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-30', lead: '1w' }, lines: [] },
  ]);
  const w = upcoming(s, '2026-10-19');
  assert.equal(w.planned, 1);
  assert.deepEqual(w.tally, { inWeek: 1, due: 0 });
});

test('a task note due in the week and not planned counts as due', () => {
  const raw: RawNote[] = [
    { path: '03 Projects/Paint/Paint.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: '03 Projects/Paint/Pick colours.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-21' }, lines: [] },
  ];
  const w = upcoming(buildSnapshot(raw), '2026-10-19');
  assert.deepEqual(w.tally, { inWeek: 1, due: 1 });
});
