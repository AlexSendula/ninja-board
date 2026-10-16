// A past week with no record (past.ts, notesWeek): each completed occurrence of a repeating note is its own Done row, keyed
// `<path>@<date>` as the this-week row is (rows.ts, occurrenceRow). Two occurrences of one note in one week are two rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import type { PastWeekVM, RawNote } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42

const HEALTH: RawNote = { path: '04 Areas/Health/Health.md', frontmatter: { type: 'area' }, lines: [] };
const STRETCH: RawNote = {
  path: '04 Areas/Health/Stretch.md',
  frontmatter: { type: 'task', status: 'open', repeat: 'every day', repeat_from: 'done', due: '2026-10-20' },
  lines: ['## Log',
    '- 2026-10-06 Done: the occurrence due 2026-10-05. Next due 2026-10-06.',
    '- 2026-10-07 Done: the occurrence due 2026-10-06. Next due 2026-10-07.'],
};

test('two completions of one repeating note on the same day in a past week are two Done rows, the second keyed #2', () => {
  const sameDay: RawNote = { ...STRETCH, lines: ['## Log',
    '- 2026-10-07 Done: the occurrence due 2026-10-06. Next due 2026-10-07.',
    '- 2026-10-07 Done: the occurrence due 2026-10-05. Next due 2026-10-06.'] };
  const w = buildWeek(buildSnapshot([HEALTH, sameDay]), TODAY, { start: '2026-10-05' }) as PastWeekVM;
  const done = w.columns.find((c) => c.title === 'Done');
  assert.deepEqual(done?.rows.map((r) => r.key), [
    '04 Areas/Health/Stretch.md@2026-10-07',
    '04 Areas/Health/Stretch.md@2026-10-07#2',
  ]);
});

test('two occurrences of one repeating note in a past week are two Done rows, keyed by path and date', () => {
  const w = buildWeek(buildSnapshot([HEALTH, STRETCH]), TODAY, { start: '2026-10-05' }) as PastWeekVM;
  assert.equal(w.kind, 'past');
  const done = w.columns.find((c) => c.title === 'Done');
  assert.deepEqual(done?.rows.map((r) => r.key), [
    '04 Areas/Health/Stretch.md@2026-10-06',
    '04 Areas/Health/Stretch.md@2026-10-07',
  ]);
});
