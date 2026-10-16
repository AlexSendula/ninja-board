import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek, waitingOn } from './week.ts';
import type { WeekInput } from './week.ts';
import type { PastWeekVM, ThisWeekVM } from './types.ts';
import { readArrangement } from './arrange.ts';
import { buildSnapshot } from './snapshot.ts';
import { loadSample, readSample } from '../../test/sample.ts';
import { weekPlanPath } from './record.ts';
import type { Arrangement, BoardItem, MetaPart, NoteInfo, RawNote, RowVM, StoryCardVM, VaultSnapshot } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42: Mon 12 to Sun 18 October
const vm = thisWeek(loadSample(), TODAY);

const label = (i: BoardItem): string => (i.kind === 'row' ? i.row.title : 'card ' + i.card.title);
const texts = (meta: MetaPart[]): string[] => meta.map((m) => m.text);
const items = (): BoardItem[] => [...vm.columns.todo, ...vm.columns.doing, ...vm.columns.waiting, ...vm.columns.done];

function row(title: string): RowVM {
  const found = items().find((i) => i.kind === 'row' && i.row.title === title);
  assert.ok(found?.kind === 'row', 'no row ' + title);
  return found.row;
}

function card(title: string): StoryCardVM {
  const found = items().find((i) => i.kind === 'card' && i.card.title === title);
  assert.ok(found?.kind === 'card', 'no card ' + title);
  return found.card;
}

test('header: week number, dates, left and done', () => {
  assert.equal(vm.label, 'WEEK 42');
  assert.equal(vm.title, '12–18 October');
  assert.equal(vm.left, 12);   // Order cabinets is undated: it is in no week, so its two lines are not counted
  assert.equal(vm.done, 2);
});

test('a week across two months spaces the dash', () => {
  const w = thisWeek({ notes: [] }, '2026-10-01');
  assert.equal(w.label, 'WEEK 40');
  assert.equal(w.title, '28 Sep – 4 Oct');   // short month names, as the mockup's Week 40
});

