import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoteInfo, RowVM, TaskLine, TaskState, VaultSnapshot } from './types.ts';
import { loadSample } from '../../test/sample.ts';
import { buildSnapshot } from './snapshot.ts';
import { displayText } from './taskLine.ts';
import { META_BREAK, dateParts, lineRow, noteRow } from './rows.ts';

const TODAY = '2026-10-13';
const sample = loadSample();

function noteIn(s: VaultSnapshot, name: string): NoteInfo {
  const n = s.notes.find((x) => x.name === name);
  if (!n) throw new Error(`no note named ${name}`);
  return n;
}

function lineIn(s: VaultSnapshot, noteName: string, title: string): [TaskLine, NoteInfo] {
  const n = noteIn(s, noteName);
  const t = n.tasks.find((x) => displayText(x.text) === title);
  if (!t) throw new Error(`${noteName} has no line "${title}"`);
  return [t, n];
}

// "3 days overdue (overdue)": the text, with the tone when there is one.
const meta = (r: RowVM) => r.meta.map((p) => (p.tone ? `${p.text} (${p.tone})` : p.text));

test('lineRow: a doing line in a project note', () => {
  const [t, n] = lineIn(sample, 'Website for Sam', 'Build the homepage header');
  const row = lineRow(t, n, TODAY);
  assert.equal(row.key, `${t.path}#${t.line}`);
  assert.deepEqual(row.target, { kind: 'line', path: t.path, line: t.line, raw: t.raw });
  assert.equal(row.title, 'Build the homepage header');
  assert.equal(row.state, 'doing');
  assert.deepEqual(meta(row), ['Website for Sam', 'Planned today']);
  assert.equal(row.ariaLabel, 'Build the homepage header, in progress');
  assert.equal(row.repeating, false);
  assert.equal(row.draggable, false);
});

test('lineRow: the parent, then the one date the state calls for', () => {
  const cases: [string, string, string[], string][] = [
    ['Website for Sam', 'Pick design B with Sam', ['Website for Sam', 'Done yesterday'], 'Pick design B with Sam'],
    ['Website for Sam', 'Send Sam the hosting options', ['Website for Sam', 'Due Sat'], 'Send Sam the hosting options'],
    ['Website for Sam', 'Get photos from Sam', ['Website for Sam', 'Chase 20 Oct'], 'Get photos from Sam, waiting'],
    ['Website for Sam', 'Write the About page text', ['Website for Sam'], 'Write the About page text'],
    ['Health', 'Book a physio session', ['Health', '3 days overdue (overdue)'], 'Book a physio session, 3 days overdue'],
    ['Home', 'Clean the gutters', ['Home', 'Planned Thu'], 'Clean the gutters'],
    ['Choose a contractor', 'Get the written quote from Bram', ['Choose a contractor', 'Chase Thu'], 'Get the written quote from Bram, waiting'],
  ];
  for (const [noteName, title, expectedMeta, expectedLabel] of cases) {
    const [t, n] = lineIn(sample, noteName, title);
    const row = lineRow(t, n, TODAY);
    assert.deepEqual(meta(row), expectedMeta, title);
    assert.equal(row.ariaLabel, expectedLabel, title);
  }
});

test("lineRow: meta 'none' leaves out the parent; draggable is passed through", () => {
  const [t, n] = lineIn(sample, "Choose hosting for Sam's site", 'Compare prices and bandwidth');
  const row = lineRow(t, n, TODAY, { meta: 'none', draggable: true });
  assert.deepEqual(meta(row), ['Planned Wed']);
  assert.equal(row.draggable, true);
  assert.equal(row.ariaLabel, 'Compare prices and bandwidth, in progress');
});

test('lineRow: a dropped line shows no date, so it never reads as overdue', () => {
  const s = buildSnapshot([{
    path: 'Website.md',
    frontmatter: { type: 'project', status: 'active' },
    lines: ['- [-] Try a page builder [due:: 2026-10-10] [cancelled:: 2026-10-11]'],
  }]);
  const [t, n] = lineIn(s, 'Website', 'Try a page builder');
  const row = lineRow(t, n, TODAY);
  assert.equal(row.state, 'dropped');
  assert.deepEqual(meta(row), ['Website']);
  assert.equal(row.ariaLabel, 'Try a page builder, dropped');
});

