import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import { loadSample, readSample } from '../../test/sample.ts';
import { recordWeek } from './past.ts';
import { parseWeekRecord, weekPlanPath } from './record.ts';
import type { WeekRecord } from './record.ts';
import type { PastWeekVM, RecordRowVM, VaultSnapshot, WeekHeadVM } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42
const sample = loadSample();

/** The week that holds `start`, which lies before this week. */
function past(s: VaultSnapshot, start: string): PastWeekVM {
  const w = buildWeek(s, TODAY, { start });
  assert.ok(w.kind === 'past', 'expected a past week');
  return w;
}

// Each row as [title, ...meta].
const shown = (rows: RecordRowVM[]) => rows.map((r) => [r.title, ...r.meta.map((p) => p.text)]);

test('week 40 from your notes: the head, the source line and the figure', () => {
  const w = past(sample, '2026-09-28');
  assert.deepEqual([w.label, w.title, w.start, w.today], ['WEEK 40', '28 Sep – 4 Oct', '2026-09-28', TODAY]);
  assert.deepEqual(w.pager, { prev: '2026-09-21', next: '2026-10-05', thisWeek: '2026-10-12' });
  assert.deepEqual(w.source, [{ text: 'From your notes' }]);
  assert.equal(w.done, 5);
  assert.equal(w.total, undefined);
  assert.equal(w.backlog, undefined);
});

test('week 40: Done holds what was finished that week, by day; nothing was left open', () => {
  const w = past(sample, '2026-09-28');
  assert.deepEqual(w.columns.map((c) => [c.title, c.empty, c.rows.length]), [
    ['Not done', 'Nothing left open', 0],
    ['Done', 'Nothing done that week', 5],
  ]);
  const done = w.columns[1].rows;
  assert.deepEqual(shown(done), [
    ['Move the direct debits', 'Move to a new bank', 'Done Wed'],
    ['Send the meter reading', 'Money', 'Done Thu'],
    ['Close the old account', 'Move to a new bank', 'Done Fri'],
    ['Cancel the old bank cards', 'Move to a new bank', 'Done Fri'],
    ['Fix the bike light', 'Home', 'Done Sat'],
  ]);
  const bank = '03 Projects/Move to a new bank/Move to a new bank.md';
  assert.deepEqual(done[0], {
    key: `${bank}#10`, title: 'Move the direct debits', state: 'done', path: bank,
    meta: [{ text: 'Move to a new bank' }, { text: 'Done Wed' }], inbox: false,
  });
});

test("week 40's days: what was done on each, the appointments, and every day past", () => {
  const w = past(sample, '2026-09-28');
  assert.deepEqual(w.days.map((d) => d.dayNum), [28, 29, 30, 1, 2, 3, 4]);
  assert.deepEqual(w.days.map((d) => d.done), [0, 0, 1, 1, 2, 1, 0]);
  assert.deepEqual(w.days.map((d) => d.events.map((e) => e.title)), [[], ['Dance class'], [], [], [], [], []]);
  assert.ok(w.days.every((d) => d.isPast && !d.isToday && d.planned === 0 && d.due === 0));
});

test('from your notes: open tasks due, planned or starting that week are Not done, by the date shown', () => {
  const w = past(buildSnapshot([
    {
      path: '04 Areas/Home/Home.md',
      frontmatter: { type: 'area' },
      lines: [
        '- [ ] Sweep the porch [scheduled:: 2026-10-03]',
        '- [w] Hear back from the plumber [scheduled:: 2026-10-01]',
        '- [ ] Paint the shed [due:: 2026-09-30] [scheduled:: 2026-10-02]',
        '- [/] Fix the gate [due:: 2026-10-08] [scheduled:: 2026-09-29]',
        '- [x] Oil the hinges [completion:: 2026-10-02]',
        '- [ ] Tile the patio [due:: 2026-10-12]',
      ],
    },
    { path: '04 Areas/Home/Renew passport.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-04' }, lines: [] },
    { path: '04 Areas/Home/Water the plants.md', frontmatter: { type: 'task', status: 'done', done: '2026-09-28' }, lines: [] },
  ]), '2026-09-28');
  const [notDone, done] = w.columns;
  assert.deepEqual(shown(notDone.rows), [
    ['Fix the gate', 'Home', 'Planned Tue'],
    ['Paint the shed', 'Home', 'Due Wed'],
    ['Hear back from the plumber', 'Home', 'Chase Thu'],
    ['Sweep the porch', 'Home', 'Planned Sat'],
    ['Renew passport', 'Home', 'Due Sun'],
  ]);
  assert.deepEqual(notDone.rows.map((r) => r.state), ['doing', 'todo', 'waiting', 'todo', 'todo']);
  assert.deepEqual(shown(done.rows), [
    ['Water the plants', 'Home', 'Done Mon'],
    ['Oil the hinges', 'Home', 'Done Fri'],
  ]);
  assert.deepEqual(done.rows.map((r) => r.key), ['04 Areas/Home/Water the plants.md', '04 Areas/Home/Home.md#4']);
  assert.deepEqual(w.days.map((d) => d.done), [1, 0, 0, 0, 1, 0, 0]);
  assert.equal(w.done, 2);
});