test('days run Monday to Sunday, with today and the past marked', () => {
  assert.deepEqual(vm.days.map((d) => d.iso), [
    '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
  ]);
  assert.deepEqual(vm.days.map((d) => d.weekdayShort), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual(vm.days.map((d) => d.initial), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.deepEqual(vm.days.map((d) => d.dayNum), [12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(vm.days.map((d) => d.isToday), [false, true, false, false, false, false, false]);
  assert.deepEqual(vm.days.map((d) => d.isPast), [true, false, false, false, false, false, false]);
});

test('day counts: planned (a line by its scheduled day, a note by its plan) and due (by its deadline)', () => {
  // Tue: header (planned), hallway (due). Wed: compare prices (planned). Thu: gutters and Bram's chase (planned).
  // Fri: Dentist checkup (due). Sat: send Sam the options (due). Sun: energy contracts (planned).
  // Back up the photos has a week plan, which counts on no day.
  assert.deepEqual(vm.days.map((d) => d.planned), [0, 1, 1, 2, 0, 0, 1]);
  assert.deepEqual(vm.days.map((d) => d.due), [0, 1, 0, 0, 1, 1, 0]);
});

test('day events come from the appointments', () => {
  assert.deepEqual(vm.days.map((d) => d.events.map((e) => e.title)), [
    [], ['Dance class'], [], ['Contractor visit'], ['Dentist'], [], [],
  ]);
});

test('board columns hold rows first, by overdue then date, then cards, as in the mockup', () => {
  assert.deepEqual(
    [vm.columns.todo.length, vm.columns.doing.length, vm.columns.waiting.length, vm.columns.done.length],
    [7, 2, 1, 2],
  );
  assert.deepEqual(vm.columns.todo.map(label), [
    'Book a physio session',
    'Fix the hallway light switch',
    'Clean the gutters',
    'Dentist checkup',
    'Send Sam the hosting options',
    'Compare energy contracts',
    'Back up the photos',
  ]);
  assert.deepEqual(vm.columns.doing.map(label), [
    'Build the homepage header',
    "card Choose hosting for Sam's site",
  ]);
  assert.deepEqual(vm.columns.waiting.map(label), ['card Choose a contractor']);
  assert.deepEqual(vm.columns.done.map(label), ['Pick design B with Sam', 'Replace the smoke alarm battery']);
});

test('loose rows show their parent and date part, and can be dragged', () => {
  const expected: [string, string[]][] = [
    ['Book a physio session', ['Health', '3 days overdue']],
    ['Fix the hallway light switch', ['Home', 'Due today']],
    ['Clean the gutters', ['Home', 'Planned Thu']],
    ['Send Sam the hosting options', ['Website for Sam', 'Due Sat']],
    ['Compare energy contracts', ['Money', 'Planned Sun']],
    ['Back up the photos', ['Home', 'This week']],
    ['Build the homepage header', ['Website for Sam', 'Planned today']],
    ['Pick design B with Sam', ['Website for Sam', 'Done yesterday']],
    ['Replace the smoke alarm battery', ['Home', 'Done yesterday']],
  ];
  for (const [title, meta] of expected) {
    const r = row(title);
    assert.deepEqual(texts(r.meta), meta, title);
    assert.equal(r.draggable, true, title);
  }
  const dentist = row('Dentist checkup');
  assert.deepEqual([dentist.repeating, dentist.draggable], [true, true]);
});

test('story cards: waiting person, project, due, progress and their lines', () => {
  const contractor = card('Choose a contractor');
  assert.equal(contractor.column, 'waiting');
  assert.deepEqual(texts(contractor.meta), ['Waiting on Bram', 'Renovate the kitchen', 'Due 24 Oct']);
  assert.equal(contractor.meta[0]?.tone, 'strong');
  assert.deepEqual([contractor.done, contractor.total], [1, 3]);
  assert.deepEqual(contractor.rows.map((r) => r.title), [
    'Get three quotes', 'Get the written quote from Bram', 'Check references for the shortlisted contractor',
  ]);
  assert.deepEqual(contractor.rows.map((r) => texts(r.meta)), [[], ['Chase Thu'], []]);
  assert.ok(contractor.rows.every((r) => !r.draggable));

  const hosting = card("Choose hosting for Sam's site");
  assert.equal(hosting.column, 'doing');
  assert.deepEqual(texts(hosting.meta), ['Website for Sam', 'Due 20 Oct']);
  assert.deepEqual([hosting.done, hosting.total], [1, 3]);
  assert.deepEqual(hosting.rows.map((r) => texts(r.meta)), [[], ['Planned Wed'], []]);

  // Order cabinets is open with no date: it is in no week, so it is not on the board at all (Backlog lists it).
  assert.equal(items().some((i) => i.kind === 'card' && i.card.title === 'Order cabinets'), false);
});

function learnSpanish(status: string): VaultSnapshot {
  const dir = '03 Projects/Learn Spanish/';
  return buildSnapshot([
    { path: dir + 'Learn Spanish.md', frontmatter: { type: 'project', status }, lines: ['- [ ] Finish unit 4 [due:: 2026-10-13]'] },
    { path: dir + 'Book a tutor.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-14' }, lines: ['- [ ] Email the school [scheduled:: 2026-10-15]'] },
    { path: dir + 'Buy the book.md', frontmatter: { type: 'task', status: 'done', done: '2026-10-12' }, lines: [] },
    { path: dir + 'Find a course.md', frontmatter: { type: 'task', status: 'done', done: '2026-10-09' }, lines: [] },
  ]);
}

test('an active project: its lines and stories are on the board; stories done before the week are not', () => {
  const w = thisWeek(learnSpanish('active'), TODAY);
  assert.deepEqual(w.columns.todo.map(label), ['Finish unit 4', 'card Book a tutor']);
  assert.deepEqual(w.columns.doing, []);
  assert.deepEqual(w.columns.done.map(label), ['card Buy the book']);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 1, 1, 0, 0, 0, 0]);
  assert.deepEqual([w.left, w.done], [2, 0]);
});

test('a paused project and its stories stay off the board and out of every count', () => {
  const w = thisWeek(learnSpanish('paused'), TODAY);
  assert.deepEqual(w.columns, { todo: [], doing: [], waiting: [], done: [] });
  assert.ok(w.days.every((d) => d.planned === 0 && d.due === 0));
  assert.deepEqual([w.left, w.done], [0, 0]);
});

test('an empty vault gives the header, seven empty days and empty columns', () => {
  const w = thisWeek({ notes: [] }, TODAY);
  assert.equal(w.label, 'WEEK 42');
  assert.equal(w.title, '12–18 October');
  assert.deepEqual([w.left, w.done], [0, 0]);
  assert.equal(w.days.length, 7);
  assert.ok(w.days.every((d) => d.planned === 0 && d.due === 0 && d.events.length === 0));
  assert.deepEqual(w.columns, { todo: [], doing: [], waiting: [], done: [] });
});

/** An area note "Home" with the given lines, plus any further notes. */
function homeArea(lines: string[], ...more: RawNote[]): VaultSnapshot {
  return buildSnapshot([{ path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines }, ...more]);
}

function homeNote(name: string, frontmatter: Record<string, unknown>): RawNote {
  return { path: `04 Areas/Home/${name}.md`, frontmatter: { type: 'task', ...frontmatter }, lines: [] };
}

test('a waiting line sits in Waiting, like a waiting story, and counts as left', () => {
  const w = thisWeek(homeArea(['- [w] Hear back from the plumber [scheduled:: 2026-10-15]']), TODAY);
  assert.deepEqual(w.columns.todo, []);
  assert.deepEqual(w.columns.doing, []);
  assert.deepEqual(w.columns.waiting.map(label), ['Hear back from the plumber']);
  assert.deepEqual(w.columns.done, []);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([w.left, w.done], [1, 0]);
});

test('stories off the board (dropped, someday, done before the week) keep their lines out of the counts', () => {
  const dir = '03 Projects/Learn Spanish/';
  const lines = ['- [ ] Email the school [due:: 2026-10-14]'];
  const w = thisWeek(buildSnapshot([
    { path: dir + 'Learn Spanish.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: dir + 'Dropped.md', frontmatter: { type: 'task', status: 'dropped' }, lines },
    { path: dir + 'Maybe.md', frontmatter: { type: 'task', status: 'someday' }, lines },
    { path: dir + 'Old.md', frontmatter: { type: 'task', status: 'done', done: '2026-10-09' }, lines },
  ]), TODAY);
  assert.deepEqual(w.columns, { todo: [], doing: [], waiting: [], done: [] });
  assert.ok(w.days.every((d) => d.planned === 0 && d.due === 0));
  assert.deepEqual([w.left, w.done], [0, 0]);
});

test('an area task note is a row: counted on its day and in left, and draggable', () => {
  const w = thisWeek(homeArea([],
    homeNote('Call plumber', { status: 'open', due: '2026-10-15' }),
    homeNote('Renew passport', { status: 'open', due: '2026-10-20' }),
    homeNote('Fix the fence', { status: 'someday', due: '2026-10-15' }),
  ), TODAY);
  assert.deepEqual(w.columns.todo.map(label), ['Call plumber']);
  assert.deepEqual([w.columns.doing, w.columns.done], [[], []]);
  const r = w.columns.todo[0];
  assert.ok(r?.kind === 'row');
  assert.deepEqual(texts(r.row.meta), ['Home', 'Due Thu']);
  assert.deepEqual([r.row.draggable, r.row.repeating], [true, false]);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual([w.left, w.done], [1, 0]);
});

test('an area task note goes to Doing when doing, to Waiting when waiting, and to Done when done this week', () => {
  const w = thisWeek(homeArea([],
    homeNote('Ring the council', { status: 'waiting', scheduled: '2026-10-16' }),
    homeNote('Water the plants', { status: 'done', done: '2026-10-12' }),
    homeNote('Paint the shed', { status: 'done', done: '2026-10-09' }),
  ), TODAY);
  assert.deepEqual(w.columns.todo, []);
  assert.deepEqual(w.columns.doing, []);
  assert.deepEqual(w.columns.waiting.map(label), ['Ring the council']);
  assert.deepEqual(w.columns.done.map(label), ['Water the plants']);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 0, 0, 1, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([w.left, w.done], [1, 1]);
});

test('a repeating task note inside a project is a row, not a card: draggable, and it says what it repeats', () => {
  const dir = '03 Projects/Website for Sam/';
  const w = thisWeek(buildSnapshot([
    { path: dir + 'Website for Sam.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: dir + 'Weekly sync.md', frontmatter: { type: 'task', status: 'open', due: '2026-10-14', repeat: 'every mon' }, lines: [] },
    { path: dir + 'Pick a theme.md', frontmatter: { type: 'task', status: 'open' }, lines: [] },
  ]), TODAY);
  // Pick a theme is open with no date, so it is in no week.
  assert.deepEqual(w.columns.todo.map(label), ['Weekly sync']);
  const sync = w.columns.todo[0];
  assert.ok(sync?.kind === 'row');
  assert.deepEqual([sync.row.repeating, sync.row.draggable, sync.row.target.kind], [true, true, 'note']);
  assert.deepEqual(texts(sync.row.meta), ['Website for Sam', 'Due Wed', '\n', 'Every mon']);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual([w.left, w.done], [1, 0]);
});

test('a waiting task note counts and sorts by its chase date', () => {
  const w = thisWeek(homeArea([],
    homeNote('Ring the council', { status: 'waiting', waiting_on: '[[Mia]]', chase: '2026-10-16' }),
  ), TODAY);
  assert.deepEqual(w.columns.doing, []);
  assert.deepEqual(w.columns.waiting.map(label), ['Ring the council']);
  const r = w.columns.waiting[0];
  assert.ok(r?.kind === 'row');
  assert.deepEqual(texts(r.row.meta), ['Home', 'Chase Fri']);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 0, 0, 1, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([w.left, w.done], [1, 0]);
});

test('a waiting story names who it waits on from its frontmatter', () => {
  const dir = '03 Projects/Kitchen/';
  const w = thisWeek(buildSnapshot([
    { path: dir + 'Kitchen.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: dir + 'Get a quote.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Bram Ellery|Bram]]', chase: '2026-10-15' }, lines: ['- [ ] Send the plan to [[Mia]]'] },
  ]), TODAY);
  const story = w.columns.waiting[0];
  assert.ok(story?.kind === 'card');
  assert.deepEqual(texts(story.card.meta), ['Waiting on Bram', 'Kitchen']);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 0, 0, 0, 0, 0, 0]);
});

