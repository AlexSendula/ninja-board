// The points edit through Brain's own actions (deviation 5): only a story takes points. A task note outside a project
// (an area's) and a repeating note in a project are refused, and their frontmatter is left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { obsidianActions } from './actions.ts';

const PROJECT = '03 Projects/Renovate the kitchen/Renovate the kitchen.md';
const STORY = '03 Projects/Renovate the kitchen/Order cabinets.md';
const REPEAT = '03 Projects/Renovate the kitchen/Check the boiler.md';
const AREA = '04 Areas/Home/Renew passport.md';

/** A vault of notes by path, with their frontmatter as the metadata cache reads it; processFrontMatter edits it in place. */
function vault(frontmatter: Record<string, Record<string, unknown>>) {
  const files = Object.keys(frontmatter).map((path) => ({ path, extension: 'md' }));
  const app = {
    vault: {
      getFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
      getMarkdownFiles: () => files,
      cachedRead: async () => '',
    },
    metadataCache: { getFileCache: (file: { path: string }) => ({ frontmatter: frontmatter[file.path], listItems: [] }) },
    fileManager: {
      processFrontMatter: async (file: { path: string }, edit: (fm: Record<string, unknown>) => void) => edit(frontmatter[file.path]),
    },
  };
  return app as unknown as App;
}

const note = (path: string) => ({ kind: 'note' as const, path, state: 'todo' as const });
const view = {} as Parameters<typeof obsidianActions>[1];   // the points edit calls none of the view's actions

test('a story takes its points, replaced and removed', async () => {
  const fm = {
    [PROJECT]: { type: 'project', status: 'active' },
    [STORY]: { type: 'task', status: 'open', points: 2 },
  };
  const actions = obsidianActions(vault(fm), view);
  assert.ok(await actions.points(note(STORY), 5));
  assert.equal(fm[STORY].points, 5);
  assert.ok(await actions.points(note(STORY), null));
  assert.equal('points' in fm[STORY], false);
});

test('an area task note is not written: its points stay out of its frontmatter', async () => {
  const fm = { [AREA]: { type: 'task', status: 'open' } };
  const actions = obsidianActions(vault(fm), view);
  assert.equal(await actions.points(note(AREA), 3), null);
  assert.deepEqual(fm[AREA], { type: 'task', status: 'open' });
});

test('a repeating task note in a project is not a story, so it is not written', async () => {
  const fm = {
    [PROJECT]: { type: 'project', status: 'active' },
    [REPEAT]: { type: 'task', status: 'open', repeat: 'every month' },
  };
  const actions = obsidianActions(vault(fm), view);
  assert.equal(await actions.points(note(REPEAT), 3), null);
  assert.equal('points' in fm[REPEAT], false);
});
