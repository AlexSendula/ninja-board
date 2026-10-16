// A repeating task note can be planned like any task note: its plan decides its week, and its deadline stays in the
// file and on its row, placing it nowhere while the plan lasts. The picks, the card's copy of the dates and the week
// rule all read the same thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BoardItem, NoteInfo, PlanDates, RawNote, ThisWeekVM, UpcomingWeekVM, VaultSnapshot } from './types.ts';
import { applyEdit, dayChips, pickDay, pickNoDate, pickWeek } from './plan.ts';
import { notePlan } from './rows.ts';
import { buildSnapshot } from './snapshot.ts';
import { buildToday } from './today.ts';
import { buildWeek } from './week.ts';

const TODAY = '2026-10-13';   // a Tuesday: this week is 12 to 18 October
const F14 = '2026-10-14';
const F16 = '2026-10-16';     // the Dentist checkup's deadline: a Friday in this week
const F21 = '2026-10-21';
const MON19 = '2026-10-19';

/** The Home area and its task notes. */
function home(...notes: RawNote[]): VaultSnapshot {
  return buildSnapshot([{ path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] }, ...notes]);
}

/** Dentist checkup: every six months from its done date, due Fri 16 October; any more frontmatter given. */
function dentist(fm: Record<string, unknown> = {}): RawNote {
  return {
    path: '04 Areas/Home/Dentist checkup.md',
    frontmatter: { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: F16, ...fm },
    lines: [],
  };
}

/** A plain task note of the Home area, due on `due`. */
function plain(name: string, due: string): RawNote {
  return { path: `04 Areas/Home/${name}.md`, frontmatter: { type: 'task', status: 'open', due }, lines: [] };
}

const titles = (items: BoardItem[]) => items.map((i) => (i.kind === 'row' ? i.row.title : i.card.title));

test('notePlan: a repeating open note carries its deadline as its plan, as any open note does', () => {
  const n: NoteInfo = home(dentist()).notes.find((x) => x.name === 'Dentist checkup')!;
  assert.deepEqual(notePlan(n), { due: F16 });
});

test('pickDay, a repeating note: a day sets the do day, the do day again clears it, and the deadline stays', () => {
  assert.deepEqual(pickDay({ due: F16 }, F14, TODAY, true), {
    next: { plan: F14, due: F16 }, edits: [{ kind: 'plan', to: { day: F14 } }],
  });
  assert.deepEqual(pickDay({ plan: F14, due: F16 }, F14, TODAY, true), {
    next: { due: F16 }, edits: [{ kind: 'plan', to: null }],
  });
});

test('pickDay, a repeating note on its red day: a left click sets the do day only, and writes no deadline', () => {
  assert.deepEqual(pickDay({ due: F16 }, F16, TODAY, true), {
    next: { plan: F16, due: F16 }, edits: [{ kind: 'plan', to: { day: F16 } }],
  });
});

test('dayChips, a repeating note whose do day is its deadline: the day is pressed and still due; a plain note\'s is pressed only', () => {
  const repeating = dayChips('2026-10-12', { scheduled: F16, due: F16 }, TODAY, true)[4];
  assert.deepEqual([repeating.pressed, repeating.due, repeating.label], [true, true, 'Friday 16 October, planned, due']);
  const plain = dayChips('2026-10-12', { scheduled: F16, due: F16 }, TODAY)[4];
  assert.deepEqual([plain.pressed, plain.due], [true, false]);
});

test('pickWeek and pickNoDate, a repeating note: a week it is already planned for writes nothing, and no date yet keeps the deadline', () => {
  // A plain note planned for the week would lose a deadline in an earlier week, so it writes; a repeating one keeps it.
  assert.deepEqual(pickWeek({ start: MON19, due: F16 }, MON19, TODAY), [{ kind: 'plan', to: { week: MON19 } }]);
  assert.deepEqual(pickWeek({ start: MON19, due: F16 }, MON19, TODAY, true), []);
  assert.deepEqual(pickNoDate({ due: F16 }, TODAY), [{ kind: 'plan', to: null }]);
  assert.deepEqual(pickNoDate({ due: F16 }, TODAY, true), []);
  assert.deepEqual(pickNoDate({ scheduled: F14, due: F16 }, TODAY, true), [{ kind: 'plan', to: null }]);
});