// ---------- Arranging (Task 4) ----------

const keyOf = (i: BoardItem): string => i.arrangeKey;

test('every board item has its arrangement key: a card or a note row its note name, a line row "<note> › <text>"', () => {
  assert.deepEqual(vm.columns.todo.map(keyOf), [
    'Health › Book a physio session',
    'Home › Fix the hallway light switch',
    'Home › Clean the gutters',
    'Dentist checkup',
    'Website for Sam › Send Sam the hosting options',
    'Money › Compare energy contracts',
    'Home › Back up the photos',
  ]);
  assert.deepEqual(vm.columns.doing.map(keyOf), [
    'Website for Sam › Build the homepage header',
    "Choose hosting for Sam's site",
  ]);
  assert.deepEqual(vm.columns.waiting.map(keyOf), ['Choose a contractor']);
  assert.deepEqual(vm.columns.done.map(keyOf), [
    'Website for Sam › Pick design B with Sam',
    'Home › Replace the smoke alarm battery',
  ]);
});

test('a To do list puts its items first, in order; the rest follow in the normal order; a stale key is ignored', () => {
  const w = thisWeek(loadSample(), TODAY, { arrange: { todo: ['Home › Back up the photos', 'Home › Clean the gutters', 'Nope'] } });
  assert.deepEqual(w.columns.todo.map(label), [
    'Back up the photos',
    'Clean the gutters',
    'Book a physio session',
    'Fix the hallway light switch',
    'Dentist checkup',
    'Send Sam the hosting options',
    'Compare energy contracts',
  ]);
});

