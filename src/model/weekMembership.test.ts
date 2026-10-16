// What a week holds (weeks design, Part 1, section 2): one rule for task lines, task notes and stories, shared by the
// Week board, To plan and the upcoming weeks. Each rule has its own case here, built from small notes.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildBacklog } from './backlog.ts';
import { buildSnapshot } from './snapshot.ts';
import { noteRow } from './rows.ts';
import type { BoardItem, NoteInfo, RawNote, ThisWeekVM, UpcomingWeekVM } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42: Mon 12 to Sun 18 October
const NEXT = '2026-10-19';    // Monday, ISO week 43
const PROJECT = '03 Projects/Website for Sam';
const HOME = '04 Areas/Home/Home.md';

/** The active project "Website for Sam" with the given notes in its folder. */
function project(...more: RawNote[]): RawNote[] {
  return [{ path: `${PROJECT}/Website for Sam.md`, frontmatter: { type: 'project', status: 'active' }, lines: [] }, ...more];
}

/** A story: a task note inside the project's folder, with its lines. */
function story(name: string, frontmatter: Record<string, unknown>, lines: string[] = []): RawNote {
  return { path: `${PROJECT}/${name}.md`, frontmatter: { type: 'task', ...frontmatter }, lines };
}

/** A task note in the Home area, outside any project: not a story. */
function homeNote(name: string, frontmatter: Record<string, unknown>): RawNote {
  return { path: `04 Areas/Home/${name}.md`, frontmatter: { type: 'task', ...frontmatter }, lines: [] };
}

/** The Home area's own note, with the given lines, and any further notes. */
function home(lines: string[], ...more: RawNote[]): RawNote[] {
  return [{ path: HOME, frontmatter: { type: 'area' }, lines }, ...more];
}

function week(notes: RawNote[], today = TODAY): ThisWeekVM {
  const vm = buildWeek(buildSnapshot(notes), today);
  assert.ok(vm.kind === 'this', 'expected this week');
  return vm;
}

function upcoming(notes: RawNote[], start: string, today = TODAY): UpcomingWeekVM {
  const vm = buildWeek(buildSnapshot(notes), today, { start });
  assert.ok(vm.kind === 'upcoming', 'expected an upcoming week');
  return vm;
}

const titleOf = (i: BoardItem): string => (i.kind === 'row' ? i.row.title : i.card.title);
const column = (vm: ThisWeekVM, col: keyof ThisWeekVM['columns']): string[] => vm.columns[col].map(titleOf);
const onBoard = (vm: ThisWeekVM): string[] => [...column(vm, 'todo'), ...column(vm, 'doing'), ...column(vm, 'waiting'), ...column(vm, 'done')];
const sorted = (titles: string[]): string[] => [...titles].sort();

/** The one note of a snapshot, by its name. */
function noteNamed(notes: RawNote[], name: string): NoteInfo {
  const n = buildSnapshot(notes).notes.find((x) => x.name === name);
  assert.ok(n, 'no note ' + name);
  return n;
}

test('the rule, a planned day: a story with a day in the week is on the board, in its column', () => {
  const vm = week(project(story('Plan the walls', { status: 'open', scheduled: '2026-10-15' })));
  assert.deepEqual(column(vm, 'todo'), ['Plan the walls']);
});

test('the rule, a week plan: a story planned for this week, any day, is on the board; one planned for next week is not', () => {
  const vm = week(project(
    story('Paint the hall', { status: 'open', start: '2026-10-12' }),
    story('Sand the floor', { status: 'open', start: '2026-10-19' }),
  ));
  assert.deepEqual(column(vm, 'todo'), ['Paint the hall']);
});

test('the rule, a deadline: a story due this week is on the board; one due next week is not', () => {
  const vm = week(project(
    story('Pick a tile', { status: 'doing', due: '2026-10-18' }),
    story('Grout the tile', { status: 'doing', due: '2026-10-19' }),
  ));
  assert.deepEqual(column(vm, 'doing'), ['Pick a tile']);
});

test('the rule, the lead window: a story is on the board from its due date minus its lead, up to the deadline', () => {
  const vm = week(project(
    story('Renew the lease', { status: 'open', due: '2026-10-30', lead: '2w' }),   // opens Fri 16 Oct
    story('Book the van', { status: 'open', due: '2026-10-30', lead: '1w' }),     // opens Fri 23 Oct
  ));
  assert.deepEqual(column(vm, 'todo'), ['Renew the lease']);
});

test('the lead window in hours or minutes is whole days: under a day it opens on the deadline\'s own day', () => {
  const vm = week(project(
    story('Ring ahead', { status: 'open', due: '2026-10-19', lead: '23h' }),        // 0 days: opens Mon 19 Oct
    story('Ring a day ahead', { status: 'open', due: '2026-10-19', lead: '24h' }),  // 1 day: opens Sun 18 Oct
  ));
  assert.deepEqual(column(vm, 'todo'), ['Ring a day ahead']);
});

