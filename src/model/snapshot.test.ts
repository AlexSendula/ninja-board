import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from './snapshot.ts';
import type { RawNote } from './types.ts';

function raw(path: string, frontmatter?: Record<string, unknown>, lines: string[] = []): RawNote {
  return { path, frontmatter, lines };
}

test('membership follows the folder of the project or area note, never the name', () => {
  const { notes } = buildSnapshot([
    raw('03 Projects/Website for Sam/Website for Sam.md', { type: 'project' }),
    raw('03 Projects/Website for Sam/Design/Notes.md', { type: 'task' }),
    raw('03 Projects/Website for Sam 2/Notes.md', { type: 'task' }),
    raw('03 Projects/Renovate the kitchen/Renovate the kitchen.md', { type: 'project' }),
    raw('03 Projects/Renovate the kitchen/Notes.md', { type: 'task' }),
    raw('04 Areas/Home/Home.md', { type: 'area' }),
    raw('04 Areas/Home/Notes.md', { type: 'task' }),
    raw('04 Areas/Home/Garden shed/Garden shed.md', { type: 'project' }),
    raw('04 Areas/Home/Garden shed/Notes.md', { type: 'task' }),
    raw('04 Areas/Friends/Website for Sam.md', { type: 'task' }),
  ]);
  const site = '03 Projects/Website for Sam/Website for Sam.md';
  const kitchen = '03 Projects/Renovate the kitchen/Renovate the kitchen.md';
  const home = '04 Areas/Home/Home.md';
  const shed = '04 Areas/Home/Garden shed/Garden shed.md';
  // [path, projectPath, areaPath, parentName]
  assert.deepEqual(notes.map((n) => [n.path, n.projectPath, n.areaPath, n.parentName]), [
    [site, undefined, undefined, undefined],
    ['03 Projects/Website for Sam/Design/Notes.md', site, undefined, 'Website for Sam'],
    ['03 Projects/Website for Sam 2/Notes.md', undefined, undefined, undefined],
    [kitchen, undefined, undefined, undefined],
    ['03 Projects/Renovate the kitchen/Notes.md', kitchen, undefined, 'Renovate the kitchen'],
    [home, undefined, undefined, undefined],
    ['04 Areas/Home/Notes.md', undefined, home, 'Home'],
    [shed, undefined, home, 'Home'],
    ['04 Areas/Home/Garden shed/Notes.md', shed, undefined, 'Garden shed'],
    ['04 Areas/Friends/Website for Sam.md', undefined, undefined, undefined],
  ]);
});

test('notes under 10 Archive/ are skipped', () => {
  const { notes } = buildSnapshot([
    raw('10 Archive/03 Projects/Old site/Old site.md', { type: 'project' }),
    raw('10 Archive/03 Projects/Old site/Pick hosting.md', { type: 'task' }),
    raw('02 Inbox/2026-10-13 0912 Order shipped.md', { type: 'inbox' }),
  ]);
  assert.deepEqual(notes.map((n) => n.path), ['02 Inbox/2026-10-13 0912 Order shipped.md']);
});

test('name, folder, type and text fields come from the path and frontmatter', () => {
  const { notes } = buildSnapshot([
    raw('02 Inbox/2026-10-13 0912 Order shipped.md', { type: 'inbox', received: new Date('2026-10-13T09:12:00Z') }),
    raw('Loose.md', undefined),
    raw('04 Areas/Friends/Gift ideas.md', { type: 'recipe', area: '[[Friends|My friends]]' }),
  ]);
  assert.deepEqual(notes.map((n) => [n.name, n.folder, n.type, n.area, n.received]), [
    ['2026-10-13 0912 Order shipped', '02 Inbox', 'inbox', undefined, '2026-10-13T09:12'],
    ['Loose', '', 'other', undefined, undefined],
    ['Gift ideas', '04 Areas/Friends', 'other', 'Friends', undefined],
  ]);
});

test('task lines keep their 0-based line number in the file', () => {
  const { notes } = buildSnapshot([
    raw('04 Areas/Home/Home.md', { type: 'area' }, ['---', 'type: area', '---', '', '## Tasks', '- [ ] Fix the hallway light switch']),
  ]);
  assert.deepEqual(notes[0]?.tasks.map((t) => [t.line, t.raw]), [[5, '- [ ] Fix the hallway light switch']]);
});

test('a week plan (frontmatter start) arrives as start; a value that is not a date is undefined', () => {
  const { notes } = buildSnapshot([
    raw('04 Areas/Home/Back up the photos.md', { type: 'task', status: 'open', start: new Date(2026, 9, 19) }),
    raw('04 Areas/Home/Renew passport.md', { type: 'task', status: 'open', start: 'someday' }),
    raw('04 Areas/Home/Plain.md', { type: 'task', status: 'open' }),
  ]);
  assert.deepEqual(notes.map((n) => n.start), ['2026-10-19', undefined, undefined]);
});

test('a waiting task note carries its chase date and who it waits on, as the name shown', () => {
  const { notes } = buildSnapshot([
    raw('04 Areas/Home/Call back.md', { type: 'task', status: 'waiting', waiting_on: '[[Bram Ellery|Bram]]', chase: new Date(2026, 9, 15) }),
    raw('04 Areas/Home/Ask around.md', { type: 'task', status: 'waiting', waiting_on: 'the landlord', chase: '2026-10-16' }),
    raw('04 Areas/Home/Plain.md', { type: 'task', status: 'open' }),
  ]);
  assert.deepEqual(notes.map((n) => [n.chase, n.waitingOn]), [
    ['2026-10-15', 'Bram'],
    ['2026-10-16', 'the landlord'],
    [undefined, undefined],
  ]);
});

test('created is read as an ISO date, from a string or a YAML date; anything else is left out', () => {
  const { notes } = buildSnapshot([
    raw('03 Projects/A/A.md', { type: 'project', created: '2026-10-04' }),
    raw('03 Projects/B/B.md', { type: 'project', created: new Date(2026, 8, 12) }),
    raw('03 Projects/C/C.md', { type: 'project', created: '2026-09-30T08:15' }),
    raw('03 Projects/D/D.md', { type: 'project', created: 'last spring' }),
    raw('03 Projects/E/E.md', { type: 'project' }),
  ]);
  assert.deepEqual(notes.map((n) => n.created), ['2026-10-04', '2026-09-12', '2026-09-30', undefined, undefined]);
});
