// Each write records what it replaced, so Undo can put it back: task lines, frontmatter fields, and the refusals that record nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { notices, stringifyYaml } from '../../test/obsidian-stub.ts';
import type { Write } from './undo.ts';
import { restore } from './undo.ts';
import { dueLine, dueNote, planLine, planNote, pointsNote, setLineState, setNoteState, setNoteStatus, toggleNoteStatus, toggleViaTasks, today } from './writes.ts';
import { nextDue } from '../model/repeat.ts';

const PATH = 'n.md';
const target = (raw: string, line = 0) => ({ kind: 'line' as const, path: PATH, line, raw });

/** A vault of note texts and frontmatters, and a Tasks toggle that answers with `answer`. */
function vault(notes: Record<string, string>, frontmatter: Record<string, Record<string, unknown>> = {}, answer?: (line: string) => string) {
  const app = {
    vault: {
      getFileByPath: (path: string) => (path in notes || path in frontmatter ? { path } : null),
      read: async (file: { path: string }) => (file.path in frontmatter ? `---\n${stringifyYaml(frontmatter[file.path])}---\n` : '') + (notes[file.path] ?? ''),
      process: async (file: { path: string }, fn: (data: string) => string) => {
        notes[file.path] = fn(notes[file.path] ?? '');
      },
    },
    fileManager: {
      processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
        fn((frontmatter[file.path] ??= {}));
      },
    },
    plugins: answer ? { plugins: { 'obsidian-tasks-plugin': { apiV1: { executeToggleTaskDoneCommand: answer } } } } : {},
  };
  return app as unknown as App;
}

test('ticking a task records its line, and undo puts the line back', async () => {
  const notes = { [PATH]: '- [ ] Send Sam the hosting options\n' };
  const app = vault(notes, {}, () => '- [x] Send Sam the hosting options  [completion:: 2026-10-14]');
  const writes: Write[] = [];
  await toggleViaTasks(app, target('- [ ] Send Sam the hosting options'), undefined, writes);
  assert.deepEqual(writes, [{
    kind: 'line', path: PATH, line: 0, before: '- [ ] Send Sam the hosting options',
    after: '- [x] Send Sam the hosting options  [completion:: 2026-10-14]',
  }]);
  assert.equal(await restore(app, writes), true);
  assert.equal(notes[PATH], '- [ ] Send Sam the hosting options\n');
});

test('a recurring tick records a write Undo cannot put back', async () => {
  const water = '- [ ] Water the plants [repeat:: every week] [due:: 2026-10-13]';
  const notes = { [PATH]: `${water}\n` };
  const app = vault(notes, {}, () => '- [ ] Water the plants [repeat:: every week] [due:: 2026-10-20]\n- [x] Water the plants [repeat:: every week] [due:: 2026-10-13] [completion:: 2026-10-13]');
  const writes: Write[] = [];
  await toggleViaTasks(app, target(water), undefined, writes);
  assert.deepEqual(writes, [{ kind: 'lost', path: PATH }]);
  assert.equal(await restore(app, writes), false);
});

test('a state change to doing, and a plan or a deadline, record their lines', async () => {
  const notes = { [PATH]: '- [ ] Renew passport\n' };
  const v = vault(notes);
  const writes: Write[] = [];
  const doing = await setLineState(v, target('- [ ] Renew passport'), 'doing', writes);
  const planned = await planLine(v, doing!, { day: '2026-10-21' }, writes);
  await dueLine(v, planned!, '2026-10-30', writes);
  assert.equal(writes.length, 3);
  assert.equal(await restore(v, writes), true);
  assert.equal(notes[PATH], '- [ ] Renew passport\n');
});

test('a line changed since is refused, and records nothing', async () => {
  const notes = { [PATH]: '- [ ] Send Sam the hosting options [due:: 2026-10-18]\n' };
  const writes: Write[] = [];
  notices.length = 0;
  await planLine(vault(notes), target('- [ ] Send Sam the hosting options [due:: 2026-10-17]'), { day: '2026-10-21' }, writes);
  assert.deepEqual(writes, []);
});

