import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBacklog } from './backlog.ts';
import { buildSnapshot } from './snapshot.ts';
import { loadSample } from '../../test/sample.ts';
import type { WaitingVM } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42: Mon 12 to Sun 18 October
const sample = loadSample();
const vm = buildBacklog(sample, TODAY);

// A tile without its rows, which are checked on their own.
function tile(w: WaitingVM) {
  return { person: w.person, context: w.context, chase: w.chase, calWeekday: w.calWeekday, calDay: w.calDay, late: w.late };
}

test('backlog: the inbox, newest first, with ages', () => {
  const shipped = '02 Inbox/2026-10-13 0912 Order shipped.md';
  const party = '02 Inbox/2026-10-12 2104 Idea for birthday party.md';
  assert.equal(vm.toSort, 2);
  assert.deepEqual(vm.inbox, [
    { key: shipped, path: shipped, title: 'Order shipped', age: 'Today' },
    { key: party, path: party, title: 'Idea for birthday party', age: 'Yesterday' },
  ]);
});

test('backlog: undated to-dos of active projects in board order, then of areas', () => {
  // Left out: Learn Spanish (paused), the twelve someday projects, every story line (a story is one row, its lines
  // are on its card), the pointer lines, and every line with a date or another state. Order cabinets is an open story
  // with no date, so it is a row under its project.
  assert.deepEqual(
    vm.noDate.map((g) => [g.name, g.path, g.rows.map((r) => [r.title, r.state, r.meta, r.draggable])]),
    [
      ['Website for Sam', '03 Projects/Website for Sam/Website for Sam.md', [['Write the About page text', 'todo', [], false]]],
      ['Renovate the kitchen', '03 Projects/Renovate the kitchen/Renovate the kitchen.md', [
        ['Order cabinets', 'todo', [{ text: 'No date' }], false],   // a story comes before the project's own to-dos
        ['Measure the kitchen walls', 'todo', [], false],
      ]],
      ['Health', '04 Areas/Health/Health.md', [['Order new running shoes', 'todo', [], false]]],
      // Home's four undated to-dos (lines 10 to 13 of Home.md): Fix the hallway light switch and Clean the gutters
      // have a date, and Fix the bike light is done.
      ['Home', '04 Areas/Home/Home.md', [
        ['Replace the bathroom tap washer', 'todo', [], false],
        ['Sort the winter clothes', 'todo', [], false],
        ['Fix the squeaky door', 'todo', [], false],
        ['Oil the garden bench', 'todo', [], false],
      ]],
    ],
  );
});

test('backlog: someday projects are the Projects board cards, newest first, with a limit of 5', () => {
  // The Projects Someday column's order, by created, newest first. Backlog never arranges it.
  assert.deepEqual(vm.someday.map((c) => [c.title, c.status, c.done, c.total]), [
    ['Organise a reunion weekend', 'someday', 0, 2],
    ['Run a half marathon', 'someday', 0, 3],
    ['Plan summer vacation', 'someday', 0, 2],
    ['Repaint the bedroom', 'someday', 0, 2],
    ['Build a vegetable garden', 'someday', 0, 1],
    ['Digitise the family photos', 'someday', 0, 1],
    ['Open a holiday savings account', 'someday', 0, 1],
    ['Write a family recipe book', 'someday', 0, 3],
    ['Learn to sail', 'someday', 0, 2],
    ['Set up a home office', 'someday', 0, 3],
    ['Plan a trip to Japan', 'someday', 0, 2],
    ['Start a monthly dinner club', 'someday', 0, 1],
  ]);
  assert.equal(vm.somedayLimit, 5);
});

test('waiting: one tile per person, earliest chase first', () => {
  assert.equal(vm.waitingOpen, 2);
  assert.equal(vm.nextChase, 'Thu');
  // The waiting story Choose a contractor gets no tile of its own: Bram's line stands for it.
  assert.deepEqual(vm.waiting.map(tile), [
    { person: 'Bram', context: ['Choose a contractor', 'Renovate the kitchen'], chase: '2026-10-15', calWeekday: 'THU', calDay: 15, late: false },
    { person: 'Sam', context: ['Website for Sam'], chase: '2026-10-20', calWeekday: 'TUE', calDay: 20, late: false },
  ]);
  assert.deepEqual(vm.waiting.map((w) => w.rows.map((r) => [r.title, r.state, r.meta, r.draggable])), [
    [['Get the written quote from Bram', 'waiting', [], false]],
    [['Get photos from Sam', 'waiting', [], false]],
  ]);
});