test('from your notes: each Not done word carries its when, and a week plan reads Any day', () => {
  const w = past(buildSnapshot([{
    path: '04 Areas/Home/Home.md',
    frontmatter: { type: 'area' },
    lines: [
      '- [ ] Book the boiler service [start:: 2026-09-30]',
      '- [ ] Sweep the porch [scheduled:: 2026-10-01]',
      '- [w] Hear back from the plumber [scheduled:: 2026-10-01]',
      '- [ ] Paint the shed [due:: 2026-10-03]',
    ],
  }]), '2026-09-28');
  const rows = w.columns[0].rows;
  assert.deepEqual(shown(rows), [
    ['Book the boiler service', 'Home', 'Any day'],
    ['Sweep the porch', 'Home', 'Planned Thu'],
    ['Hear back from the plumber', 'Home', 'Chase Thu'],
    ['Paint the shed', 'Home', 'Due Sat'],
  ]);
  assert.deepEqual(rows.map((r) => r.meta.at(-1)?.when), ['plan', 'plan', 'plan', 'due']);
});

test('an empty vault: a past week with two empty columns', () => {
  const w = past({ notes: [] }, '2026-09-28');
  assert.equal(w.done, 0);
  assert.deepEqual(w.columns.map((c) => c.rows), [[], []]);
  assert.ok(w.days.every((d) => d.done === 0 && d.events.length === 0));
});

// ---------- A past week from its record (Task 8) ----------

const W41_HEAD: Omit<WeekHeadVM, 'days'> = {
  label: 'WEEK 41',
  title: '5–11 October',
  start: '2026-10-05',
  today: TODAY,
  pager: { prev: '2026-09-28', next: '2026-10-12', thisWeek: '2026-10-12' },
};
const EMPTY_RECORD: WeekRecord = { appointments: [], done: [], inProgress: [], notDone: [], backlog: [] };
const w41 = recordWeek(sample, TODAY, W41_HEAD, w41Record());

/** The record in the sample's week 41 plan. */
function w41Record(): WeekRecord {
  const note = readSample().find((n) => n.path === weekPlanPath(W41_HEAD.start));
  const record = note && parseWeekRecord(note);
  if (!record) throw new Error('the sample has no week 41 record');
  return record;
}

/** The path of the sample note with this name. */
function pathOf(name: string): string {
  const n = sample.notes.find((x) => x.name === name);
  if (!n) throw new Error('no note named ' + name);
  return n.path;
}

test('week 41 from its record: the head, the source line, the ring numbers and three columns', () => {
  assert.equal(w41.kind, 'past');
  assert.deepEqual([w41.label, w41.title, w41.start, w41.pager], [W41_HEAD.label, W41_HEAD.title, W41_HEAD.start, W41_HEAD.pager]);
  assert.deepEqual(w41.source, [{ text: 'Record' }, { text: 'frozen Mon 12 Oct' }]);
  assert.deepEqual([w41.done, w41.total], [5, 10]);   // 5 done, of 5 done + 2 in progress + 3 not done
  assert.deepEqual(w41.columns.map((c) => [c.title, c.empty, c.rows.length]), [
    ['Not done', 'Nothing left open', 3],
    ['In progress', 'Nothing in progress', 2],
    ['Done', 'Nothing done that week', 4],   // 5 done: one is a line of the story listed In progress, which holds it as its card
  ]);
});

test('week 41, Not done: due that week, moved out of it, dropped; each opens its note', () => {
  const [notDone] = w41.columns;
  assert.deepEqual(shown(notDone.rows), [
    ['Book a physio session', 'Health', 'Due Sat'],
    ['Clean the gutters', 'Home', 'moved → Thu 15 Oct'],
    ['Try a page builder', 'Website for Sam', 'dropped Sun'],
  ]);
  // The deadline is a due part (red); a moved or dropped word is plain.
  assert.deepEqual(notDone.rows.map((r) => r.meta), [
    [{ text: 'Health' }, { text: 'Due Sat', when: 'due' }],
    [{ text: 'Home' }, { text: 'moved → Thu 15 Oct' }],
    [{ text: 'Website for Sam' }, { text: 'dropped Sun' }],
  ]);
  assert.deepEqual(notDone.rows.map((r) => [r.key, r.state, r.path, r.inbox]), [
    ['notDone#0', 'todo', pathOf('Health'), false],
    ['notDone#1', 'todo', pathOf('Home'), false],
    ['notDone#2', 'dropped', pathOf('Website for Sam'), false],
  ]);
});

