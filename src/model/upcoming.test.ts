import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { weekCount } from './upcoming.ts';
import { buildSnapshot } from './snapshot.ts';
import { META_BREAK } from './rows.ts';
import { loadSample, readSample } from '../../test/sample.ts';
import type { MetaPart, RawNote, RowVM, UpcomingWeekVM, VaultSnapshot } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42
const sample = loadSample();

/** The week that holds `start`, which lies after this week. `today` defaults to the sample's. */
function upcoming(s: VaultSnapshot, start: string, today = TODAY): UpcomingWeekVM {
  const w = buildWeek(s, today, { start });
  assert.ok(w.kind === 'upcoming', 'expected an upcoming week');
  return w;
}

// "Waiting on Bram (strong)": the text, with the tone when there is one.
const texts = (meta: MetaPart[]) => meta.map((p) => (p.tone ? `${p.text} (${p.tone})` : p.text));
// Each day group as [label, [title, ...meta] per row].
const shown = (w: UpcomingWeekVM) => w.byDay.map((g) => [g.label, g.rows.map((r) => [r.title, ...texts(r.meta)])]);
const titles = (w: UpcomingWeekVM) => w.byDay.flatMap((g) => g.rows.map((r) => r.title));

/** An area note "Home" with these lines, plus any further notes. */
function home(lines: string[], ...more: RawNote[]): VaultSnapshot {
  return buildSnapshot([{ path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines }, ...more]);
}

function homeNote(name: string, frontmatter: Record<string, unknown>): RawNote {
  return { path: `04 Areas/Home/${name}.md`, frontmatter: { type: 'task', ...frontmatter }, lines: [] };
}

test('week 43: the head, and the five items planned or due, Any day first, then each day', () => {
  const w = upcoming(sample, '2026-10-19');
  assert.deepEqual([w.label, w.title, w.start, w.today], ['WEEK 43', '19–25 October', '2026-10-19', TODAY]);
  assert.deepEqual(w.pager, { prev: '2026-10-12', next: '2026-10-26', thisWeek: '2026-10-12' });
  assert.equal(w.planned, 5);
  assert.deepEqual(w.byDay.map((g) => g.iso), [undefined, '2026-10-20', '2026-10-22', '2026-10-24']);
  assert.deepEqual(shown(w), [
    ['Any day', [['Book the boiler service', 'Home', 'Planned']]],
    ['Tue 20', [
      ['Get photos from Sam', 'Website for Sam', 'Chase'],
      ["Choose hosting for Sam's site", 'Website for Sam', 'Due'],
    ]],
    ['Thu 22', [['Back up the laptop', 'Home', 'Due', META_BREAK, 'Every month']]],
    ['Sat 24', [['Choose a contractor', 'Waiting on Bram (strong)', 'Renovate the kitchen', 'Due']]],
  ]);
});

test('week 43 rows: a line, stories with their progress, a repeating note', () => {
  const rows = new Map<string, RowVM>(
    upcoming(sample, '2026-10-19').byDay.flatMap((g) => g.rows).map((r): [string, RowVM] => [r.title, r]),
  );
  const boiler = rows.get('Book the boiler service');
  const photos = rows.get('Get photos from Sam');
  const hosting = rows.get("Choose hosting for Sam's site");
  const laptop = rows.get('Back up the laptop');
  const contractor = rows.get('Choose a contractor');
  assert.ok(boiler && photos && hosting && laptop && contractor);
  assert.deepEqual([boiler.target.kind, boiler.state], ['line', 'todo']);
  assert.deepEqual(
    [photos.target.kind, photos.state, photos.ariaLabel, photos.progress],
    ['line', 'waiting', 'Get photos from Sam, waiting', undefined],
  );
  assert.deepEqual(hosting.target, { kind: 'note', path: "03 Projects/Website for Sam/Choose hosting for Sam's site.md", state: 'doing' });
  assert.deepEqual(
    [hosting.key, hosting.state, hosting.ariaLabel, hosting.progress],
    [hosting.target.path, 'doing', "Choose hosting for Sam's site, in progress", { done: 1, total: 3 }],
  );
  assert.deepEqual([contractor.state, contractor.progress], ['waiting', { done: 1, total: 3 }]);
  assert.deepEqual([laptop.target.kind, laptop.repeating, laptop.progress], ['note', true, undefined]);
});