test('applyEdit, a repeating note: the card\'s copy of its dates keeps the deadline, as the file does', () => {
  const dates: PlanDates = { scheduled: F14, due: F16 };
  assert.deepEqual(applyEdit(dates, { kind: 'plan', to: { week: MON19 } }, TODAY, true), { start: MON19, due: F16 });
  assert.deepEqual(applyEdit(dates, { kind: 'plan', to: null }, TODAY, true), { due: F16 });
  assert.deepEqual(applyEdit({ due: F16 }, { kind: 'due', date: null }, TODAY, true), { due: F16 });
  assert.deepEqual(applyEdit(dates, { kind: 'plan', to: { week: MON19 } }, TODAY), { start: MON19 });   // a plain note loses its deadline
});

test('a repeating note planned for a day is in that day\'s week, not its deadline\'s: this week\'s board and strip leave it out', () => {
  const s = home(dentist({ scheduled: F21 }));   // Wed 21 October, next week
  const thisWeek = buildWeek(s, TODAY) as ThisWeekVM;
  assert.deepEqual(titles(thisWeek.columns.todo), []);
  assert.equal(thisWeek.days.find((d) => d.iso === F16)?.due, 0);   // the deadline counts only with no plan
  const next = buildWeek(s, TODAY, { start: MON19 }) as UpcomingWeekVM;
  assert.deepEqual(next.byDay.map((g) => [g.iso, g.rows.map((r) => r.title)]), [[F21, ['Dentist checkup']]]);
  const row = next.byDay[0].rows[0];
  assert.deepEqual(row.plan, { scheduled: F21, due: F16 });
  assert.equal(row.meta.some((p) => p.when === 'due'), true, 'the deadline stays in the meta');
});

test('a repeating note planned for a week is in that week, not its deadline\'s; To plan leaves repeating notes out either way', () => {
  const planned = home(dentist({ start: MON19 }));
  const next = buildWeek(planned, TODAY, { start: MON19 }) as UpcomingWeekVM;
  assert.deepEqual(next.byDay.map((g) => [g.label, g.rows.map((r) => r.title)]), [['Any day', ['Dentist checkup']]]);
  assert.deepEqual(titles((buildWeek(planned, TODAY) as ThisWeekVM).columns.todo), []);
  for (const s of [planned, home(dentist())]) assert.equal((buildWeek(s, TODAY, { start: MON19 }) as UpcomingWeekVM).toPlan.count, 0);
});

test('a repeating note with no plan is in its deadline\'s week; a week plan moves it out, and no date brings it back', () => {
  assert.deepEqual(titles((buildWeek(home(dentist()), TODAY) as ThisWeekVM).columns.todo), ['Dentist checkup']);
  assert.deepEqual(titles((buildWeek(home(dentist({ start: MON19 })), TODAY) as ThisWeekVM).columns.todo), []);
});

test('a repeating note planned for a day sorts by that day, not by its passed deadline, which a plan takes over: a to-do due Monday comes first', () => {
  const s = home(dentist({ scheduled: F14, due: '2026-10-09' }), plain('Renew passport', '2026-10-12'));
  assert.deepEqual(titles((buildWeek(s, TODAY) as ThisWeekVM).columns.todo), ['Renew passport', 'Dentist checkup']);
});

test('Today: a repeating note planned today sorts by its plan, not its passed deadline, so the overdue to-do comes first', () => {
  const s = home(dentist({ scheduled: F14, due: '2026-10-09' }), plain('Renew passport', '2026-10-12'));
  assert.deepEqual(buildToday(s, F14).today.map((r) => r.title), ['Renew passport', 'Dentist checkup']);
});