test('waiting: a chase before today is late, a chase today is not', () => {
  const late = (today: string) => buildBacklog(sample, today).waiting.map((w) => [w.person, w.late]);
  assert.deepEqual(late('2026-10-15'), [['Bram', false], ['Sam', false]]);
  assert.deepEqual(late('2026-10-16'), [['Bram', true], ['Sam', false]]);
  assert.deepEqual(late('2026-10-21'), [['Bram', true], ['Sam', true]]);
  assert.equal(buildBacklog(sample, '2026-10-21').nextChase, '15 Oct');
});

test('waiting: a line without a link names its note, a line without a chase date goes last', () => {
  const s = buildSnapshot([{
    path: '04 Areas/Home/Home.md',
    frontmatter: { type: 'area' },
    lines: [
      '## Tasks',
      '- [w] Hear back from [[Mia]] about the ladder',
      '- [w] Call the plumber back [scheduled:: 2026-10-14]',
    ],
  }]);
  const b = buildBacklog(s, TODAY);
  assert.deepEqual(b.waiting.map(tile), [
    { person: 'Home', context: ['Home'], chase: '2026-10-14', calWeekday: 'WED', calDay: 14, late: false },
    { person: 'Mia', context: ['Home'], chase: '', calWeekday: '', calDay: 0, late: false },
  ]);
  assert.deepEqual(b.waiting.map((w) => w.rows.map((r) => r.title)), [['Call the plumber back'], ['Hear back from Mia about the ladder']]);
  assert.equal(b.waitingOpen, 2);
  assert.equal(b.nextChase, 'Wed');
  assert.deepEqual(b.noDate, []);
});

test('waiting: one person with several lines is one tile, with the earliest chase and each context once', () => {
  const bram = '[[Bram Ellery|Bram]]';
  const s = buildSnapshot([
    // Bram's lines in file order: the project note's 22nd, its 15th, then its story's 20th.
    // So neither the first line nor the last one holds the earliest chase.
    {
      path: '03 Projects/Kitchen/Kitchen.md',
      frontmatter: { type: 'project', status: 'active' },
      lines: [
        `- [w] Send the floor plan to ${bram} [scheduled:: 2026-10-22]`,
        `- [w] Ask ${bram} about permits [scheduled:: 2026-10-15]`,
      ],
    },
    {
      path: '03 Projects/Kitchen/Pick a contractor.md',
      frontmatter: { type: 'task', status: 'waiting' },
      lines: [`- [w] Get the quote from ${bram} [scheduled:: 2026-10-20]`],
    },
    // A paused project still counts: you can wait on someone while a project rests.
    {
      path: '03 Projects/Spanish/Spanish.md',
      frontmatter: { type: 'project', status: 'paused' },
      lines: ['- [w] Hear back from [[Carmen]] about lessons [scheduled:: 2026-10-18]'],
    },
    // Someday and done projects, and their stories, are not read. Their dates are the earliest of all.
    {
      path: '03 Projects/Trip/Trip.md',
      frontmatter: { type: 'project', status: 'someday' },
      lines: ['- [w] Wait for [[Dan]] [scheduled:: 2026-10-10]'],
    },
    {
      path: '03 Projects/Trip/Book flights.md',
      frontmatter: { type: 'task', status: 'waiting' },
      lines: ['- [w] Ask [[Dan]] about dates [scheduled:: 2026-10-10]'],
    },
    {
      path: '03 Projects/Old/Old.md',
      frontmatter: { type: 'project', status: 'done' },
      lines: ['- [w] Wait for [[Eve]] [scheduled:: 2026-10-09]'],
    },
  ]);
  const b = buildBacklog(s, TODAY);
  assert.deepEqual(b.waiting.map(tile), [
    { person: 'Bram', context: ['Kitchen', 'Pick a contractor'], chase: '2026-10-15', calWeekday: 'THU', calDay: 15, late: false },
    { person: 'Carmen', context: ['Spanish'], chase: '2026-10-18', calWeekday: 'SUN', calDay: 18, late: false },
  ]);
  assert.deepEqual(b.waiting[0]?.rows.map((r) => r.title), [
    'Send the floor plan to Bram',
    'Ask Bram about permits',
    'Get the quote from Bram',
  ]);
  // Four lines on two tiles: the count is of lines.
  assert.equal(b.waitingOpen, 4);
  assert.equal(b.nextChase, 'Thu');
});

test('waiting: tiles without any chase date leave nextChase undefined', () => {
  const s = buildSnapshot([{
    path: '04 Areas/Home/Home.md',
    frontmatter: { type: 'area' },
    lines: ['- [w] Hear back from [[Mia]] about the ladder'],
  }]);
  const b = buildBacklog(s, TODAY);
  assert.deepEqual(b.waiting.map(tile), [
    { person: 'Mia', context: ['Home'], chase: '', calWeekday: '', calDay: 0, late: false },
  ]);
  assert.equal(b.waitingOpen, 1);
  assert.equal(b.nextChase, undefined);
});