test('a Doing list puts Choose hosting first; a name of a waiting item in it is ignored', () => {
  const w = thisWeek(loadSample(), TODAY, { arrange: { doing: ['Choose a contractor', "Choose hosting for Sam's site"] } });
  assert.deepEqual(w.columns.doing.map(label), [
    "card Choose hosting for Sam's site",
    'Build the homepage header',
  ]);
  assert.deepEqual(w.columns.waiting.map(label), ['card Choose a contractor']);
});

test('saved holds the lists of To do and Doing that the view has, and no other', () => {
  assert.deepEqual(vm.saved, {});
  const w = thisWeek(loadSample(), TODAY, { arrange: { doing: ['Choose a contractor'], active: ['Website for Sam'] } });
  assert.deepEqual(w.saved, { doing: ['Choose a contractor'] });
});

test('an arrangement never changes Done, the counts or the days', () => {
  const w = thisWeek(loadSample(), TODAY, {
    arrange: { todo: vm.columns.todo.map(keyOf).reverse(), doing: vm.columns.doing.map(keyOf).reverse() },
  });
  assert.deepEqual(w.columns.todo.map(label), vm.columns.todo.map(label).reverse());
  assert.deepEqual(w.columns.doing.map(label), vm.columns.doing.map(label).reverse());
  assert.deepEqual(w.columns.done, vm.columns.done);
  assert.deepEqual([w.label, w.title, w.left, w.done, w.days], [vm.label, vm.title, vm.left, vm.done, vm.days]);
});