test("week 43's strip: planned and due counts on their days, and the appointments", () => {
  const w = upcoming(sample, '2026-10-19');
  assert.deepEqual(w.days.map((d) => d.dayNum), [19, 20, 21, 22, 23, 24, 25]);
  assert.deepEqual(w.days.map((d) => [d.planned, d.due, d.done]), [
    [0, 0, 0], [1, 1, 0], [0, 0, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0], [0, 0, 0],
  ]);
  assert.deepEqual(w.days.map((d) => d.events.map((e) => e.title)), [[], ['Dance class'], [], [], [], [], []]);
  assert.ok(w.days.every((d) => !d.isToday && !d.isPast));
});

test('each item once, on its earliest date in the week; due wins a tie; a day heading shrinks the words', () => {
  const w = upcoming(home([
    '- [ ] Clean the gutters [scheduled:: 2026-10-21]',
    '- [ ] Paint the shed [due:: 2026-10-24] [scheduled:: 2026-10-22]',
    '- [ ] Fix the gate [due:: 2026-10-20] [scheduled:: 2026-10-23]',
    '- [ ] Oil the hinges [due:: 2026-10-21] [scheduled:: 2026-10-21]',
    '- [ ] Sweep the porch [due:: 2026-10-25] [scheduled:: 2026-10-14]',
    '- [x] Fix the doorbell [due:: 2026-10-20] [completion:: 2026-10-12]',
    '- [-] Tile the patio [due:: 2026-10-20]',
  ],
  homeNote('Renew passport', { status: 'open', scheduled: '2026-10-23' }),
  homeNote('Ring the council', { status: 'waiting', chase: '2026-10-22' }),
  homeNote('Paint the fence', { status: 'someday', due: '2026-10-20' }),
  ), '2026-10-19');
  assert.deepEqual(shown(w), [
    ['Tue 20', [['Fix the gate', 'Home', 'Planned 23 Oct', 'Due']]],
    ['Wed 21', [['Clean the gutters', 'Home', 'Planned'], ['Oil the hinges', 'Home', 'Planned', 'Due']]],
    ['Thu 22', [['Paint the shed', 'Home', 'Planned', 'Due 24 Oct'], ['Ring the council', 'Home', 'Chase']]],
    ['Fri 23', [['Renew passport', 'Home', 'Planned']]],
    ['Sun 25', [['Sweep the porch', 'Home', 'Planned Wed', 'Due']]],
  ]);
  assert.equal(w.planned, 7);
});

test('a part off its day keeps its own words: Planned · Due Fri, and a week plan with a due date sits in Any day', () => {
  const w = upcoming(home([
    '- [ ] Paint the shed [scheduled:: 2026-10-20] [due:: 2026-10-23]',
    '- [ ] Book the boiler service [start:: 2026-10-19] [due:: 2026-10-22]',
  ]), '2026-10-19', '2026-10-17');
  assert.equal(w.today, '2026-10-17');
  assert.deepEqual(shown(w), [
    ['Any day', [['Book the boiler service', 'Home', 'Planned', 'Due Thu']]],
    ['Tue 20', [['Paint the shed', 'Home', 'Planned', 'Due Fri']]],
  ]);
  assert.deepEqual(w.days.map((d) => [d.planned, d.due]), [[0, 0], [1, 0], [0, 0], [0, 1], [0, 1], [0, 0], [0, 0]]);
  assert.equal(w.planned, 2);
});

test('a repeating note shows only on the date it holds: Brain does no repeat math', () => {
  assert.deepEqual(shown(upcoming(sample, '2026-10-26')), [
    ['Sun 1', [['Pay rent', 'Money', 'Due', META_BREAK, 'Every month']]],
  ]);
  // A month later the monthly notes don't show again: the agent moves their dates.
  assert.deepEqual(titles(upcoming(sample, '2026-11-16')), ['Pay the car insurance']);   // Back up the laptop would be due Sun 22 Nov
  assert.equal(upcoming(sample, '2026-11-30').planned, 0);   // Pay rent would be due Tue 1 Dec
});

