// The Week board's folded stories: the view's `collapsed:` list, read from the config and changed by Collapse all, Expand all and a chevron.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCollapsed, setFolded } from './arrange.ts';

test('readCollapsed: anything but a list is no folded story', () => {
  for (const v of [undefined, null, 'Order cabinets', 42, true, { 0: 'Order cabinets' }]) {
    assert.deepEqual(readCollapsed(v), [], String(v));
  }
});

test('readCollapsed: text names stay, numbers read as text (a note named "2026" comes back from YAML as a number), nothing else survives', () => {
  assert.deepEqual(readCollapsed(['Order cabinets', 2026, null, {}, ['x'], false]), ['Order cabinets', '2026']);
  assert.deepEqual(readCollapsed([Number.NaN, Number.POSITIVE_INFINITY, 'b']), ['b']);
  assert.deepEqual(readCollapsed([]), []);
});

test('readCollapsed: a name listed twice is listed once, in the place of its first mention; the input is not mutated', () => {
  const saved = Object.freeze(['b', 'a', 'b', 2026, '2026']);
  assert.deepEqual(readCollapsed(saved), ['b', 'a', '2026']);
  assert.deepEqual(saved, ['b', 'a', 'b', 2026, '2026']);
});

test('setFolded: folding adds the names after the saved ones, once', () => {
  assert.deepEqual(setFolded(['a'], ['b', 'a', 'c'], true), ['a', 'b', 'c']);
  assert.deepEqual(setFolded([], ['x', 'x'], true), ['x']);
});

test('setFolded: opening removes only those names, and keeps the others, even a story that is not on the board this week', () => {
  assert.deepEqual(setFolded(['a', 'gone', 'b'], ['a', 'b'], false), ['gone']);
  assert.deepEqual(setFolded(['a'], ['zzz'], false), ['a']);
  assert.deepEqual(setFolded([], ['a'], false), []);
});

test('setFolded: the saved list is never pruned, and the input is not mutated', () => {
  const saved = Object.freeze(['left the week', 'a']);
  assert.deepEqual(setFolded(saved, ['a'], true), ['left the week', 'a']);
  assert.deepEqual(setFolded(saved, [], true), ['left the week', 'a']);
  assert.deepEqual(saved, ['left the week', 'a']);
});
