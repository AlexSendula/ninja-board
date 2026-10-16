// Story points (deviation 5): a story's points are 1, 2, 3, 5 or 8, the week's target is points_per_week (8 when absent),
// and the edit sets or removes a story's `points` key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyNotePoints, DEFAULT_TARGET, pointsOf, pointsOfWeek, targetOf } from './points.ts';
import { buildSnapshot } from './snapshot.ts';

test('pointsOf: only 1, 2, 3, 5 and 8 are points; anything else is no points', () => {
  assert.deepEqual([1, 2, 3, 5, 8].map((v) => pointsOf(v)), [1, 2, 3, 5, 8]);
  assert.deepEqual([4, 0, 13, '3', null, undefined, 3.5].map((v) => pointsOf(v)), [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
});

test('targetOf: points_per_week from the config, the default 8 when absent or not a positive number', () => {
  assert.equal(DEFAULT_TARGET, 8);
  assert.equal(targetOf(undefined), 8);
  assert.equal(targetOf({}), 8);
  assert.equal(targetOf({ points_per_week: 12 }), 12);
  assert.equal(targetOf({ points_per_week: '12' }), 8);
  assert.equal(targetOf({ points_per_week: 0 }), 8);
});

test('applyNotePoints: set, replace, and remove; the other fields stay', () => {
  const set = { status: 'open' };
  applyNotePoints(set, 3);
  assert.deepEqual(set, { status: 'open', points: 3 });
  const replaced = { status: 'open', points: 2 };
  applyNotePoints(replaced, 5);
  assert.deepEqual(replaced, { status: 'open', points: 5 });
  const removed = { status: 'open', points: 3 };
  applyNotePoints(removed, null);
  assert.deepEqual(removed, { status: 'open' });
});

test('pointsOfWeek: planned is every story\'s points, done is the done ones\'; no story with points means no figure', () => {
  assert.equal(pointsOfWeek([{ done: false }, { done: true }], 8), undefined);
  assert.deepEqual(
    pointsOfWeek([{ points: 3, done: false }, { points: 2, done: true }, { done: false }], 8),
    { planned: 5, done: 2, target: 8 },
  );
});

test('the snapshot reads a task note\'s points: 1, 2, 3, 5 or 8, and ignores anything else', () => {
  const note = (points: unknown) => buildSnapshot([{
    path: '03 Projects/Sam/Story.md', frontmatter: { type: 'task', status: 'open', points }, lines: [],
  }]).notes[0];
  assert.equal(note(5).points, 5);
  assert.equal(note(4).points, undefined);
  assert.equal(note('3').points, undefined);
  assert.equal(note(undefined).points, undefined);
});
