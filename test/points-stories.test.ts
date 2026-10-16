// The preview's points edit takes stories only, as Brain's own does (deviation 5): an area task note is refused, unwritten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryWrites } from '../preview/memoryWrites.ts';
import { readSample } from './sample.ts';
import type { RawNote } from '../src/model/types.ts';

const TODAY = '2026-10-13';
const STORY = '03 Projects/Renovate the kitchen/Order cabinets.md';
const AREA = '04 Areas/Home/Renew passport.md';

test('the preview sets a story\'s points', async () => {
  const notes = readSample();
  const writes = memoryWrites(notes, TODAY, () => {});
  assert.ok(await writes.points({ kind: 'note', path: STORY, state: 'todo' }, 3));
  assert.equal(notes.find((n: RawNote) => n.path === STORY)?.frontmatter?.points, 3);
});

test('the preview refuses an area task note: its frontmatter is not written', async () => {
  const notes = readSample();
  const before = structuredClone(notes.find((n: RawNote) => n.path === AREA)?.frontmatter);
  let renders = 0;
  const writes = memoryWrites(notes, TODAY, () => { renders++; });
  assert.equal(await writes.points({ kind: 'note', path: AREA, state: 'todo' }, 3), null);
  assert.deepEqual(notes.find((n: RawNote) => n.path === AREA)?.frontmatter, before);
  assert.equal(renders, 0);
});
