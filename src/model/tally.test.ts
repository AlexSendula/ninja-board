// The planning header's two counts (weeks design, section 4): the first is everything in Planned or due; the second is
// how many of those have their own deadline in the week. A deadline on a line inside a story does not count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import type { RawNote, UpcomingWeekVM } from './types.ts';

const TODAY = '2026-10-13';
const WEEK_43 = '2026-10-19';   // Mon 19 to Sun 25 October

function tallyOf(raw: RawNote[]): UpcomingWeekVM['tally'] {
  const w = buildWeek(buildSnapshot(raw), TODAY, { start: WEEK_43 }) as UpcomingWeekVM;
  assert.equal(w.kind, 'upcoming');
  return w.tally;
}

const PROJECT: RawNote = { path: '03 Projects/Paint/Paint.md', frontmatter: { type: 'project', status: 'active' }, lines: [] };

test('a story with its own deadline in the week is in the week and due', () => {
  assert.deepEqual(tallyOf([PROJECT, {
    path: '03 Projects/Paint/Pick colours.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-21' }, lines: [],
  }]), { inWeek: 1, due: 1 });
});

test('a deadline on a line inside a story puts the story in the week, but is not a due', () => {
  assert.deepEqual(tallyOf([PROJECT, {
    path: '03 Projects/Paint/Pick colours.md',
    frontmatter: { type: 'task', status: 'open' },
    lines: ['- [ ] Ask for samples [due:: 2026-10-21]'],
  }]), { inWeek: 1, due: 0 });
});

test('a project line with a deadline in the week is due', () => {
  assert.deepEqual(tallyOf([{
    path: '03 Projects/Paint/Paint.md', frontmatter: { type: 'project', status: 'active' }, lines: ['- [ ] Buy paint [due:: 2026-10-21]'],
  }]), { inWeek: 1, due: 1 });
});

test('a story and its line each count in the week: the story by its own deadline (due), the line only in the week', () => {
  assert.deepEqual(tallyOf([PROJECT, {
    path: '03 Projects/Paint/Pick colours.md',
    frontmatter: { type: 'task', status: 'open', due: '2026-10-22' },
    lines: ['- [ ] Ask for samples [due:: 2026-10-21]'],
  }]), { inWeek: 2, due: 1 });
});