test('an empty vault: nothing planned or due, seven quiet days', () => {
  const w = upcoming({ notes: [] }, '2026-10-19');
  assert.deepEqual([w.planned, w.byDay], [0, []]);
  assert.equal(w.days.length, 7);
  assert.ok(w.days.every((d) => d.planned === 0 && d.due === 0 && d.events.length === 0));
});

test('weekCount: the placements of Planned or due plus the one-off appointments', () => {
  const s = home(['- [ ] Fix the gate [due:: 2026-10-20]'], {
    path: '04 Areas/Home/2026-10-21 Plumber.md',
    frontmatter: { type: 'appointment', date: '2026-10-21', time: '09:00' },
    lines: [],
  });
  assert.equal(weekCount(s, TODAY, '2026-10-19'), 2);
  assert.equal(weekCount(s, TODAY, '2026-10-26'), 0);
});

test('weekCount for the sample: week 43 has five, week 44 one (Pay rent), week 45 none', () => {
  assert.deepEqual(['2026-10-19', '2026-10-26', '2026-11-02'].map((start) => weekCount(sample, TODAY, start)), [5, 1, 0]);
});

test('a story line counts in an upcoming week: its row on its day, the strip, and Coming up', () => {
  const s = buildSnapshot([
    { path: '03 Projects/Redecorate/Redecorate.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    {
      path: '03 Projects/Redecorate/Choose paint.md',
      frontmatter: { type: 'task', status: 'open' },
      lines: ['- [ ] Measure the room [scheduled:: 2026-10-20] [due:: 2026-10-21]'],
    },
  ]);
  const w = upcoming(s, '2026-10-19');
  assert.deepEqual(shown(w), [['Tue 20', [['Measure the room', 'Choose paint', 'Planned', 'Due 21 Oct']]]]);
  assert.deepEqual(w.days.map((d) => [d.planned, d.due]), [[0, 0], [1, 0], [0, 1], [0, 0], [0, 0], [0, 0], [0, 0]]);
  assert.equal(w.planned, 1);
  assert.equal(weekCount(s, TODAY, '2026-10-19'), 1);
});

test("the same story line on this week's board, once its day is this week", () => {
  const s = buildSnapshot([
    { path: '03 Projects/Redecorate/Redecorate.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    {
      path: '03 Projects/Redecorate/Choose paint.md',
      frontmatter: { type: 'task', status: 'open' },
      lines: ['- [ ] Measure the room [scheduled:: 2026-10-20] [due:: 2026-10-21]'],
    },
  ]);
  const board = buildWeek(s, '2026-10-20');
  assert.ok(board.kind === 'this', 'expected this week');
  const card = board.columns.todo.find((i) => i.kind === 'card' && i.card.title === 'Choose paint');
  assert.ok(card?.kind === 'card');
  assert.deepEqual(card.card.rows.map((r) => r.title), ['Measure the room']);
  assert.deepEqual([board.days[1].planned, board.days[2].due], [1, 1]);
});

