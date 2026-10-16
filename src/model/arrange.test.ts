import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARRANGE_COLUMNS, mergeArrangement, readArrangement, readScheduleView } from './arrange.ts';
import { ARRANGE_SEPARATOR, arrange, lineKey, placeItem } from './arrange.ts';

test('ARRANGE_COLUMNS: the columns a board can arrange; never Done', () => {
  assert.deepEqual(ARRANGE_COLUMNS, ['todo', 'doing', 'waiting', 'active', 'paused', 'someday']);
});

test('readArrangement: anything but a plain object is no arrangement', () => {
  for (const v of [undefined, null, 'todo', 42, ['Order cabinets'], true]) {
    assert.deepEqual(readArrangement(v), {}, String(v));
  }
});

test('readArrangement: only lists of text keys; numbers read as text; nothing else survives', () => {
  assert.deepEqual(readArrangement({ todo: 'x' }), {});
  assert.deepEqual(readArrangement({ todo: ['a', 3, null, {}] }), { todo: ['a', '3'] });
  // YAML reads .nan and .inf as numbers, but no note is named that.
  assert.deepEqual(readArrangement({ doing: [Number.NaN, Number.POSITIVE_INFINITY, 'b'] }), { doing: ['b'] });
  // A column left with no keys is omitted.
  assert.deepEqual(readArrangement({ todo: [], doing: [null] }), {});
});

test('readArrangement: Done and unknown columns are dropped', () => {
  assert.deepEqual(
    readArrangement({ done: ['Pick design B'], later: ['x'], someday: ['Repaint the bedroom'], active: ['Website for Sam'] }),
    { active: ['Website for Sam'], someday: ['Repaint the bedroom'] },
  );
});

test('mergeArrangement: writes the given columns and keeps the others', () => {
  const current = { todo: ['Order cabinets'], doing: ["Choose hosting for Sam's site"] };
  assert.deepEqual(
    mergeArrangement(current, { todo: ['Home › Clean the gutters', 'Order cabinets'] }),
    { todo: ['Home › Clean the gutters', 'Order cabinets'], doing: ["Choose hosting for Sam's site"] },
  );
});

test('mergeArrangement: an empty list deletes its column', () => {
  assert.deepEqual(mergeArrangement({ todo: ['a'], doing: ['b'] }, { doing: [] }), { todo: ['a'] });
  assert.deepEqual(mergeArrangement({ todo: ['a'] }, { todo: [] }), {});
});

test('mergeArrangement: a broken current value counts as none, and Done or unknown columns go', () => {
  assert.deepEqual(mergeArrangement('garbage', { someday: ['Run a half marathon'] }), { someday: ['Run a half marathon'] });
  assert.deepEqual(
    mergeArrangement({ done: ['x'], todo: 5, later: ['y'] }, { active: ['Renovate the kitchen'] }),
    { active: ['Renovate the kitchen'] },
  );
});

test('mergeArrangement: never mutates what Bases or the caller handed over', () => {
  const current = { todo: ['a', 'b'], someday: ['c'] };
  const lists = { todo: ['b', 'a'], someday: [] };
  const merged = mergeArrangement(current, lists);
  assert.deepEqual(current, { todo: ['a', 'b'], someday: ['c'] });
  assert.deepEqual(lists, { todo: ['b', 'a'], someday: [] });
  assert.deepEqual(merged, { todo: ['b', 'a'] });
  // Fresh lists: a later push on the result can't reach Bases' own data or the caller's.
  assert.notEqual(merged.todo, lists.todo);
});

// ---------- Item keys, the arranged order, and placing a key (Task 4) ----------

type Keyed = { arrangeKey: string; n: number };
/** Items with these keys; each remembers its place as n, so items sharing a key stay apart. */
const keyed = (...keys: string[]): Keyed[] => keys.map((arrangeKey, n) => ({ arrangeKey, n }));
/** "c2": key c, given third. */
const named = (list: readonly Keyed[]): string[] => list.map((i) => `${i.arrangeKey}${i.n}`);

