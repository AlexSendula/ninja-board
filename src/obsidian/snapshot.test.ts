import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App, TFile } from 'obsidian';
import { TFile as FakeFile, TFolder as FakeFolder } from '../../test/obsidian-stub.ts';
import { isStoryFile, readWeekPlan, snapshotFromFiles, taskLinesOnly } from './snapshot.ts';
import { buildSnapshot } from '../model/snapshot.ts';
import { isStoryAt } from '../model/week.ts';
import type { RawNote } from '../model/types.ts';
import { readSample } from '../../test/sample.ts';

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

// isStoryFile decides one note's story from the folders above it. isStoryAt, over the whole vault, is the answer it must give.
const note = (path: string, frontmatter?: Record<string, unknown>): RawNote => ({ path, frontmatter, lines: [] });

/** A stand-in vault of `notes`: each note as a file, and each folder above one as a folder whose children are what Obsidian's are. */
function vaultOf(notes: RawNote[]): App {
  const files = new Map(notes.map((n) => [n.path, Object.assign(new FakeFile(), { path: n.path, extension: 'md' })]));
  const folders = new Set<string>();
  for (const n of notes) {
    for (let slash = n.path.lastIndexOf('/'); slash > 0; slash = n.path.lastIndexOf('/', slash - 1)) folders.add(n.path.slice(0, slash));
  }
  const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
  function folder(path: string): FakeFolder {
    const children: FakeFolder['children'] = [
      ...[...files.values()].filter((f) => parentOf(f.path) === path),
      ...[...folders].filter((f) => parentOf(f) === path).map(folder),
    ];
    return Object.assign(new FakeFolder(), { path, children });
  }
  const frontmatter = new Map(notes.map((n) => [n.path, n.frontmatter]));
  return {
    vault: {
      getFileByPath: (path: string) => files.get(path) ?? null,
      getAbstractFileByPath: (path: string) => (folders.has(path) ? folder(path) : (files.get(path) ?? null)),
    },
    metadataCache: { getFileCache: (f: { path: string }) => ({ frontmatter: frontmatter.get(f.path) }) },
  } as unknown as App;
}

/** isStoryFile's answer for `path` in a vault of `notes`, which must be the answer isStoryAt gives over the whole vault. */
function storyAt(notes: RawNote[], path: string): boolean {
  const answer = isStoryFile(vaultOf(notes), path);
  assert.equal(answer, isStoryAt(buildSnapshot(notes), path), `${path}: isStoryAt`);
  return answer;
}

test('isStoryFile gives isStoryAt\'s answer for every note in the sample vault, which has stories and other notes', () => {
  const notes = readSample();
  const answers = notes.map((n) => storyAt(notes, n.path));
  assert.ok(answers.includes(true) && answers.includes(false), 'the sample has stories and notes that are not');
});

test('a task at any depth below a project folder is a story of that project', () => {
  const notes = [note('A/Proj/Proj.md', { type: 'project' }), note('A/Proj/Sub/Deep/task.md', { type: 'task' })];
  assert.equal(storyAt(notes, 'A/Proj/Sub/Deep/task.md'), true);
});

test('the nearest project is the one the task belongs to, and a folder with no project is passed through', () => {
  const notes = [note('A/Proj.md', { type: 'project' }), note('A/Proj/Inner/Inner.md', { type: 'project' }), note('A/Proj/Inner/Deep/task.md', { type: 'task' })];
  assert.equal(storyAt(notes, 'A/Proj/Inner/Deep/task.md'), true);
});

test('a task in a sibling folder of a project is not a story', () => {
  const notes = [note('A/Proj/Proj.md', { type: 'project' }), note('A/Other/task.md', { type: 'task' })];
  assert.equal(storyAt(notes, 'A/Other/task.md'), false);
});

test('a note in the vault root is not a story, and a project in the root owns nothing', () => {
  const notes = [note('Root project.md', { type: 'project' }), note('loose.md', { type: 'task' }), note('Folder/task.md', { type: 'task' })];
  assert.equal(storyAt(notes, 'loose.md'), false);
  assert.equal(storyAt(notes, 'Folder/task.md'), false);
});

test('a project note is not a story of its own project', () => {
  assert.equal(storyAt([note('A/Proj/Proj.md', { type: 'project' })], 'A/Proj/Proj.md'), false);
});

test('an archived project owns nothing, and the archived notes are not stories', () => {
  const notes = [note('10 Archive/Old/Old.md', { type: 'project' }), note('10 Archive/Old/task.md', { type: 'task' }), note('Old/task.md', { type: 'task' })];
  assert.equal(storyAt(notes, '10 Archive/Old/task.md'), false);
  assert.equal(storyAt(notes, 'Old/task.md'), false);
});

test('a repeating task in a project is not a story, and a task with an empty repeat is', () => {
  const notes = [note('A/Proj/Proj.md', { type: 'project' }), note('A/Proj/Monthly.md', { type: 'task', repeat: 'every month' }), note('A/Proj/Once.md', { type: 'task', repeat: '' })];
  assert.equal(storyAt(notes, 'A/Proj/Monthly.md'), false);
  assert.equal(storyAt(notes, 'A/Proj/Once.md'), true);
});

test('an area task note is not a story, and a path that is not a note is not one either', () => {
  const notes = [note('A/Area/Area.md', { type: 'area' }), note('A/Area/task.md', { type: 'task' }), note('A/Proj/Proj.md', { type: 'project' })];
  assert.equal(storyAt(notes, 'A/Area/task.md'), false);
  assert.equal(storyAt(notes, 'A/Proj/missing.md'), false);
});