test('backlog: an empty snapshot gives an empty backlog', () => {
  assert.deepEqual(buildBacklog({ notes: [] }, TODAY), {
    toSort: 0,
    inbox: [],
    noDate: [],
    someday: [],
    somedayLimit: 5,
    waitingOpen: 0,
    nextChase: undefined,
    waiting: [],
  });
});

test('waiting: a waiting task note is a row under the person it waits on, with its chase date', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: ['- [w] Ask [[Bram]] about the quote [scheduled:: 2026-10-20]'] },
    { path: '04 Areas/Home/Fix the gate.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Bram]]', chase: '2026-10-15' }, lines: [] },
    { path: '04 Areas/Home/Call back.md', frontmatter: { type: 'task', status: 'waiting' }, lines: [] },
    { path: '04 Areas/Home/Later.md', frontmatter: { type: 'task', status: 'someday', chase: '2026-10-01' }, lines: [] },
    // A waiting story whose own waiting line says who and when: the line stands for it.
    { path: '03 Projects/Kitchen/Kitchen.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: '03 Projects/Kitchen/Get a quote.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Carmen]]', chase: '2026-10-14' }, lines: ['- [w] Hear from [[Carmen]] [scheduled:: 2026-10-14]'] },
  ]);
  const b = buildBacklog(s, TODAY);
  assert.deepEqual(b.waiting.map(tile), [
    { person: 'Carmen', context: ['Get a quote', 'Kitchen'], chase: '2026-10-14', calWeekday: 'WED', calDay: 14, late: false },
    { person: 'Bram', context: ['Home', 'Fix the gate'], chase: '2026-10-15', calWeekday: 'THU', calDay: 15, late: false },
    { person: 'Call back', context: ['Call back'], chase: '', calWeekday: '', calDay: 0, late: false },
  ]);
  assert.deepEqual(b.waiting.map((w) => w.rows.map((r) => [r.title, r.state, r.target.kind, r.meta])), [
    [['Hear from Carmen', 'waiting', 'line', []]],
    [['Ask Bram about the quote', 'waiting', 'line', []], ['Fix the gate', 'waiting', 'note', []]],
    [['Call back', 'waiting', 'note', []]],
  ]);
  assert.equal(b.waitingOpen, 4);
  assert.equal(b.nextChase, 'Wed');
});

test('backlog: a line planned for a week is not undated', () => {
  const s = buildSnapshot([{
    path: '04 Areas/Home/Home.md',
    frontmatter: { type: 'area' },
    lines: ['- [ ] Back up the photos [start:: 2026-10-12]', '- [ ] Sort the loft'],
  }]);
  assert.deepEqual(buildBacklog(s, TODAY).noDate.map((g) => g.rows.map((r) => r.title)), [['Sort the loft']]);
});

// ---------- Carried over from the v0.1.0 review (Task 9) ----------

test('waiting: a waiting task note without a chase date is chased on its planned day', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    // Only scheduled: the tile takes it, as Today and Week already do.
    { path: '04 Areas/Home/Call the landlord.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Mia]]', scheduled: '2026-10-16' }, lines: [] },
    // Both: chase wins.
    { path: '04 Areas/Home/Fix the gate.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Bram]]', chase: '2026-10-15', scheduled: '2026-10-20' }, lines: [] },
  ]);
  const b = buildBacklog(s, TODAY);
  assert.deepEqual(b.waiting.map(tile), [
    { person: 'Bram', context: ['Fix the gate'], chase: '2026-10-15', calWeekday: 'THU', calDay: 15, late: false },
    { person: 'Mia', context: ['Call the landlord'], chase: '2026-10-16', calWeekday: 'FRI', calDay: 16, late: false },
  ]);
  assert.equal(b.nextChase, 'Thu');
});

test('waiting: a dropped story waits on no one, so its waiting lines stay out of Waiting', () => {
  const s = buildSnapshot([
    {
      path: '03 Projects/Kitchen/Kitchen.md',
      frontmatter: { type: 'project', status: 'active' },
      lines: ['- [w] Ask [[Bram]] about permits [scheduled:: 2026-10-15]'],
    },
    {
      path: '03 Projects/Kitchen/Pick tiles.md',
      frontmatter: { type: 'task', status: 'dropped' },
      lines: ['- [w] Get samples from [[Carmen]] [scheduled:: 2026-10-14]'],
    },
  ]);
  const b = buildBacklog(s, TODAY);
  assert.deepEqual(b.waiting.map((w) => w.person), ['Bram']);
  assert.equal(b.waitingOpen, 1);
  assert.equal(b.nextChase, 'Thu');
});

