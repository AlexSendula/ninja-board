// A step that writes one frontmatter key twice (a status moved twice) is put back as its lines are: each write checks
// the value the write before it left, so the note's final value is the one to check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { stringifyYaml } from '../../test/obsidian-stub.ts';
import { restore, type Write } from './undo.ts';

/** A note with a frontmatter, as the vault reads it; `fm` is what the note holds now. */
function vault(notes: Record<string, { body: string; fm: Record<string, unknown> }>) {
  const app = {
    vault: {
      getFileByPath: (path: string) => (path in notes ? { path } : null),
      read: async (file: { path: string }) => `---\n${stringifyYaml(notes[file.path]!.fm)}---\n${notes[file.path]!.body}`,
      process: async () => undefined,
    },
    fileManager: {
      processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
        fn(notes[file.path]!.fm);
      },
    },
  };
  return app as unknown as App;
}

test('a status moved twice in one step is put back to where it began', async () => {
  const notes = { 'Task.md': { body: '', fm: { status: 'done' } as Record<string, unknown> } };
  const writes: Write[] = [
    { kind: 'field', path: 'Task.md', key: 'status', before: 'open', after: 'doing' },
    { kind: 'field', path: 'Task.md', key: 'status', before: 'doing', after: 'done' },
  ];
  assert.equal(await restore(vault(notes), writes), true);
  assert.deepEqual(notes['Task.md'].fm, { status: 'open' });
});

test('a key that was added and then changed in one step is removed', async () => {
  const notes = { 'Task.md': { body: '', fm: { status: 'done', done: '2026-10-15' } as Record<string, unknown> } };
  const writes: Write[] = [
    { kind: 'field', path: 'Task.md', key: 'done', before: undefined, after: '2026-10-14' },
    { kind: 'field', path: 'Task.md', key: 'done', before: '2026-10-14', after: '2026-10-15' },
  ];
  assert.equal(await restore(vault(notes), writes), true);
  assert.deepEqual(notes['Task.md'].fm, { status: 'done' });
});

test('a key changed since its last write is left alone, and the step is not put back', async () => {
  const notes = { 'Task.md': { body: '', fm: { status: 'waiting' } as Record<string, unknown> } };
  const writes: Write[] = [
    { kind: 'field', path: 'Task.md', key: 'status', before: 'open', after: 'doing' },
    { kind: 'field', path: 'Task.md', key: 'status', before: 'doing', after: 'done' },
  ];
  assert.equal(await restore(vault(notes), writes), false);
  assert.deepEqual(notes['Task.md'].fm, { status: 'waiting' });
});