test('plan, deadline, status and points on a note record the fields they changed, and undo puts them back', async () => {
  const fm = { 'Renew.md': { status: 'open', type: 'task' } as Record<string, unknown> };
  const v = vault({}, fm);
  const writes: Write[] = [];
  await planNote(v, 'Renew.md', { day: '2026-10-21' }, writes);
  await dueNote(v, 'Renew.md', '2026-10-30', writes);
  await setNoteStatus(v, 'Renew.md', 'done', writes);
  assert.deepEqual(writes.map((w) => (w.kind === 'field' ? [w.key, w.before ?? null, w.after ?? null] : w.kind)), [
    ['scheduled', null, '2026-10-21'],
    ['due', null, '2026-10-30'],
    ['status', 'open', 'done'],
    ['done', null, today()],
  ]);
  assert.equal(await restore(v, writes), true);
  assert.deepEqual(fm['Renew.md'], { status: 'open', type: 'task' });
});

test('toggling a note and a points edit record their fields', async () => {
  const fm = { 'Order.md': { status: 'open', points: 2 } as Record<string, unknown> };
  const v = vault({}, fm);
  const writes: Write[] = [];
  await toggleNoteStatus(v, 'Order.md', 'todo', writes);
  await pointsNote(v, 'Order.md', 5, writes);
  assert.equal(writes.length, 3);
  assert.equal(await restore(v, writes), true);
  assert.deepEqual(fm['Order.md'], { status: 'open', points: 2 });
});

test('a note write that changes nothing records nothing', async () => {
  const fm = { 'Renew.md': { status: 'done', done: '2026-10-14' } as Record<string, unknown> };
  const writes: Write[] = [];
  await setNoteStatus(vault({}, fm), 'Renew.md', 'done', writes);
  assert.deepEqual(writes, []);
});

// A repeating note's completion: its frontmatter and its Log line are two writes of one step, and undo takes both back.
const REPEAT = 'Dentist checkup.md';
const DENTIST_TEXT = '## Tasks\n- [ ] Book it\n';

test('completing a repeating note records its fields and its Log line, and undo puts both back', async () => {
  const fm = { 'Dentist checkup.md': { status: 'waiting', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16', waiting_on: '[[Bram]]', chase: '2026-10-19' } as Record<string, unknown> };
  const notes = { [REPEAT]: DENTIST_TEXT };
  const v = vault(notes, fm);
  const writes: Write[] = [];
  assert.equal(await setNoteState(v, REPEAT, 'done', writes), true);
  const next = nextDue({ repeat: 'every 6 months', from: 'done', missed: 'carry', due: '2026-10-16' }, today());
  assert.equal(fm[REPEAT].status, 'open');
  assert.equal(fm[REPEAT].due, next);
  assert.ok(notes[REPEAT].endsWith(`\n## Log\n- ${today()} Done: the occurrence due 2026-10-16. Next due ${next}.\n`));
  assert.equal(await restore(v, writes), true);
  assert.deepEqual(fm[REPEAT], { status: 'waiting', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16', waiting_on: '[[Bram]]', chase: '2026-10-19' });
  assert.equal(notes[REPEAT], DENTIST_TEXT);
});

test('undo of a completion refuses when its Log line was edited since, and changes nothing', async () => {
  const fm = { [REPEAT]: { status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16' } as Record<string, unknown> };
  const notes = { [REPEAT]: DENTIST_TEXT };
  const v = vault(notes, fm);
  const writes: Write[] = [];
  await setNoteState(v, REPEAT, 'done', writes);
  // The Log line itself is changed: that step is not put back. (A change elsewhere in the note does not stop it.)
  notes[REPEAT] = notes[REPEAT].replace('Done: the occurrence', 'Done: a different occurrence');
  const edited = notes[REPEAT];
  assert.equal(await restore(v, writes), false);
  assert.equal(notes[REPEAT], edited);
});