// ---------- Round-2 whole-plugin review, batch B: undated task notes, lines of task notes, the inbox folder ----------

test('backlog: an undated open task note in an area is in that area\'s No date, as a plannable row; an undated story is under its project', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: ['- [ ] Sort the loft'] },
    { path: '04 Areas/Home/Book boiler service.md', frontmatter: { type: 'task', status: 'open' }, lines: [] },
    { path: '04 Areas/Home/Renew it.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-22' }, lines: [] },
    { path: '04 Areas/Home/Fix the gate.md', frontmatter: { type: 'task', status: 'doing' }, lines: [] },
    { path: '04 Areas/Home/Water plants.md', frontmatter: { type: 'task', status: 'open', repeat: 'every mon' }, lines: [] },
    { path: '03 Projects/Kitchen/Kitchen.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: '03 Projects/Kitchen/Order tiles.md', frontmatter: { type: 'task', status: 'open' }, lines: [] },
  ]);
  const groups = buildBacklog(s, TODAY).noDate.map((g) => [g.name, g.rows.map((r) => [
    r.title, r.target.kind, r.state, r.meta, r.draggable, r.plan !== undefined,
  ])]);
  assert.deepEqual(groups, [
    ['Kitchen', [['Order tiles', 'note', 'todo', [{ text: 'No date' }], false, true]]],
    ['Home', [
      ['Sort the loft', 'line', 'todo', [], false, true],
      ['Book boiler service', 'note', 'todo', [], false, true],
    ]],
  ]);
});

test('backlog: the undated lines of an area task note are in its area\'s No date, each with its note\'s name', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    {
      path: '04 Areas/Home/Renovate bathroom.md',
      frontmatter: { type: 'task', status: 'open', due: '2026-10-22' },
      lines: ['- [ ] Order paint', '- [ ] Call plumber [due:: 2026-10-15]'],
    },
  ]);
  assert.deepEqual(
    buildBacklog(s, TODAY).noDate.map((g) => [g.name, g.rows.map((r) => [r.title, r.meta.map((m) => m.text)])]),
    [['Home', [['Order paint', ['Renovate bathroom']]]]],
  );
});

test('backlog: a note dropped into 02 Inbox by hand is an inbox item, aged by its name, its created date or its received time', () => {
  const s = buildSnapshot([
    { path: '02 Inbox/2026-10-12 2104 Idea for birthday party.md', frontmatter: { type: 'inbox', received: '2026-10-12T21:04' }, lines: [] },
    { path: '02 Inbox/2026-10-13 0912 Order shipped.md', frontmatter: undefined, lines: [] },
    { path: '02 Inbox/Another one.md', frontmatter: { created: '2026-10-11' }, lines: [] },
    { path: '02 Inbox/Quick thought dropped in by hand.md', frontmatter: undefined, lines: ['A thought.'] },
    { path: '04 Areas/Home/Stray.md', frontmatter: undefined, lines: [] },
  ]);
  const b = buildBacklog(s, TODAY);
  assert.equal(b.toSort, 4);
  assert.deepEqual(b.inbox.map((i) => [i.title, i.age]), [
    ['Order shipped', 'Today'],
    ['Idea for birthday party', 'Yesterday'],
    ['Another one', '2 days'],
    ['Quick thought dropped in by hand', ''],
  ]);
});

// A project's No date group: its own undated line, and an undated story of the project.
const WEBSITE_AND_STORY = [
  { path: '03 Projects/Website for Sam/Website for Sam.md', frontmatter: { type: 'project', status: 'active' }, lines: ['- [ ] Project chore'] },
  { path: '03 Projects/Website for Sam/Undated story.md', frontmatter: { type: 'task', status: 'open' }, lines: [] },
];

test('backlog: a No date group lists its undated stories before its own undated lines', () => {
  const [group] = buildBacklog(buildSnapshot(WEBSITE_AND_STORY), TODAY).noDate;
  assert.deepEqual(group?.rows.map((r) => r.title), ['Undated story', 'Project chore']);
});

test('backlog: an undated story row says No date in its meta, as its card does in To plan', () => {
  const [group] = buildBacklog(buildSnapshot(WEBSITE_AND_STORY), TODAY).noDate;
  const story = group?.rows.find((r) => r.title === 'Undated story');
  assert.deepEqual(story?.meta.map((m) => m.text), ['No date']);
});