test('the lead window counts for a task note outside a project too', () => {
  const vm = week(home([], homeNote('Renew passport', { status: 'open', due: '2026-10-30', lead: '2w' })));
  assert.deepEqual(column(vm, 'todo'), ['Renew passport']);
});

test('the rule, a chase: a waiting story is on the board by its chase date, a waiting line by its own', () => {
  const vm = week(home(['- [w] Hear back from the plumber [scheduled:: 2026-10-15]'], ...project(
    story('Contractor', { status: 'waiting', chase: '2026-10-15', waiting_on: 'Bram' }),
    story('Tiles', { status: 'waiting', chase: '2026-10-22' }),
  )));
  assert.deepEqual(sorted(column(vm, 'waiting')), ['Contractor', 'Hear back from the plumber']);
});

test('the rule, a repeat: a repeating task note is in the week by its deadline', () => {
  const vm = week(home([],
    homeNote('Back up the laptop', { status: 'open', repeat: 'every month', due: '2026-10-15' }),
    homeNote('Clean the filter', { status: 'open', repeat: 'every month', due: '2026-10-25' }),
  ));
  assert.deepEqual(column(vm, 'todo'), ['Back up the laptop']);
});

test('the rule, done: a line or a story done this week is in Done; one done the week before is not', () => {
  const vm = week(home(['- [x] Call the bank [completion:: 2026-10-14]', '- [x] Pay the gas [completion:: 2026-10-11]'], ...project(
    story('Ordered', { status: 'done', done: '2026-10-12' }),
    story('Old', { status: 'done', done: '2026-10-11' }),
  )));
  assert.deepEqual(column(vm, 'done'), ['Call the bank', 'Ordered']);
});

test('the rule, carry-over: an open item dated before the week is still in it, until it is done or replanned', () => {
  const vm = week(home(['- [ ] Ring the bank [scheduled:: 2026-10-09]'],
    homeNote('Renew the car tax', { status: 'open', due: '2026-10-08' }),
    ...project(story('Pick the sink', { status: 'doing', scheduled: '2026-10-06' })),
  ));
  assert.deepEqual(sorted(column(vm, 'todo')), ['Renew the car tax', 'Ring the bank']);
  assert.deepEqual(column(vm, 'doing'), ['Pick the sink']);
});

test('the rule, no date: an open story with no date is in no week, whatever its status, and is in Backlog under its project', () => {
  const notes = project(
    story('Measure the walls', { status: 'open' }),
    story('Paint the walls', { status: 'doing' }),
    story('Wait for the paint', { status: 'waiting' }),
  );
  assert.deepEqual(onBoard(week(notes)), []);
  const backlog = buildBacklog(buildSnapshot(notes), TODAY);
  assert.deepEqual(backlog.noDate.map((g) => [g.name, g.rows.map((r) => r.title)]), [
    ['Website for Sam', ['Measure the walls', 'Paint the walls', 'Wait for the paint']],
  ]);
});

test('the rule, no date: a story with a line planned this week is on the board, and its line counts on its day', () => {
  const vm = week(project(story('Compare hosting', { status: 'doing' }, ['- [/] Compare prices [scheduled:: 2026-10-14]'])));
  assert.deepEqual(column(vm, 'doing'), ['Compare hosting']);
  assert.deepEqual(vm.days.map((d) => d.planned), [0, 0, 1, 0, 0, 0, 0]);
});

test('the rule, no date: a story with no date of its own, but a dated open line, is not in No date: its line is in the week', () => {
  const notes = project(story('Compare hosting', { status: 'open' }, ['- [ ] Compare prices [scheduled:: 2026-10-14]']));
  assert.deepEqual(column(week(notes), 'todo'), ['Compare hosting']);
  assert.deepEqual(buildBacklog(buildSnapshot(notes), TODAY).noDate, []);
});

test('the rule, no date: a story whose lines have no date is in no week', () => {
  const vm = week(project(story('Undated lines', { status: 'open' }, ['- [ ] Re-measure the corner'])));
  assert.deepEqual(onBoard(vm), []);
});

test('the rule, no date: a story whose only dated line was done this week is in no week, and is in No date', () => {
  const notes = project(story('Undated done line', { status: 'open' }, ['- [x] Pay the deposit [completion:: 2026-10-14]']));
  assert.deepEqual(onBoard(week(notes)), []);
  assert.deepEqual(buildBacklog(buildSnapshot(notes), TODAY).noDate.map((g) => [g.name, g.rows.map((r) => r.title)]), [
    ['Website for Sam', ['Undated done line']],
  ]);
});