test('arrange: listed items first, in the listed order; the rest keep their order', () => {
  assert.deepEqual(named(arrange(keyed('a', 'b', 'c', 'd'), ['c', 'a'])), ['c2', 'a0', 'b1', 'd3']);
});

test('arrange: a key with no item is ignored', () => {
  assert.deepEqual(named(arrange(keyed('a', 'b', 'c'), ['gone', 'b', 'also gone'])), ['b1', 'a0', 'c2']);
});

test('arrange: items sharing a key are placed in turn, one per listed key', () => {
  assert.deepEqual(named(arrange(keyed('a', 'b', 'a'), ['a', 'b'])), ['a0', 'b1', 'a2']);
  assert.deepEqual(named(arrange(keyed('a', 'b', 'a'), ['b', 'a', 'a', 'a'])), ['b1', 'a0', 'a2']);
});

test('arrange: no list, or an empty one, gives a copy in the given order', () => {
  const given = keyed('b', 'a');
  for (const keys of [undefined, []]) {
    const out = arrange(given, keys);
    assert.deepEqual(named(out), ['b0', 'a1']);
    assert.notEqual(out, given);
  }
});

test('arrange: mutates neither the items nor the keys', () => {
  const given = Object.freeze(keyed('a', 'b', 'c'));
  const keys = Object.freeze(['c', 'b']);
  assert.deepEqual(named(arrange(given, keys)), ['c2', 'b1', 'a0']);
  assert.deepEqual(named(given), ['a0', 'b1', 'c2']);
  assert.deepEqual(keys, ['c', 'b']);
});

test('arrange: a broken arrange: value, read through readArrangement, keeps the normal order', () => {
  for (const broken of ['x', { todo: 5 }, { todo: [null, {}] }]) {
    assert.deepEqual(named(arrange(keyed('a', 'b'), readArrangement(broken).todo)), ['a0', 'b1'], JSON.stringify(broken));
  }
});

test('placeItem: moves a key within its list', () => {
  assert.deepEqual(placeItem(['a', 'b', 'c'], 2, 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(placeItem(['a', 'b', 'c'], 0, 'a', 1), ['b', 'a', 'c']);
  assert.deepEqual(placeItem(['a', 'b', 'c'], 0, 'a', 2), ['b', 'c', 'a']);
});

test('placeItem: inserts a key from another list (from null)', () => {
  assert.deepEqual(placeItem(['a', 'b'], null, 'x', 1), ['a', 'x', 'b']);
  assert.deepEqual(placeItem([], null, 'x', 0), ['x']);
});

test('placeItem: clamps the position to the list', () => {
  assert.deepEqual(placeItem(['a', 'b'], null, 'x', 9), ['a', 'b', 'x']);
  assert.deepEqual(placeItem(['a', 'b'], null, 'x', -3), ['x', 'a', 'b']);
  assert.deepEqual(placeItem(['a', 'b', 'c'], 1, 'b', 5), ['a', 'c', 'b']);
});

test('placeItem: works by position, so a repeated key is safe; the input is not mutated', () => {
  const keys = Object.freeze(['a', 'a', 'b']);
  assert.deepEqual(placeItem(keys, 1, 'a', 2), ['a', 'b', 'a']);
  assert.deepEqual(keys, ['a', 'a', 'b']);
});

test('lineKey: the note name, " › ", then the line text as shown', () => {
  assert.equal(ARRANGE_SEPARATOR, ' › ');
  assert.equal(lineKey('Website for Sam', 'Get photos from [[Sam Rivers|Sam]]'), 'Website for Sam › Get photos from Sam');
  assert.equal(lineKey('Home', 'Clean the [[gutters]] #outside'), 'Home › Clean the gutters');
});

test('readScheduleView: compact when the config says compact; large for anything else', () => {
  assert.equal(readScheduleView('compact'), 'compact');
  for (const v of [undefined, null, 'large', 'Compact', '', 3, true, ['compact'], { schedule: 'compact' }]) {
    assert.equal(readScheduleView(v), 'large', String(v));
  }
});
