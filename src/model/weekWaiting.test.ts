import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import type { WeekInput } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import { ARRANGE_COLUMNS, readArrangement, waitingViewOf } from './arrange.ts';
import { loadSample, readSample } from '../../test/sample.ts';
import type { BoardItem, RawNote, ThisWeekVM, VaultSnapshot } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42: Mon 12 to Sun 18 October

function thisWeek(s: VaultSnapshot, input: WeekInput = {}): ThisWeekVM {
  const w = buildWeek(s, TODAY, input);
  assert.ok(w.kind === 'this', 'expected this week');
  return w;
}

const label = (i: BoardItem): string => (i.kind === 'row' ? i.row.title : 'card ' + i.card.title);
const keyOf = (i: BoardItem): string => i.arrangeKey;

/** The sample's Choose a contractor is a waiting story: it moves from Doing to Waiting, and nothing else moves. */
test('the sample: Waiting holds the waiting story, Doing holds two, and the board holds the same 12 items', () => {
  const w = thisWeek(loadSample());
  assert.equal(w.columns.todo.length, 7);
  assert.deepEqual(w.columns.doing.map(label), ['Build the homepage header', "card Choose hosting for Sam's site"]);
  assert.deepEqual(w.columns.waiting.map(label), ['card Choose a contractor']);
  assert.equal(w.columns.done.length, 2);
  const all = [...w.columns.todo, ...w.columns.doing, ...w.columns.waiting, ...w.columns.done].map(keyOf).sort();
  assert.equal(all.length, 12);
  assert.equal(new Set(all).size, 12);
});

/**
 * An area Home with three waiting lines (a chase yesterday, a later one, and none), a waiting task note with a chase,
 * and a waiting story of an active project whose own planned day is 12 Oct (overdue). Each is on the board this week.
 */
function waitingFixture(): VaultSnapshot {
  const home = { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [
    '- [w] Later chase [scheduled:: 2026-10-16]',
    '- [w] Overdue chase [scheduled:: 2026-10-10]',
    '- [w] No chase [due:: 2026-10-14]',
  ] };
  const council: RawNote = { path: '04 Areas/Home/Call the council.md', frontmatter: { type: 'task', status: 'waiting', chase: '2026-10-15' }, lines: [] };
  const project: RawNote = { path: '03 Projects/Renovate the kitchen/Renovate the kitchen.md', frontmatter: { type: 'project', status: 'active' }, lines: [] };
  const story: RawNote = {
    path: '03 Projects/Renovate the kitchen/Choose a contractor.md',
    frontmatter: { type: 'task', status: 'waiting', scheduled: '2026-10-12' },
    lines: ['- [w] Get the written quote from [[Bram Ellery|Bram]] [scheduled:: 2026-10-15]'],
  };
  return buildSnapshot([home, council, project, story]);
}

test('Waiting starts in chase order: the earliest chase first, an overdue one at the top, no chase last', () => {
  const w = thisWeek(waitingFixture());
  assert.deepEqual(w.columns.waiting.map(label), [
    'Overdue chase',
    'card Choose a contractor',
    'Call the council',
    'Later chase',
    'No chase',
  ]);
  assert.deepEqual(w.columns.doing, []);
  assert.deepEqual(w.columns.todo, []);
});

test('a saved waiting list keeps its listed order; an item not listed goes in by its chase, a stale key ignored', () => {
  const w = thisWeek(waitingFixture(), { arrange: { waiting: ['Call the council', 'Home › No chase', 'Nope'] } });
  assert.deepEqual(w.columns.waiting.map(label), [
    'Overdue chase',
    'card Choose a contractor',
    'Call the council',
    'Later chase',
    'No chase',
  ]);
});

/** An area Home with three waiting lines: A chased on 15 Oct, B on 17 Oct, C on 12 Oct. */
function threeChases(): VaultSnapshot {
  const home = { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [
    '- [w] Item A [scheduled:: 2026-10-15]',
    '- [w] Item B [scheduled:: 2026-10-17]',
    '- [w] Item C [scheduled:: 2026-10-12]',
  ] };
  return buildSnapshot([home]);
}

test('section 4b: an item not in the saved list goes in by its chase, before the first listed item chased later', () => {
  const s = threeChases();
  assert.deepEqual(thisWeek(s).columns.waiting.map(label), ['Item C', 'Item A', 'Item B']);
  assert.deepEqual(
    thisWeek(s, { arrange: { waiting: ['Home › Item A', 'Home › Item B'] } }).columns.waiting.map(label),
    ['Item C', 'Item A', 'Item B'],
  );
  assert.deepEqual(
    thisWeek(s, { arrange: { waiting: ['Home › Item B', 'Home › Item A'] } }).columns.waiting.map(label),
    ['Item C', 'Item B', 'Item A'],
  );
});

test('Doing\'s saved list may name a waiting item: it is ignored while the item waits', () => {
  const w = thisWeek(loadSample(), { arrange: { doing: ['Choose a contractor', "Choose hosting for Sam's site"] } });
  assert.deepEqual(w.columns.doing.map(label), ["card Choose hosting for Sam's site", 'Build the homepage header']);
  assert.deepEqual(w.columns.waiting.map(label), ['card Choose a contractor']);
});

test('when the item comes back to Doing, Doing\'s saved list places it, and Waiting no longer holds it', () => {
  const raw = readSample();
  const contractor = raw.find((n) => n.path.endsWith('/Choose a contractor.md'));
  assert.ok(contractor);
  contractor.frontmatter = { ...contractor.frontmatter, status: 'doing' };   // the state card or a drop moved it back
  const w = thisWeek(buildSnapshot(raw), { arrange: { doing: ['Choose a contractor', "Choose hosting for Sam's site"] } });
  assert.deepEqual(w.columns.doing.map(label), ['card Choose a contractor', "card Choose hosting for Sam's site", 'Build the homepage header']);
  assert.deepEqual(w.columns.waiting, []);
});

test('saved holds the Waiting list with To do and Doing, and no other column', () => {
  const w = thisWeek(loadSample(), { arrange: { waiting: ['Choose a contractor'], someday: ['Repaint the bedroom'] } });
  assert.deepEqual(w.saved, { waiting: ['Choose a contractor'] });
});

test('waiting is an arrangeable column, and a broken or Done value of it is dropped', () => {
  assert.ok(ARRANGE_COLUMNS.includes('waiting'));
  assert.deepEqual(readArrangement({ waiting: ['Choose a contractor'], done: ['x'] }), { waiting: ['Choose a contractor'] });
  assert.deepEqual(readArrangement({ waiting: 'x' }), {});
});

test('waitingViewOf: group when the config says group; column for anything else', () => {
  assert.equal(waitingViewOf('group'), 'group');
  for (const v of [undefined, null, 'column', 'Group', '', 3, true, ['group'], { waiting: 'group' }]) {
    assert.equal(waitingViewOf(v), 'column', String(v));
  }
});
