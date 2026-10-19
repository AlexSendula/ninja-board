// A past week groups a story's lines under the story as a card (ui/past.ts draws it, and the Week view folds it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import { recordWeek } from './past.ts';
import { parseWeekRecord, weekPlanPath } from './record.ts';
import type { WeekRecord } from './record.ts';
import type { PastWeekVM, RawNote, RecordRowVM, VaultSnapshot, WeekHeadVM } from './types.ts';
import { loadSample, readSample } from '../../test/sample.ts';

const TODAY = '2026-10-13';
const SITE = '03 Projects/Website for Sam';
const HEAD: Omit<WeekHeadVM, 'days'> = {
  label: 'WEEK 41', title: '5–11 October', start: '2026-10-05', today: TODAY,
  pager: { prev: '2026-09-28', next: '2026-10-12', thisWeek: '2026-10-12' },
};
const EMPTY: WeekRecord = { appointments: [], done: [], inProgress: [], notDone: [], backlog: [] };

/** A project with two stories, an area, and an area's task note, which is not a story. */
const VAULT: RawNote[] = [
  { path: `${SITE}/Website for Sam.md`, frontmatter: { type: 'project', status: 'active' }, lines: [] },
  { path: `${SITE}/Choose hosting.md`, frontmatter: { type: 'task', status: 'doing' }, lines: [] },
  { path: `${SITE}/Write copy.md`, frontmatter: { type: 'task', status: 'open' }, lines: [] },
  { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
  { path: '04 Areas/Home/Renew passport.md', frontmatter: { type: 'task', status: 'open' }, lines: [] },
];

const record = (r: Partial<WeekRecord>, s: VaultSnapshot = buildSnapshot(VAULT)): PastWeekVM => recordWeek(s, TODAY, HEAD, { ...EMPTY, ...r });
const col = (w: PastWeekVM, title: string): RecordRowVM[] => w.columns.find((c) => c.title === title)?.rows ?? assert.fail(`no ${title} column`);

/** Each row as [title, ...meta], and a card's lines as one more list of the same at the end. */
const shown = (rows: RecordRowVM[]): unknown[] =>
  rows.map((r) => [r.title, ...r.meta.map((p) => p.text), ...(r.lines ? [shown(r.lines)] : [])]);

// ---------- A record ----------

test('a record: a line whose context names a listed story is a line of its card, which stays in the story\'s own column', () => {
  const w = record({
    inProgress: [{ title: 'Choose hosting', context: 'Website for Sam' }],
    done: [
      { title: 'Shortlist three hosts', context: 'Choose hosting', day: '2026-10-07' },
      { title: 'Pay the water bill', context: 'Money', day: '2026-10-08' },
    ],
  });
  assert.deepEqual(shown(col(w, 'In progress')), [['Choose hosting', 'Website for Sam', [['Shortlist three hosts', 'Done Wed']]]]);
  assert.deepEqual(shown(col(w, 'Done')), [['Pay the water bill', 'Money', 'Done Thu']]);
  const [card] = col(w, 'In progress');
  assert.deepEqual([card.key, card.state, card.path, card.inbox], ['inProgress#0', 'doing', `${SITE}/Choose hosting.md`, false]);
  assert.deepEqual(card.lines?.map((l) => [l.key, l.state, l.path]), [['done#0', 'done', `${SITE}/Choose hosting.md`]]);
});

test('a record: the story is a task note inside a project in the snapshot, or another item listed in the same record', () => {
  const w = record({
    notDone: [{ title: 'Sort the permit', context: 'Home' }],
    done: [
      { title: 'Book the tiler', context: 'Write copy' },          // Write copy: a story note, not listed
      { title: 'Ring the council', context: 'Sort the permit' },   // listed in Not done, and no story note
      { title: 'Water the plants', context: 'Home' },              // an area
      { title: 'Plan the site', context: 'Website for Sam' },      // a project
      { title: 'Renew it', context: 'Renew passport' },            // a task note, but not in a project: no story
      { title: 'Lost line', context: 'A note nobody knows' },
      { title: 'No context' },
    ],
  });
  assert.deepEqual(shown(col(w, 'Not done')), [['Sort the permit', 'Home', [['Ring the council']]]]);
  assert.deepEqual(shown(col(w, 'Done')), [
    ['Write copy', [['Book the tiler']]],
    ['Water the plants', 'Home'],
    ['Plan the site', 'Website for Sam'],
    ['Renew it', 'Renew passport'],
    ['Lost line', 'A note nobody knows'],
    ['No context'],
  ]);
});

test('a record: a story that is not listed gets a card with no meta of its own, in the first of Not done, In progress, Done that holds a line', () => {
  const w = record({
    notDone: [{ title: 'Call the host', context: 'Choose hosting', moved: '2026-10-14' }],
    inProgress: [{ title: 'Draft the pages', context: 'Write copy' }],
    done: [
      { title: 'Compare plans', context: 'Choose hosting', day: '2026-10-06' },
      { title: 'Proofread', context: 'Write copy', day: '2026-10-09' },
    ],
  });
  assert.deepEqual(shown(col(w, 'Not done')), [['Choose hosting', [['Call the host', 'moved → Wed 14 Oct'], ['Compare plans', 'Done Tue']]]]);
  assert.deepEqual(shown(col(w, 'In progress')), [['Write copy', [['Draft the pages'], ['Proofread', 'Done Fri']]]]);
  assert.deepEqual(shown(col(w, 'Done')), []);
  const [hosting] = col(w, 'Not done');
  assert.deepEqual([hosting.key, hosting.state, hosting.path, hosting.meta], ['story:Choose hosting', 'todo', `${SITE}/Choose hosting.md`, []]);
  assert.deepEqual(hosting.lines?.map((l) => l.title), ['Call the host', 'Compare plans']);   // column order, then record order
  assert.equal(col(w, 'In progress')[0].state, 'doing');
});

test('a record: a card sits at its own row, else at its first line in the column it belongs to, and the counts are top-level', () => {
  const w = record({
    notDone: [
      { title: 'Plant the tomatoes', context: 'Home' },
      { title: 'Choose hosting', context: 'Website for Sam', due: '2026-10-09' },
      { title: 'Mow the lawn', context: 'Home' },
    ],
    inProgress: [{ title: 'Build the header', context: 'Write copy' }, { title: 'Sweep', context: 'Home' }, { title: 'Draft', context: 'Write copy' }],
    done: [{ title: 'Pick a host', context: 'Choose hosting', day: '2026-10-07' }, { title: 'Hang the mirror', context: 'Home' }],
  });
  assert.deepEqual(col(w, 'Not done').map((r) => r.title), ['Plant the tomatoes', 'Choose hosting', 'Mow the lawn']);
  assert.deepEqual(col(w, 'In progress').map((r) => r.title), ['Write copy', 'Sweep']);
  assert.deepEqual(col(w, 'Done').map((r) => r.title), ['Hang the mirror']);
  assert.deepEqual(w.columns.map((c) => c.rows.length), [3, 2, 1]);
  assert.deepEqual(shown([col(w, 'Not done')[1]]), [['Choose hosting', 'Website for Sam', 'Due Fri', [['Pick a host', 'Done Wed']]]]);
});

test('a record: the lines keep their own state and words, and a card keeps its own row\'s', () => {
  const w = record({
    notDone: [
      { title: 'Choose hosting', context: 'Website for Sam', due: '2026-10-09' },
      { title: 'Try a builder', context: 'Choose hosting', dropped: '2026-10-11' },
      { title: 'Ask Sam', context: 'Choose hosting', moved: '2026-10-15' },
      { title: 'Check the quote', context: 'Choose hosting', due: '2026-10-10' },
    ],
    inProgress: [{ title: 'Compare prices', context: 'Choose hosting' }],
    done: [{ title: 'List three options', context: 'Choose hosting', day: '2026-10-11' }],
  });
  const [card] = col(w, 'Not done');
  assert.deepEqual(card.meta, [{ text: 'Website for Sam' }, { text: 'Due Fri', when: 'due' }]);
  assert.deepEqual(card.lines?.map((l) => [l.title, l.state, l.meta]), [
    ['Try a builder', 'dropped', [{ text: 'dropped Sun' }]],
    ['Ask Sam', 'todo', [{ text: 'moved → Thu 15 Oct' }]],
    ['Check the quote', 'todo', [{ text: 'Due Sat', when: 'due' }]],
    ['Compare prices', 'doing', []],
    ['List three options', 'done', [{ text: 'Done Sun' }]],
  ]);
});

test('a record: the week\'s figures count the record\'s items, not the cards, and Backlog stays flat', () => {
  const w = record({
    inProgress: [{ title: 'Choose hosting', context: 'Website for Sam' }],
    done: [
      { title: 'Pick a host', context: 'Choose hosting', day: '2026-10-07' },
      { title: 'Pick a plan', context: 'Choose hosting', day: '2026-10-08' },
    ],
    notDone: [{ title: 'Call the host', context: 'Choose hosting' }],
    backlog: [{ title: 'Write the About page', context: 'Choose hosting' }, { title: 'Choose hosting', context: 'Website for Sam' }],
  });
  assert.deepEqual([w.done, w.total], [2, 4]);
  assert.deepEqual(w.days.map((d) => d.done), [0, 0, 1, 1, 0, 0, 0]);
  assert.deepEqual(w.columns.map((c) => c.rows.length), [0, 1, 0]);   // all three are lines of the story listed In progress
  assert.deepEqual(shown(w.backlog ?? []), [['Write the About page', 'Choose hosting'], ['Choose hosting', 'Website for Sam']]);
  assert.ok((w.backlog ?? []).every((r) => r.lines === undefined));
});

test('a record: a listed story that has lines is never a line of another card, and a row that names itself stays a row', () => {
  const w = record({
    inProgress: [{ title: 'Choose hosting', context: 'Write copy' }],   // names a story, and has lines of its own
    done: [
      { title: 'Pick a host', context: 'Choose hosting', day: '2026-10-07' },
      { title: 'Loop', context: 'Loop' },
    ],
  });
  assert.deepEqual(shown(col(w, 'In progress')), [['Choose hosting', 'Write copy', [['Pick a host', 'Done Wed']]]]);
  assert.deepEqual(shown(col(w, 'Done')), [['Loop', 'Loop']]);
});

test('a record: a story listed twice takes its lines in the first; the other stays a row', () => {
  const w = record({
    notDone: [{ title: 'Choose hosting', context: 'Website for Sam' }],
    inProgress: [{ title: 'Choose hosting', context: 'Website for Sam' }],
    done: [{ title: 'Pick a host', context: 'Choose hosting' }],
  });
  assert.deepEqual(shown(col(w, 'Not done')), [['Choose hosting', 'Website for Sam', [['Pick a host']]]]);
  assert.deepEqual(shown(col(w, 'In progress')), [['Choose hosting', 'Website for Sam']]);
});

test('the sample\'s week 41: the hosting lines sit in the story listed In progress, the quotes in a card of their own', () => {
  const note = readSample().find((n) => n.path === weekPlanPath('2026-10-05'));
  const rec = note && parseWeekRecord(note);
  assert.ok(rec);
  const w = recordWeek(loadSample(), TODAY, HEAD, rec);
  assert.deepEqual(w.columns.map((c) => c.rows.length), [3, 2, 4]);
  assert.deepEqual(shown(col(w, 'In progress')), [
    ["Choose hosting for Sam's site", 'Website for Sam', [['List three hosting options', 'Done Sun']]],
    ['Build the homepage header', 'Website for Sam'],
  ]);
  assert.deepEqual(shown(col(w, 'Done')), [
    ['Hang the hallway mirror', 'Home', 'Done Tue'],
    ['Cancel the old gym membership', 'Health', 'Done Tue'],
    ['Pay the water bill', 'Money', 'Done Thu'],
    ['Choose a contractor', [['Get three quotes', 'Done Fri']]],
  ]);
  assert.deepEqual([w.done, w.total], [5, 10]);
});

// ---------- From your notes ----------

/** Week 40 (28 Sep – 4 Oct), seen from today: stories with done and open lines, a story done that week, and loose lines. */
const NOTES_VAULT: RawNote[] = [
  { path: `${SITE}/Website for Sam.md`, frontmatter: { type: 'project', status: 'active' }, lines: ['- [x] Buy the domain [completion:: 2026-09-29]'] },
  {
    path: `${SITE}/Choose hosting.md`,
    frontmatter: { type: 'task', status: 'doing', due: '2026-10-02' },   // listed itself, in Not done
    lines: ['- [x] Shortlist hosts [completion:: 2026-09-30]', '- [ ] Ask about backups [scheduled:: 2026-10-01]', '- [x] Compare prices [completion:: 2026-10-01]'],
  },
  {
    path: `${SITE}/Write copy.md`,
    frontmatter: { type: 'task', status: 'open' },   // not listed: it has no date that week
    lines: ['- [x] Draft the home page [completion:: 2026-10-02]', '- [x] Proofread [completion:: 2026-10-02]'],
  },
  {
    path: `${SITE}/Plan the launch.md`,
    frontmatter: { type: 'task', status: 'open' },   // not listed, with an open line and a done one
    lines: ['- [x] Book the venue [completion:: 2026-09-29]', '- [ ] Send the invitations [scheduled:: 2026-10-03]'],
  },
  { path: `${SITE}/Set up mail.md`, frontmatter: { type: 'task', status: 'done', done: '2026-10-03' }, lines: ['- [x] Pick a provider [completion:: 2026-10-03]'] },
  { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: ['- [x] Fix the bike light [completion:: 2026-10-04]'] },
  { path: '04 Areas/Home/Renew passport.md', frontmatter: { type: 'task', status: 'open' }, lines: ['- [x] Take the photo [completion:: 2026-10-01]'] },
];
const notes = (raw: RawNote[] = NOTES_VAULT): PastWeekVM => {
  const w = buildWeek(buildSnapshot(raw), TODAY, { start: '2026-09-28' });
  assert.ok(w.kind === 'past');
  return w;
};

test('from your notes: the lines of a story note are the lines of its card; lines of a project, an area or another task note stay rows', () => {
  const w = notes();
  assert.deepEqual(shown(col(w, 'Done')), [
    ['Buy the domain', 'Website for Sam', 'Done Tue'],
    ['Take the photo', 'Renew passport', 'Done Thu'],
    ['Write copy', [['Draft the home page', 'Done Fri'], ['Proofread', 'Done Fri']]],
    ['Set up mail', 'Website for Sam', 'Done Sat', [['Pick a provider', 'Done Sat']]],
    ['Fix the bike light', 'Home', 'Done Sun'],
  ]);
});

test('from your notes: the card is in its own row\'s column, else the first of Not done and Done that holds a line', () => {
  const w = notes();
  assert.deepEqual(shown(col(w, 'Not done')), [
    ['Choose hosting', 'Website for Sam', 'Due Fri', [['Ask about backups', 'Planned Thu'], ['Shortlist hosts', 'Done Wed'], ['Compare prices', 'Done Thu']]],
    ['Plan the launch', [['Send the invitations', 'Planned Sat'], ['Book the venue', 'Done Tue']]],
  ]);
  assert.deepEqual(col(w, 'Not done').map((r) => [r.key, r.state]), [
    [`${SITE}/Choose hosting.md`, 'doing'],
    [`${SITE}/Plan the launch.md`, 'todo'],
  ]);
});

test('from your notes: the figures count lines and notes, not cards, and the counts are top-level', () => {
  const w = notes();
  assert.equal(w.done, 10);   // ten done lines and notes, in cards or not
  assert.deepEqual(w.days.map((d) => d.done), [0, 2, 1, 2, 2, 2, 1]);
  assert.deepEqual(w.columns.map((c) => [c.title, c.rows.length]), [['Not done', 2], ['Done', 5]]);
});

test('from your notes: a story with no line that week stays a plain row', () => {
  const w = notes([
    { path: `${SITE}/Website for Sam.md`, frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: `${SITE}/Set up mail.md`, frontmatter: { type: 'task', status: 'done', done: '2026-10-03' }, lines: ['- [ ] Later'] },
  ]);
  assert.deepEqual(shown(col(w, 'Done')), [['Set up mail', 'Website for Sam', 'Done Sat']]);
  assert.equal(col(w, 'Done')[0].lines, undefined);
});
