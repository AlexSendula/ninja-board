// A repeating note's plan is written to its frontmatter through the normal path: one undo step, which puts the plan back.
// The deadline stays in the file while the plan changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { stringifyYaml } from '../../test/obsidian-stub.ts';
import { datesUndoLabel } from '../model/undoLabel.ts';
import { obsidianActions } from './actions.ts';
import { history } from './undo.ts';

const PATH = '04 Areas/Health/Dentist checkup.md';

/** A vault of notes with frontmatter, as the plan's write and its undo read and write it. */
function vault(frontmatter: Record<string, Record<string, unknown>>) {
  const files = Object.keys(frontmatter).map((path) => ({ path, extension: 'md' }));
  const app = {
    vault: {
      getFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
      getMarkdownFiles: () => files,
      cachedRead: async () => '',
      read: async (file: { path: string }) => `---\n${stringifyYaml(frontmatter[file.path])}---\n`,
      process: async () => undefined,
    },
    metadataCache: { getFileCache: (file: { path: string }) => ({ frontmatter: frontmatter[file.path], listItems: [] }) },
    fileManager: {
      processFrontMatter: async (file: { path: string }, edit: (fm: Record<string, unknown>) => void) => edit(frontmatter[file.path]),
    },
    plugins: {},
  };
  return app as unknown as App;
}

const view = {} as Parameters<typeof obsidianActions>[1];
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const target = { kind: 'note' as const, path: PATH, state: 'todo' as const };

test('a repeating note planned for a day keeps its deadline; Undo takes the day away, and a second Undo restores the note', async () => {
  history.clear();
  const fm: Record<string, Record<string, unknown>> = { [PATH]: { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16' } };
  const original = { ...fm[PATH] };
  const actions = obsidianActions(vault(fm), view);
  await actions.plan(target, { day: '2026-10-14' });
  await settle();
  assert.deepEqual({ ...fm[PATH] }, { ...original, scheduled: '2026-10-14' });
  assert.equal(actions.undoLabel(), datesUndoLabel('Dentist checkup'));
  actions.undo();
  await settle();
  assert.deepEqual({ ...fm[PATH] }, original);
  assert.equal(actions.undoLabel(), undefined);
});

test('a repeating note planned for next week, then to no date: the week and then the day go, and the deadline stays', async () => {
  history.clear();
  const fm: Record<string, Record<string, unknown>> = { [PATH]: { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16', scheduled: '2026-10-14' } };
  const actions = obsidianActions(vault(fm), view);
  await actions.plan(target, { week: '2026-10-19' });
  await settle();
  assert.deepEqual({ ...fm[PATH] }, { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16', start: '2026-10-19' });
  await actions.plan(target, null);
  await settle();
  assert.deepEqual({ ...fm[PATH] }, { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16' });
  actions.undo();
  await settle();
  assert.equal(fm[PATH].start, '2026-10-19');
  actions.undo();
  await settle();
  assert.equal(fm[PATH].scheduled, '2026-10-14');
  assert.equal(fm[PATH].start, undefined);
  assert.equal(fm[PATH].due, '2026-10-16');
});

test('a repeating note planned for a day in the week after its deadline keeps the deadline in the file', async () => {
  history.clear();
  const fm: Record<string, Record<string, unknown>> = { [PATH]: { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16' } };
  const original = { ...fm[PATH] };
  const actions = obsidianActions(vault(fm), view);
  await actions.plan(target, { day: '2026-10-21' });   // Wednesday of the week after the Friday 16 October deadline
  await settle();
  assert.deepEqual({ ...fm[PATH] }, { ...original, scheduled: '2026-10-21' });
});