describe('planning an upcoming week', () => {
  const TODAY = '2026-10-13';   // Tuesday, week 42
  const sample = loadSample();
  const STILL_OPEN = [
    'Book a physio session',
    'Fix the hallway light switch',
    'Clean the gutters',
    'Send Sam the hosting options',
    'Compare energy contracts',
    'Back up the photos',
    "Choose hosting for Sam's site",   // a doing story, carried by its open line
    'Build the homepage header',       // a doing line of Website for Sam, carried
  ];

  /** The upcoming week that holds `start`. */
  function upcoming(s: VaultSnapshot, start: string): UpcomingWeekVM {
    const vm = buildWeek(s, TODAY, { start });
    assert.ok(vm.kind === 'upcoming', 'not an upcoming week: ' + start);
    return vm;
  }

  /** The sample with Clean the gutters (Home.md, line 7) planned on `date` instead of Thu 15. */
  function guttersOn(date: string): VaultSnapshot {
    return buildSnapshot(readSample().map((n) => (n.path === '04 Areas/Home/Home.md'
      ? { ...n, lines: n.lines.map((l) => l.replace('[scheduled:: 2026-10-15]', `[scheduled:: ${date}]`)) }
      : n)));
  }

  const texts = (r: RowVM): string[] => r.meta.map((m) => m.text);
  const rowsOf = (vm: UpcomingWeekVM): RowVM[] => vm.byDay.flatMap((g) => g.rows);

  test('Planned or due: a planned line, a story and a repeating note drag with their dates; a waiting line does not', () => {
    assert.deepEqual(rowsOf(upcoming(sample, '2026-10-19')).map((r) => [r.title, r.draggable, r.plan]), [
      ['Book the boiler service', true, { start: '2026-10-19' }],
      ['Get photos from Sam', false, undefined],   // waiting: its scheduled date is the chase date, not a plan
      ["Choose hosting for Sam's site", true, { due: '2026-10-20' }],
      ['Back up the laptop', true, { due: '2026-10-22' }],
      ['Choose a contractor', false, undefined],
    ]);
  });

  test("W43: To plan's Still open this week, Due soon and No date, with the count", () => {
    const vm = upcoming(sample, '2026-10-19');
    assert.deepEqual(vm.toPlan.open.map((r) => [r.title, texts(r)]), [
      ['Book a physio session', ['Health', '3 days overdue']],
      ['Fix the hallway light switch', ['Home', 'Due today']],
      ['Clean the gutters', ['Home', 'Planned Thu']],
      ['Send Sam the hosting options', ['Website for Sam', 'Due Sat']],
      ['Compare energy contracts', ['Money', 'Planned Sun']],
      ['Back up the photos', ['Home', 'This week']],
      ["Choose hosting for Sam's site", ['Website for Sam', 'Due 20 Oct']],
      ['Build the homepage header', ['Website for Sam', 'Planned today']],
    ]);
    assert.deepEqual(vm.toPlan.dueSoon.map((r) => [r.title, texts(r)]), [
      ['Renew passport', ['Home', 'Due 9 Nov']],
      ['Pay the car insurance', ['Money', 'Due 16 Nov']],
    ]);
    assert.deepEqual(vm.toPlan.noDate.map((g) => [g.name, g.rows.map((r) => r.title)]), [
      ['Website for Sam', ['Write the About page text']],
      ['Renovate the kitchen', ['Order cabinets', 'Measure the kitchen walls']],   // a story comes before the project's own to-dos
      ['Health', ['Order new running shoes']],
      ['Home', ['Replace the bathroom tap washer', 'Sort the winter clothes', 'Fix the squeaky door', 'Oil the garden bench']],
    ]);
    assert.equal(vm.toPlan.count, 18);
    const rows = [...vm.toPlan.open, ...vm.toPlan.dueSoon, ...vm.toPlan.noDate.flatMap((g) => g.rows)];
    assert.deepEqual(rows.map((r) => [r.draggable, r.plan !== undefined]), rows.map(() => [true, true]));
  });

  test('W43 with Clean the gutters planned on Wed 21: it joins Planned or due and leaves To plan', () => {
    const vm = upcoming(guttersOn('2026-10-21'), '2026-10-19');
    const wed = vm.byDay.find((g) => g.iso === '2026-10-21');
    assert.deepEqual(wed?.rows.map((r) => [r.title, texts(r), r.draggable, r.plan]), [
      ['Clean the gutters', ['Home', 'Planned'], true, { scheduled: '2026-10-21' }],
    ]);
    assert.equal(vm.planned, 6);
    assert.deepEqual(vm.toPlan.open.map((r) => r.title), STILL_OPEN.filter((t) => t !== 'Clean the gutters'));
    assert.equal(vm.toPlan.count, 17);
  });

  test('To plan leaves out waiting lines, repeating notes, someday and paused projects, tasks planned later, and story lines', () => {
    const vm = upcoming(buildSnapshot([
      { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [
        '- [ ] Paint the door [due:: 2026-10-15]',
        '- [w] Ring the council [scheduled:: 2026-10-14]',
        '- [ ] Plan the trip [start:: 2026-10-26]',
      ] },
      { path: '04 Areas/Home/Back up the laptop.md', frontmatter: { type: 'task', status: 'open', due: '2026-11-03', repeat: 'every month' }, lines: [] },
      { path: '03 Projects/Someday one/Someday one.md', frontmatter: { type: 'project', status: 'someday' }, lines: ['- [ ] Draft the plan [due:: 2026-10-15]'] },
      { path: '03 Projects/Paused one/Paused one.md', frontmatter: { type: 'project', status: 'paused' }, lines: ['- [ ] Sketch the idea [due:: 2026-10-15]'] },
      { path: '03 Projects/Kept one/Kept one.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
      { path: '03 Projects/Kept one/Story.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-15' }, lines: ['- [ ] Story line [due:: 2026-10-15]'] },
    ]), '2026-10-19');
    assert.deepEqual(vm.toPlan.open.map((r) => r.title), ['Paint the door', 'Story']);   // a story due this week, carried over
    assert.deepEqual([vm.toPlan.dueSoon, vm.toPlan.noDate, vm.toPlan.count], [[], [], 2]);
  });

  test('task notes: an open one plans on its day; a waiting one never does', () => {
    const home = '04 Areas/Home/';
    const vm = upcoming(buildSnapshot([
      { path: home + 'Home.md', frontmatter: { type: 'area' }, lines: [] },
      { path: home + 'Call the plumber.md', frontmatter: { type: 'task', status: 'open', scheduled: '2026-10-23' }, lines: [] },
      { path: home + 'Ring the council.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Mia]]', chase: '2026-10-21' }, lines: [] },
      {
        path: home + 'Get a quote.md',
        frontmatter: { type: 'task', status: 'waiting', due: '2026-10-24' },
        lines: ['- [w] Hear back from [[Bram]] [scheduled:: 2026-10-22]'],
      },
    ]), '2026-10-19');
    assert.deepEqual(rowsOf(vm).map((r) => [r.title, r.draggable, r.plan]), [
      ['Ring the council', false, undefined],              // Wed 21: its chase
      ['Hear back from Bram', false, undefined],           // Thu 22: the waiting line of Get a quote, its chase
      ['Call the plumber', true, { scheduled: '2026-10-23' }],
      ['Get a quote', false, undefined],                   // Sat 24: its deadline
    ]);
  });

  test("W44, two weeks out: Pay rent, a repeating note on its deadline, drags; To plan keeps its groups, with Due soon's window moved", () => {
    const vm = upcoming(sample, '2026-10-26');
    assert.deepEqual(rowsOf(vm).map((r) => [r.title, r.draggable]), [['Pay rent', true]]);
    assert.deepEqual(vm.toPlan.open.map((r) => r.title), STILL_OPEN);
    assert.deepEqual(vm.toPlan.dueSoon.map((r) => r.title), ['Renew passport', 'Pay the car insurance']);
    assert.equal(vm.toPlan.noDate.reduce((sum, g) => sum + g.rows.length, 0), 8);
    assert.equal(vm.toPlan.count, 18);
  });

  test('an empty vault has nothing to plan', () => {
    assert.deepEqual(upcoming({ notes: [] }, '2026-10-19').toPlan, { open: [], dueSoon: [], noDate: [], count: 0 });
  });
});