test('To plan: Still open this week holds a carried-over story; one due next week is on its day, not in Still open', () => {
  const vm = upcoming(project(
    story('Pick the sink', { status: 'open', due: '2026-10-14' }),
    story('Hang the shelf', { status: 'open', due: '2026-10-21' }),
  ), NEXT);
  assert.deepEqual(vm.toPlan.open.map((r) => r.title), ['Pick the sink']);
  assert.deepEqual(vm.byDay.map((g) => [g.iso, g.rows.map((r) => r.title)]), [['2026-10-21', ['Hang the shelf']]]);
});

test('To plan: a story with a carried-over open line is in Still open, as it is on this week\'s board', () => {
  const notes = project(story('Old step story', { status: 'open' }, ['- [ ] Old step [scheduled:: 2026-10-05]']));
  assert.deepEqual(column(week(notes), 'todo'), ['Old step story']);
  const vm = upcoming(notes, NEXT);
  assert.deepEqual(vm.toPlan.open.map((r) => [r.title, r.draggable, r.plan]), [['Old step story', true, {}]]);
  assert.equal(vm.toPlan.count, 1);
});

test('To plan: a task note whose lead window opened this week is in Still open once, and not again in Due soon', () => {
  const vm = upcoming(home([], homeNote('Renew passport', { status: 'open', due: '2026-11-20', lead: '5w' })), NEXT);   // window from Fri 16 Oct
  assert.deepEqual(vm.toPlan.open.map((r) => r.title), ['Renew passport']);
  assert.deepEqual(vm.toPlan.dueSoon, []);
  assert.equal(vm.toPlan.count, 1);
});

test('To plan: an undated open story is in No date under its project, as a plannable row', () => {
  const vm = upcoming(project(story('Measure the walls', { status: 'open' })), NEXT);
  assert.deepEqual(vm.toPlan.noDate.map((g) => [g.name, g.rows.map((r) => [r.title, r.draggable, r.plan])]), [
    ['Website for Sam', [['Measure the walls', true, {}]]],
  ]);
});

test('Planned or due: a story planned in the week is listed on its day and drags; a waiting story does not', () => {
  const vm = upcoming(project(
    story('Hang the shelf', { status: 'open', scheduled: '2026-10-21' }),
    story('Wait for it', { status: 'waiting', chase: '2026-10-22' }),
  ), NEXT);
  assert.deepEqual(vm.byDay.flatMap((g) => g.rows).map((r) => [r.title, r.draggable, r.plan]), [
    ['Hang the shelf', true, { scheduled: '2026-10-21' }],
    ['Wait for it', false, undefined],
  ]);
});

test('Planned or due: an item whose lead window is in the week, with its deadline later, is under Any day', () => {
  const notes = project(story('Renew the lease', { status: 'open', due: '2026-11-02', lead: '2w' }));   // window from Mon 19 Oct
  const groups = (start: string) => upcoming(notes, start).byDay.map((g) => [g.iso ?? 'any', g.rows.map((r) => r.title)]);
  assert.deepEqual(groups(NEXT), [['any', ['Renew the lease']]]);
  assert.deepEqual(groups('2026-10-26'), [['any', ['Renew the lease']]]);
  assert.deepEqual(groups('2026-11-02'), [['2026-11-02', ['Renew the lease']]]);
});

test('a story is plannable like a task note: open and doing carry a plan, waiting and done do not', () => {
  const tiles = (frontmatter: Record<string, unknown>) => noteNamed(project(story('Tiles', frontmatter)), 'Tiles');
  assert.deepEqual(noteRow(tiles({ status: 'open' }), TODAY).plan, {});
  assert.deepEqual(noteRow(tiles({ status: 'doing', scheduled: '2026-10-15' }), TODAY).plan, { scheduled: '2026-10-15' });
  assert.equal(noteRow(tiles({ status: 'waiting', chase: '2026-10-15' }), TODAY).plan, undefined);
  assert.equal(noteRow(tiles({ status: 'done', done: '2026-10-12' }), TODAY).plan, undefined);
});

test('a story card on the board carries its plan, as a task row does', () => {
  const vm = week(project(story('Tiles', { status: 'doing', scheduled: '2026-10-15' })));
  const item = vm.columns.doing[0];
  assert.ok(item?.kind === 'card');
  assert.deepEqual(item.card.plan, { scheduled: '2026-10-15' });
});

test('parity: every note plan case in the shared file is plannable for a story exactly as for a task note', () => {
  const shared = JSON.parse(readFileSync(new URL('../../test/edit-cases.json', import.meta.url), 'utf8')) as {
    notePlans: { name: string; before: Record<string, unknown>; today?: string }[];
  };
  for (const c of shared.notePlans) {
    const today = c.today ?? TODAY;
    const asStory = noteRow(noteNamed(project(story('Case', c.before)), 'Case'), today).plan;
    const asNote = noteRow(noteNamed(home([], homeNote('Case', c.before)), 'Case'), today).plan;
    assert.deepEqual(asStory, asNote, c.name);
  }
});