test('a Done list, or a broken value, from the view config has no effect', () => {
  const read = readArrangement({ done: ['Home › Replace the smoke alarm battery', 'Website for Sam › Pick design B with Sam'], todo: 'x', doing: 5 });
  assert.deepEqual(thisWeek(loadSample(), TODAY, { arrange: read }).columns, vm.columns);
  // Raw, so the done list reaches buildWeek: its own guard must keep Done in time order (the reverse of it here).
  const raw = { done: ['Home › Replace the smoke alarm battery', 'Website for Sam › Pick design B with Sam'] } as Arrangement;
  assert.deepEqual(thisWeek(loadSample(), TODAY, { arrange: raw }).columns, vm.columns);
});

test('this week: its kind, Monday and today, the pager without This week, and no done counts on the days', () => {
  assert.deepEqual([vm.kind, vm.start, vm.today], ['this', '2026-10-12', TODAY]);
  assert.deepEqual(vm.pager, { prev: '2026-10-05', next: '2026-10-19' });
  assert.ok(vm.days.every((d) => d.done === 0));
});

test('Coming up: the next three weeks, each with what is planned or due in it', () => {
  // Week 43: Book the boiler service (Any day), Get photos (chase), Choose hosting, Back up the laptop, Choose a contractor. Week 44: Pay rent.
  assert.deepEqual(vm.comingUp, [
    { start: '2026-10-19', week: 43, count: 5 },
    { start: '2026-10-26', week: 44, count: 1 },
    { start: '2026-11-02', week: 45, count: 0 },
  ]);
});

test('Coming up counts a one-off appointment in its week, and a weekly repeating one nowhere', () => {
  const w = thisWeek(buildSnapshot([
    { path: 'Plumber.md', frontmatter: { type: 'appointment', date: '2026-10-21', time: '09:00' }, lines: [] },
    { path: 'Yoga.md', frontmatter: { type: 'appointment', date: '2026-10-28', time: '07:00', repeat: 'every wed' }, lines: [] },
  ]), TODAY);
  assert.deepEqual(w.comingUp.map((c) => c.count), [1, 0, 0]);
});

test('any day of another week shows that week: a later one is upcoming, an earlier one past', () => {
  const later = buildWeek(loadSample(), TODAY, { start: '2026-10-21' });
  assert.deepEqual([later.kind, later.start, later.label], ['upcoming', '2026-10-19', 'WEEK 43']);
  assert.deepEqual(later.pager, { prev: '2026-10-12', next: '2026-10-26', thisWeek: '2026-10-12' });
  const earlier = buildWeek(loadSample(), TODAY, { start: '2026-09-30' });
  assert.deepEqual([earlier.kind, earlier.start, earlier.label, earlier.title], ['past', '2026-09-28', 'WEEK 40', '28 Sep – 4 Oct']);
  assert.equal(thisWeek(loadSample(), TODAY, { start: '2026-10-18' }).start, '2026-10-12');
});

/** buildWeek for today's week: the live board. */
function thisWeek(s: VaultSnapshot, today: string, input?: WeekInput): ThisWeekVM {
  const w = buildWeek(s, today, input);
  assert.ok(w.kind === 'this', 'expected this week');
  return w;
}

test('this week: every board row is draggable; a line carries its dates in plan; a card carries its plan unless it waits', () => {
  const rows = items().flatMap((i) => (i.kind === 'row' ? [i.row] : []));
  assert.ok(rows.length > 0 && rows.every((r) => r.draggable));
  assert.equal(row('Dentist checkup').draggable, true);
  assert.deepEqual(row('Clean the gutters').plan, { scheduled: '2026-10-15' });
  assert.deepEqual(row('Back up the photos').plan, { start: '2026-10-12' });
  assert.deepEqual(card("Choose hosting for Sam's site").plan, { due: '2026-10-20' });
  assert.equal('plan' in card('Choose a contractor'), false);
});