test('To plan: an undated open task note in an area is in No date, draggable and plannable', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    { path: '04 Areas/Home/Book boiler service.md', frontmatter: { type: 'task', status: 'open' }, lines: [] },
  ]);
  const vm = upcoming(s, '2026-10-19');
  assert.deepEqual(
    vm.toPlan.noDate.map((g) => [g.name, g.rows.map((r) => [r.title, r.draggable, r.plan !== undefined])]),
    [['Home', [['Book boiler service', true, true]]]],
  );
  assert.equal(vm.toPlan.count, 1);
});

test('an area task note\'s open lines count and show in an upcoming week, and To plan lists them', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    {
      path: '04 Areas/Home/Renovate bathroom.md',
      frontmatter: { type: 'task', status: 'open', due: '2026-10-22' },
      lines: ['- [ ] Call plumber [due:: 2026-10-15]', '- [ ] Pick tiles [due:: 2026-10-22]', '- [ ] Order paint'],
    },
  ]);
  const vm = upcoming(s, '2026-10-19');
  // Week 43: Pick tiles on Thursday 22 October, with its note; Call plumber is due in week 42.
  assert.deepEqual(titles(vm), ['Pick tiles', 'Renovate bathroom']);
  assert.equal(vm.planned, 2);
  assert.deepEqual(vm.toPlan.open.map((r) => r.title), ['Call plumber']);
  assert.deepEqual(vm.toPlan.noDate.map((g) => [g.name, g.rows.map((r) => r.title)]), [['Home', ['Order paint']]]);
  assert.equal(weekCount(s, TODAY, '2026-10-19'), 2);
});