test('noteRow: a repeating task note gets a second meta line', () => {
  const n = noteIn(sample, 'Dentist checkup');
  const row = noteRow(n, TODAY);
  assert.equal(row.key, n.path);
  assert.deepEqual(row.target, { kind: 'note', path: n.path, state: 'todo' });
  assert.equal(row.title, 'Dentist checkup');
  assert.equal(row.state, 'todo');
  assert.deepEqual(meta(row), ['Health', 'Due Fri', META_BREAK, 'Every 6 months']);
  assert.equal(row.repeating, true);
  assert.equal(row.draggable, false);
});

test('noteRow: a monthly repeat', () => {
  const row = noteRow(noteIn(sample, 'Pay rent'), TODAY);
  assert.deepEqual(meta(row), ['Money', 'Due 1 Nov', META_BREAK, 'Every month']);
});

test('noteRow: a story takes its state from status and names its project', () => {
  const row = noteRow(noteIn(sample, 'Choose a contractor'), TODAY);
  assert.equal(row.state, 'waiting');
  // A waiting note shows its chase date, then its deadline.
  assert.deepEqual(meta(row), ['Renovate the kitchen', 'Chase Thu', 'Due 24 Oct']);
  assert.equal(row.repeating, false);
  assert.equal(row.ariaLabel, 'Choose a contractor, waiting');
});

test('dateParts: a plan part, then a due part; done, dropped and undated rows', () => {
  type Dates = { due?: string; scheduled?: string; start?: string; chase?: string; completion?: string; done?: string };
  const parts = (state: TaskState, d: Dates) => dateParts(state, d, TODAY).map((p) => [p.iso, p.part]);
  assert.deepEqual(parts('todo', { scheduled: '2026-10-14' }), [['2026-10-14', { text: 'Planned Wed', when: 'plan' }]]);
  assert.deepEqual(parts('todo', { due: '2026-10-16' }), [['2026-10-16', { text: 'Due Fri', when: 'due' }]]);
  assert.deepEqual(parts('todo', { scheduled: '2026-10-13', due: '2026-10-16' }), [
    ['2026-10-13', { text: 'Planned today', when: 'plan' }],
    ['2026-10-16', { text: 'Due Fri', when: 'due' }],
  ]);
  assert.deepEqual(parts('todo', { start: '2026-10-19' }), [['2026-10-19', { text: 'Week 43', when: 'plan' }]]);
  // A day plan wins over a week plan on the same row.
  assert.deepEqual(parts('todo', { scheduled: '2026-10-14', start: '2026-10-19' }), [['2026-10-14', { text: 'Planned Wed', when: 'plan' }]]);
  assert.deepEqual(parts('todo', { start: '2026-10-12', due: '2026-10-10' }), [
    ['2026-10-12', { text: 'This week', when: 'plan' }],
    ['2026-10-10', { text: '3 days overdue', tone: 'overdue', when: 'due' }],
  ]);
  assert.deepEqual(parts('waiting', { chase: '2026-10-15', due: '2026-10-24' }), [
    ['2026-10-15', { text: 'Chase Thu', when: 'plan' }],
    ['2026-10-24', { text: 'Due 24 Oct', when: 'due' }],
  ]);
  assert.deepEqual(parts('done', { completion: '2026-10-12', due: '2026-10-10' }), [['2026-10-12', { text: 'Done yesterday' }]]);
  assert.deepEqual(parts('dropped', { scheduled: '2026-10-14', due: '2026-10-10' }), []);
  assert.deepEqual(parts('todo', {}), []);
});

