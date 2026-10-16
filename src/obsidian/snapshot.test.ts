import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App, TFile } from 'obsidian';
import { readWeekPlan, snapshotFromFiles, taskLinesOnly } from './snapshot.ts';

// snapshot.ts only imports types from 'obsidian', so Node can load it; the vault is a stand-in.
const CONTENT: Record<string, string> = {
  'a.md': '- [ ] A one\r\n- [x] A two\r\n',
  'b.md': '- [ ] B one\n',
  'c.md': '- [ ] C one\n',
  'uncached.md': '- [ ] Not indexed yet\n',
  'plain.md': 'Just prose, and a list:\n- one\n- two\n',
  'fenced.md': '## Tasks\n- [ ] Real task\n\n```md\n- [ ] example\n```\n\n<!--\n- [ ] commented out\n-->\n',
  '10 Archive/old.md': '- [ ] Old\n',
  'image.png': '',
  'dentist.md': '## Log\n- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2027-04-20.\n',   // a repeating note with no task lines
};
// What Obsidian's metadata cache holds: a list item per task, at the line it starts on.
const item = (line: number, task = ' ') => ({ task, position: { start: { line }, end: { line } }, parent: -1 });
const CACHE: Record<string, object> = {
  'a.md': { frontmatter: { type: 'area' }, listItems: [item(0), item(1, 'x')] },
  'b.md': { listItems: [item(0)] },
  'plain.md': { frontmatter: { type: 'project' }, listItems: [{ position: { start: { line: 1 }, end: { line: 1 } }, parent: -1 }] },
  'c.md': { listItems: [item(0)] },
  'dentist.md': { frontmatter: { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2027-04-20' }, listItems: [] },
  'fenced.md': { listItems: [item(1)] },
};
const file = (path: string) => ({ path, extension: path.split('.').pop() }) as TFile;
const read: string[] = [];
const app = {
  vault: { cachedRead: async (f: TFile) => (read.push(f.path), CONTENT[f.path]) },
  metadataCache: { getFileCache: (f: TFile) => CACHE[f.path] ?? null },
} as unknown as App;

test('the notes come out sorted by path, whatever order the files arrive in', async () => {
  const snapshot = await snapshotFromFiles(app, ['c.md', 'a.md', 'b.md'].map(file));
  assert.deepEqual(snapshot.notes.map((n) => n.path), ['a.md', 'b.md', 'c.md']);
});

test('non-markdown files and the archive are not even read', async () => {
  read.length = 0;
  const snapshot = await snapshotFromFiles(app, ['b.md', '10 Archive/old.md', 'image.png'].map(file));
  assert.deepEqual(snapshot.notes.map((n) => n.path), ['b.md']);
  assert.deepEqual(read, ['b.md']);
});

test('a CRLF note still parses its tasks, and its frontmatter comes from the metadata cache', async () => {
  const [note] = (await snapshotFromFiles(app, [file('a.md')])).notes;
  assert.equal(note.type, 'area');
  assert.deepEqual(note.tasks.map((t) => [t.state, t.text]), [['todo', 'A one'], ['done', 'A two']]);
});

test('only lines the metadata cache calls tasks become tasks, at their real line numbers', async () => {
  const [note] = (await snapshotFromFiles(app, [file('fenced.md')])).notes;
  assert.deepEqual(note.tasks.map((t) => [t.line, t.text]), [[1, 'Real task']]);
});

test('a note the cache has not indexed yet has no tasks', async () => {
  const [note] = (await snapshotFromFiles(app, [file('uncached.md')])).notes;
  assert.deepEqual(note?.tasks, []);
});

test('a note with no task items is not read: its frontmatter comes from the cache and it has no tasks', async () => {
  read.length = 0;
  const [plain, notYet] = (await snapshotFromFiles(app, [file('plain.md'), file('uncached.md')])).notes;
  assert.deepEqual(read, []);
  assert.equal(plain?.type, 'project');
  assert.deepEqual([plain?.tasks, notYet?.tasks], [[], []]);
});

test('taskLinesOnly blanks every line that is not a cache-confirmed task, keeping the indexes', () => {
  const lines = ['## Tasks', '- [ ] Real task', '```', '- [ ] example', '```'];
  assert.deepEqual(taskLinesOnly(lines, new Set([1])), ['', '- [ ] Real task', '', '', '']);
  assert.deepEqual(taskLinesOnly(lines, new Set()), ['', '', '', '', '']);
});

test("readWeekPlan: that week's plan note with every line, its frontmatter from the cache; no note gives undefined", async () => {
  const path = '08 Weeks/2026/2026-W41.md';
  const frontmatter = { type: 'week-plan', frozen: '2026-10-12' };
  const plans = {
    vault: {
      getFileByPath: (p: string) => (p === path ? file(p) : null),
      cachedRead: async () => '---\ntype: week-plan\nfrozen: 2026-10-12\n---\r\n### Done\n- Pay the water bill · Money [day:: 2026-10-08]\n',
    },
    metadataCache: { getFileCache: () => ({ frontmatter }) },
  } as unknown as App;
  // Not task lines only, as for the snapshot: the record is plain list items, so every line is kept.
  assert.deepEqual(await readWeekPlan(plans, '2026-10-05'), {
    path,
    frontmatter,
    lines: ['---', 'type: week-plan', 'frozen: 2026-10-12', '---', '### Done', '- Pay the water bill · Money [day:: 2026-10-08]', ''],
  });
  assert.equal(await readWeekPlan(plans, '2026-10-12'), undefined);   // week 42 has no plan note here
});

test('a note that cannot be read shows no tasks, and the other notes still show theirs', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const locked = {
    vault: { cachedRead: async (f: TFile) => {
      if (f.path === 'b.md') throw new Error('EBUSY: b.md');
      return CONTENT[f.path];
    } },
    metadataCache: app.metadataCache,
  } as unknown as App;
  const snapshot = await snapshotFromFiles(locked, ['a.md', 'b.md'].map(file));
  assert.deepEqual(snapshot.notes.map((n) => [n.path, n.tasks.length]), [['a.md', 2], ['b.md', 0]]);
  assert.equal(errors.mock.callCount(), 1);
});

test('a repeating note with no task lines still reads its Log section: its completed occurrences', async () => {
  const [note] = (await snapshotFromFiles(app, [file('dentist.md')])).notes;
  assert.deepEqual(note?.occurrences, [{ on: '2026-10-20', due: '2026-10-16', next: '2027-04-20', nth: 1 }]);
  assert.deepEqual(note?.tasks, []);
});
