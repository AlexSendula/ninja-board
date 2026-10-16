// A repeating task note's completed occurrences (weeks design, section 8, ruling 1): the Log lines that Brain and `brain complete`
// write. The note sits where its next due date puts it; each occurrence dated in a week is a Done row in that week's Done column.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import type { RawNote, RowVM, ThisWeekVM, VaultSnapshot } from './types.ts';

const TODAY = '2026-10-20';   // Tuesday of week 43: Mon 19 to Sun 25 October

const HEALTH: RawNote = { path: '04 Areas/Health/Health.md', frontmatter: { type: 'area' }, lines: [] };

/** The Dentist checkup: every 6 months from the done date, its next due in 2027, and one occurrence logged on `on`. */
function dentist(logged: string[], due = '2027-04-20'): RawNote {
  return {
    path: '04 Areas/Health/Dentist checkup.md',
    frontmatter: { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due },
    lines: ['## Log', ...logged],
  };
}
const OCCURRENCE_TUE = '- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2027-04-20.';

function week(s: VaultSnapshot, start?: string): ThisWeekVM {
  const w = buildWeek(s, TODAY, start === undefined ? {} : { start });
  assert.equal(w.kind, 'this');
  return w as ThisWeekVM;
}

function doneRows(vm: ThisWeekVM): RowVM[] {
  return vm.columns.done.flatMap((item) => (item.kind === 'row' ? [item.row] : []));
}

test('the snapshot reads each completed occurrence in the Log section', () => {
  const [note] = buildSnapshot([HEALTH, dentist([OCCURRENCE_TUE])]).notes.filter((n) => n.name === 'Dentist checkup');
  assert.deepEqual(note?.occurrences, [{ on: '2026-10-20', due: '2026-10-16', next: '2027-04-20', nth: 1 }]);
});

test('a note with no Log section has no occurrences', () => {
  const [note] = buildSnapshot([HEALTH, { ...dentist([]), lines: [] }]).notes.filter((n) => n.name === 'Dentist checkup');
  assert.equal(note?.occurrences, undefined);
});

test('an occurrence dated this week is a Done row, titled and dated, with the repeat mark; the note moves to its next date', () => {
  const vm = week(buildSnapshot([HEALTH, dentist([OCCURRENCE_TUE])]));
  const [row] = doneRows(vm);
  assert.equal(row?.title, 'Dentist checkup');
  assert.equal(row?.key, '04 Areas/Health/Dentist checkup.md@2026-10-20');
  assert.deepEqual(row?.meta.map((p) => p.text), ['Health', 'Done today']);   // the day it was done is today here
  assert.equal(row?.repeating, true);
  assert.equal(row?.occurrence, true);
  assert.equal(row?.state, 'done');
  // Its next date is in April: the note is in no week of this one, so it is not on the board again.
  assert.equal(vm.columns.todo.length, 0);
});

test('two completions of one note on the same day are two Done rows: the second one\'s key ends #2', () => {
  const vm = week(buildSnapshot([HEALTH, dentist([OCCURRENCE_TUE, '- 2026-10-20 Done: the occurrence due 2026-10-13. Next due 2026-10-16.'])]));
  assert.deepEqual(doneRows(vm).map((r) => r.key), [
    '04 Areas/Health/Dentist checkup.md@2026-10-20',
    '04 Areas/Health/Dentist checkup.md@2026-10-20#2',
  ]);
  assert.equal(vm.done, 2);
});

test('the week counts an occurrence as done, in the tasks figure', () => {
  const vm = week(buildSnapshot([HEALTH, dentist([OCCURRENCE_TUE])]));
  assert.equal(vm.done, 1);
});

test('an occurrence dated in another week is not a Done row here', () => {
  const vm = week(buildSnapshot([HEALTH, dentist(['- 2026-10-12 Done: the occurrence due 2026-10-06. Next due 2027-04-12.'], '2027-04-12')]));
  assert.equal(doneRows(vm).length, 0);
  assert.equal(vm.done, 0);
});

test('a repeating note whose next due date is this week is on the board, and its occurrence is done this week too', () => {
  const vm = week(buildSnapshot([HEALTH, dentist([OCCURRENCE_TUE], '2026-10-23')]));
  assert.deepEqual(vm.columns.todo.map((i) => (i.kind === 'row' ? i.row.title : '')), ['Dentist checkup']);
  assert.deepEqual(doneRows(vm).map((r) => r.key), ['04 Areas/Health/Dentist checkup.md@2026-10-20']);
  assert.equal(vm.done, 1);
});

test('a week with no record shows the occurrence in its Done column too, from the note\'s Log', () => {
  const w = buildWeek(buildSnapshot([HEALTH, dentist([OCCURRENCE_TUE])]), '2026-11-02', { start: '2026-10-19' });
  assert.equal(w.kind, 'past');
  const done = w.kind === 'past' ? w.columns.find((c) => c.title === 'Done')?.rows ?? [] : [];
  assert.deepEqual(done.map((r) => [r.title, r.path, r.meta.map((p) => p.text)]), [
    ['Dentist checkup', '04 Areas/Health/Dentist checkup.md', ['Health', 'Done Tue']],
  ]);
});