test('noteRow: every status maps to a state; unknown ones count as todo', () => {
  const expected: Record<string, string> = {
    open: 'todo', someday: 'todo', doing: 'doing', waiting: 'waiting', done: 'done', dropped: 'dropped', odd: 'todo',
  };
  const s = buildSnapshot(Object.keys(expected).map((status) => ({
    path: `${status}.md`, frontmatter: { type: 'task', status }, lines: [],
  })));
  for (const [status, state] of Object.entries(expected)) {
    assert.equal(noteRow(noteIn(s, status), TODAY).state, state, status);
  }
});

// Task 7: which rows carry their dates in `plan`.
test('lineRow: a todo or doing line carries its dates in plan; waiting, done and dropped lines carry none', () => {
  const s = buildSnapshot([{
    path: '04 Areas/Home/Home.md',
    frontmatter: { type: 'area' },
    lines: [
      '- [ ] Clean the gutters [scheduled:: 2026-10-15]',
      '- [/] Build the shed',
      '- [w] Get the quote [scheduled:: 2026-10-20] [due:: 2026-10-30]',
      '- [ ] Back up the photos [start:: 2026-10-12]',
      '- [x] Fix the bike light [completion:: 2026-10-03]',
      '- [-] Try a page builder',
    ],
  }]);
  const home = s.notes[0];
  const planOf = (i: number) => lineRow(home.tasks[i], home, TODAY).plan;
  assert.deepEqual([0, 1, 3].map(planOf), [{ scheduled: '2026-10-15' }, {}, { start: '2026-10-12' }]);
  // A waiting line's scheduled date is its chase date: Brain does not plan it, so it has no plan and no drag.
  assert.deepEqual([2, 4, 5].map(planOf), [undefined, undefined, undefined]);
  assert.equal('plan' in lineRow(home.tasks[2], home, TODAY), false);
});

test('noteRow: an open or doing task note, a story and a repeating one included, carries its dates in plan; waiting, someday and done notes carry none', () => {
  const dir = '03 Projects/Website for Sam/';
  const s = buildSnapshot([
    { path: dir + 'Website for Sam.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: dir + 'Choose hosting.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-20' }, lines: [] },
    { path: '04 Areas/Home/Renew passport.md', frontmatter: { type: 'task', status: 'open', due: '2026-11-09' }, lines: [] },
    { path: '04 Areas/Home/Call the plumber.md', frontmatter: { type: 'task', status: 'doing', scheduled: '2026-10-21' }, lines: [] },
    { path: '04 Areas/Home/Book the boiler.md', frontmatter: { type: 'task', status: 'open', start: '2026-10-19' }, lines: [] },
    { path: '04 Areas/Home/Back up the laptop.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-22', repeat: 'every month' }, lines: [] },
    { path: '04 Areas/Home/Ring the council.md', frontmatter: { type: 'task', status: 'waiting', chase: '2026-10-21' }, lines: [] },
    { path: '04 Areas/Home/Fix the gate.md', frontmatter: { type: 'task', status: 'someday' }, lines: [] },
    { path: '04 Areas/Home/Paint the shed.md', frontmatter: { type: 'task', status: 'done', done: '2026-10-12' }, lines: [] },
  ]);
  const planOf = (name: string) => noteRow(noteIn(s, name), TODAY).plan;
  assert.deepEqual(
    ['Renew passport', 'Call the plumber', 'Book the boiler', 'Back up the laptop', 'Ring the council', 'Fix the gate', 'Paint the shed', 'Choose hosting']
      .map(planOf),
    [{ due: '2026-11-09' }, { scheduled: '2026-10-21' }, { start: '2026-10-19' }, { due: '2026-10-22' }, undefined, undefined, undefined, { due: '2026-10-20' }],
  );
});

// A dropped repeating note stops its repeat: no second meta line, and not repeating.
test('noteRow: a dropped repeating note shows no repeat; a note that does not repeat is not repeating', () => {
  const dropped = { ...noteIn(sample, 'Dentist checkup'), status: 'dropped' };
  assert.deepEqual(meta(noteRow(dropped, TODAY)), ['Health']);
  assert.equal(noteRow(dropped, TODAY).repeating, false);
  assert.equal(noteRow(noteIn(sample, 'Choose a contractor'), TODAY).repeating, false);
});