test('week 41, In progress: a story opens itself, a line opens the note it sits in', () => {
  const inProgress = w41.columns[1];
  assert.deepEqual(shown(inProgress.rows), [
    ["Choose hosting for Sam's site", 'Website for Sam'],
    ['Build the homepage header', 'Website for Sam'],
  ]);
  assert.deepEqual(inProgress.rows.map((r) => [r.state, r.path]), [
    ['doing', pathOf("Choose hosting for Sam's site")],
    ['doing', pathOf('Website for Sam')],
  ]);
});

test('week 41, Done: the day each was done; the lines of a story are in its card', () => {
  const done = w41.columns[2];
  assert.deepEqual(shown(done.rows), [
    ['Hang the hallway mirror', 'Home', 'Done Tue'],
    ['Cancel the old gym membership', 'Health', 'Done Tue'],
    ['Pay the water bill', 'Money', 'Done Thu'],
    ['Choose a contractor'],
  ]);
  assert.ok(done.rows.every((r) => r.state === 'done'));
  assert.deepEqual(done.rows.map((r) => r.path), [
    pathOf('Home'), pathOf('Health'), pathOf('Money'), pathOf('Choose a contractor'),
  ]);
  // Get three quotes is Done Fri; the card has no meta of its own, its story is not listed
  assert.deepEqual(shown(done.rows[3].lines ?? []), [['Get three quotes', 'Done Fri']]);
  assert.deepEqual(shown(w41.columns[1].rows[0].lines ?? []), [['List three hosting options', 'Done Sun']]);
});

test('week 41, Backlog: the inbox item gets a dot and opens nothing; the rest open their note', () => {
  const backlog = w41.backlog ?? [];
  assert.deepEqual(shown(backlog), [
    ['Podcast tip from Sam', 'Inbox'],
    ['Write the About page text', 'Website for Sam'],
    ['Measure the kitchen walls', 'Renovate the kitchen'],
    ['Order new running shoes', 'Health'],
  ]);
  assert.deepEqual(backlog.map((r) => [r.state, r.inbox, r.path]), [
    ['todo', true, undefined],
    ['todo', false, pathOf('Website for Sam')],
    ['todo', false, pathOf('Renovate the kitchen')],
    ['todo', false, pathOf('Health')],
  ]);
});

test("week 41's days: the record's appointments and what was done each day, every day past", () => {
  assert.deepEqual(w41.days.map((d) => d.dayNum), [5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(w41.days.map((d) => d.done), [0, 2, 0, 1, 1, 0, 1]);
  assert.ok(w41.days.every((d) => d.isPast && !d.isToday && d.planned === 0 && d.due === 0));
  assert.deepEqual(w41.days.map((d) => d.events.map((e) => [e.key, e.title, e.start, e.end, e.where, e.path])), [
    [],
    [['record@0', 'Dance class', '20:15', undefined, 'Studio Tempo', pathOf('Dance class')]],
    [],
    [['record@1', 'Kitchen showroom', '10:00', undefined, 'Kitchen Corner', pathOf('2026-10-08 Kitchen showroom')]],
    [],
    [],
    [],
  ]);
});

test('a record item opens the note named like its title, then like it after a date, then like its context', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    { path: '04 Areas/Home/Plumber.md', frontmatter: { type: 'task', status: 'open' }, lines: [] },
    { path: '04 Areas/Home/2026-10-07 Plumber.md', frontmatter: { type: 'appointment', date: '2026-10-07' }, lines: [] },
    { path: '04 Areas/Home/2026-10-08 Painter.md', frontmatter: { type: 'appointment', date: '2026-10-08', where: 'Hallway' }, lines: [] },
    { path: '02 Inbox/2026-10-06 0930 Podcast tip.md', frontmatter: { type: 'inbox' }, lines: [] },
  ]);
  const w = recordWeek(s, TODAY, W41_HEAD, {
    ...EMPTY_RECORD,
    appointments: [
      { title: 'Painter', context: 'Home', day: '2026-10-08', time: '09:00-09:30' },
      { title: 'Haircut', day: '2026-10-07', time: '14:00' },
    ],
    backlog: [
      { title: 'Plumber', context: 'Home' },
      { title: 'Painter', context: 'Home' },
      { title: 'Podcast tip', context: 'Inbox' },
      { title: 'Fix the tap', context: 'Home' },
      { title: 'Mystery' },
    ],
  });
  assert.deepEqual(w.backlog?.map((r) => [r.title, r.path, r.inbox]), [
    ['Plumber', '04 Areas/Home/Plumber.md', false],   // the exact name wins over the dated one
    ['Painter', '04 Areas/Home/2026-10-08 Painter.md', false],
    ['Podcast tip', '02 Inbox/2026-10-06 0930 Podcast tip.md', true],
    ['Fix the tap', '04 Areas/Home/Home.md', false],
    ['Mystery', undefined, false],
  ]);
  // An appointment no note matches keeps an empty path: the strip shows it as plain text.
  assert.deepEqual(w.days.flatMap((d) => d.events.map((e) => [d.iso, e.title, e.start, e.end, e.where, e.path])), [
    ['2026-10-07', 'Haircut', '14:00', undefined, undefined, ''],
    ['2026-10-08', 'Painter', '09:00', '09:30', 'Hallway', '04 Areas/Home/2026-10-08 Painter.md'],
  ]);
});