// ---------- A past week's record (Task 8) ----------

/** The sample's week plan note for the week that holds `start`. */
function planNote(start: string): RawNote {
  const n = readSample().find((x) => x.path === weekPlanPath(start));
  if (!n) throw new Error('no week plan for ' + start);
  return n;
}

/** buildWeek for a week before this one. */
function pastWeekOf(input: WeekInput): PastWeekVM {
  const w = buildWeek(loadSample(), TODAY, input);
  assert.ok(w.kind === 'past', 'expected a past week');
  return w;
}

test('a past week with a record in its plan shows the record', () => {
  const w = pastWeekOf({ start: '2026-10-05', plan: planNote('2026-10-05') });
  assert.deepEqual(w.source, [{ text: 'Record' }, { text: 'frozen Mon 12 Oct' }]);
  assert.deepEqual([w.label, w.title, w.start, w.done, w.total], ['WEEK 41', '5–11 October', '2026-10-05', 5, 10]);
  assert.deepEqual(w.pager, { prev: '2026-09-28', next: '2026-10-12', thisWeek: '2026-10-12' });
  assert.deepEqual(w.columns.map((c) => [c.title, c.rows.length]), [['Not done', 3], ['In progress', 2], ['Done', 5]]);
  assert.equal(w.backlog?.length, 4);
});

test('a plan without the five record sections, or no plan, gives From your notes', () => {
  const fromNotes = pastWeekOf({ start: '2026-10-05' });
  assert.deepEqual(fromNotes.source, [{ text: 'From your notes' }]);
  assert.deepEqual(pastWeekOf({ start: '2026-10-05', plan: planNote('2026-10-12') }), fromNotes);   // week 42's plan: no record
  const w41 = planNote('2026-10-05');
  const noBacklog = { ...w41, lines: w41.lines.filter((l) => l !== '### Backlog') };
  assert.deepEqual(pastWeekOf({ start: '2026-10-08', plan: noBacklog }), fromNotes);
});

test('a plan passed for this week or an upcoming week is ignored', () => {
  const w41 = planNote('2026-10-05');
  assert.deepEqual(buildWeek(loadSample(), TODAY, { plan: w41 }), buildWeek(loadSample(), TODAY));
  assert.deepEqual(
    buildWeek(loadSample(), TODAY, { start: '2026-10-19', plan: w41 }),
    buildWeek(loadSample(), TODAY, { start: '2026-10-19' }),
  );
});

test('an area task note\'s open lines are loose rows on the Week board and in its counts, as an area\'s lines are', () => {
  const w = thisWeek(buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    {
      path: '04 Areas/Home/Renovate bathroom.md',
      frontmatter: { type: 'task', status: 'open', due: '2026-10-22' },
      lines: ['- [ ] Call plumber [due:: 2026-10-15]', '- [/] Pick tiles [scheduled:: 2026-10-14]', '- [ ] Order paint'],
    },
  ]), TODAY);
  assert.deepEqual(w.columns.todo.map(label), ['Call plumber']);
  assert.deepEqual(w.columns.doing.map(label), ['Pick tiles']);
  const [plumber] = w.columns.todo;
  const [tiles] = w.columns.doing;
  assert.ok(plumber?.kind === 'row' && tiles?.kind === 'row');
  assert.deepEqual(texts(plumber.row.meta), ['Renovate bathroom', 'Due Thu']);
  assert.deepEqual(texts(tiles.row.meta), ['Renovate bathroom', 'Planned Wed']);
  assert.deepEqual(w.days.map((d) => d.planned), [0, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(w.days.map((d) => d.due), [0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual([w.left, w.done], [2, 0]);
});

test('waitingOn names the first link of a waiting line, and reads a 40 KB line of wikilink openers in linear time', () => {
  const waiting = (text: string) => ({ tasks: [{ state: 'waiting', text }] }) as unknown as NoteInfo;
  assert.equal(waitingOn(waiting('Get photos from [[Sam Rivers|Sam]]')), 'Waiting on Sam');
  const started = performance.now();
  assert.equal(waitingOn(waiting('[['.repeat(20000))), 'Waiting');
  assert.ok(performance.now() - started < 200, 'a 40 KB waiting line took too long');
});