test('a record item with a day opens the note of its own day when two notes share its title', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Health/2025-04-02 Dentist.md', frontmatter: { type: 'appointment', date: '2025-04-02' }, lines: [] },
    { path: '04 Areas/Health/2026-10-08 Dentist.md', frontmatter: { type: 'appointment', date: '2026-10-08' }, lines: [] },
  ]);
  const w = recordWeek(s, TODAY, W41_HEAD, {
    ...EMPTY_RECORD,
    appointments: [{ title: 'Dentist', day: '2026-10-08', time: '09:00' }],
    backlog: [
      { title: 'Dentist', context: 'Health', day: '2026-10-08' },
      { title: 'Dentist', context: 'Health' },                  // no day: the first in snapshot order
      { title: 'Dentist', context: 'Health', day: '2026-10-20' },   // no note of that day: the first in snapshot order
    ],
  });
  assert.deepEqual(w.backlog?.map((r) => r.path), [
    '04 Areas/Health/2026-10-08 Dentist.md',
    '04 Areas/Health/2025-04-02 Dentist.md',
    '04 Areas/Health/2025-04-02 Dentist.md',
  ]);
  assert.deepEqual(w.days[3].events.map((e) => e.path), ['04 Areas/Health/2026-10-08 Dentist.md']);
});

test("a record's Not done word: dropped, else moved, else due, else the day; Done without a day has none", () => {
  const w = recordWeek(sample, TODAY, W41_HEAD, {
    ...EMPTY_RECORD,
    notDone: [
      { title: 'A', context: 'Home', day: '2026-10-09', due: '2026-10-08', moved: '2026-10-20', dropped: '2026-10-10' },
      { title: 'B', context: 'Home', day: '2026-10-09', due: '2026-10-08', moved: '2027-01-05' },
      { title: 'C', day: '2026-10-09', due: '2026-10-08' },
      { title: 'D', day: '2026-10-09' },
      { title: 'E', context: 'Home' },
    ],
    done: [{ title: 'F', context: 'Money' }],
  });
  assert.deepEqual(shown(w.columns[0].rows), [
    ['A', 'Home', 'dropped Sat'],
    ['B', 'Home', 'moved → Tue 5 Jan 2027'],
    ['C', 'Due Thu'],
    ['D', 'Fri'],
    ['E', 'Home'],
  ]);
  assert.deepEqual(w.columns[0].rows.map((r) => r.state), ['dropped', 'todo', 'todo', 'todo', 'todo']);
  assert.deepEqual(w.columns[0].rows[2].meta, [{ text: 'Due Thu', when: 'due' }]);
  assert.deepEqual(shown(w.columns[2].rows), [['F', 'Money']]);
  assert.ok(w.days.every((d) => d.done === 0));
});

test('a record not frozen yet reads "updated …"; with neither date just "Record"; an empty one counts 0 of 0', () => {
  const updated = recordWeek(sample, TODAY, W41_HEAD, { ...EMPTY_RECORD, updated: '2026-10-11' });
  assert.deepEqual(updated.source, [{ text: 'Record' }, { text: 'updated Sun 11 Oct' }]);
  const bare = recordWeek(sample, TODAY, W41_HEAD, EMPTY_RECORD);
  assert.deepEqual(bare.source, [{ text: 'Record' }]);
  assert.deepEqual([bare.done, bare.total, bare.backlog], [0, 0, []]);
  assert.deepEqual(bare.columns.map((c) => c.rows), [[], [], []]);
  assert.ok(bare.days.every((d) => d.events.length === 0 && d.done === 0));
});
