// The Actions the views call record their writes as Brain's undo steps: one step per user action, named for what Undo does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { notices, stringifyYaml, TFile, TFolder } from '../../test/obsidian-stub.ts';
import { obsidianActions } from './actions.ts';
import { history } from './undo.ts';

const PATH = 'n.md';
const STORY = '03 Projects/Renovate the kitchen/Order cabinets.md';
const PROJECT = '03 Projects/Renovate the kitchen/Renovate the kitchen.md';
const AREA = '04 Areas/Home/Renew passport.md';

/** A vault of note texts (with frontmatter where given), as the undo and the points edit read it. */
function vault(notes: Record<string, string>, frontmatter: Record<string, Record<string, unknown>> = {}, answer?: (line: string) => string) {
  const files = [...new Set([...Object.keys(notes), ...Object.keys(frontmatter)])].map((path) => Object.assign(new TFile(), { path, extension: 'md' }));
  const app = {
    vault: {
      getFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
      getAbstractFileByPath: (path: string) => Object.assign(new TFolder(), { path, children: files.filter((f) => f.path.startsWith(path + '/') && !f.path.slice(path.length + 1).includes('/')) }),
      cachedRead: async () => '',
      read: async (file: { path: string }) => (file.path in frontmatter ? `---\n${stringifyYaml(frontmatter[file.path])}---\n` : '') + (notes[file.path] ?? ''),
      process: async (file: { path: string }, fn: (data: string) => string) => {
        notes[file.path] = fn(notes[file.path] ?? '');
      },
    },
    metadataCache: { getFileCache: (file: { path: string }) => ({ frontmatter: frontmatter[file.path], listItems: [] }) },
    fileManager: {
      processFrontMatter: async (file: { path: string }, edit: (fm: Record<string, unknown>) => void) => edit((frontmatter[file.path] ??= {})),
    },
    plugins: answer ? { plugins: { 'obsidian-tasks-plugin': { apiV1: { executeToggleTaskDoneCommand: answer } } } } : {},
  };
  return app as unknown as App;
}

const view = {} as Parameters<typeof obsidianActions>[1];
/** Lets the queued writes and undos run: an action's step is recorded once its write has landed. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const line = (raw: string) => ({ kind: 'line' as const, path: PATH, line: 0, raw });

test('ticking a task is one step, named for the untick that undoes it, and undo puts the line back', async () => {
  history.clear();
  const notes = { [PATH]: '- [ ] Pay the window cleaner\n' };
  const actions = obsidianActions(vault(notes, {}, () => '- [x] Pay the window cleaner  [completion:: 2026-10-14]'), view);
  await actions.toggle(line('- [ ] Pay the window cleaner'));
  await settle();
  assert.equal(actions.undoLabel(), 'untick “Pay the window cleaner”');
  actions.undo();
  await settle();
  assert.equal(notes[PATH], '- [ ] Pay the window cleaner\n');
  assert.equal(actions.undoLabel(), undefined);
});

test('a state change, a plan, a deadline and a points edit name what Undo puts back', async () => {
  history.clear();
  const notes = { [PATH]: '- [ ] Renew passport\n' };
  const fm = { [PROJECT]: { type: 'project', status: 'active' }, [STORY]: { type: 'task', status: 'open', points: 2 } } as Record<string, Record<string, unknown>>;
  const actions = obsidianActions(vault(notes, fm), view);
  await actions.setState(line('- [ ] Renew passport'), 'doing');
  await settle();
  assert.equal(actions.undoLabel(), 'set “Renew passport” back to To do');
  const target = { kind: 'note' as const, path: STORY, state: 'todo' as const };
  await actions.points(target, 5);
  await settle();
  assert.equal(actions.undoLabel(), 'restore the points of “Order cabinets”');
  await actions.plan(line('- [/] Renew passport'), { day: '2026-10-21' });
  await settle();
  assert.equal(actions.undoLabel(), 'restore the dates of “Renew passport”');
});

test('a project status change names the status it goes back to', async () => {
  history.clear();
  const fm = { [PROJECT]: { status: 'active' } as Record<string, unknown> };
  const actions = obsidianActions(vault({}, fm), view);
  await actions.setNoteStatus(PROJECT, 'paused');
  await settle();
  assert.equal(actions.undoLabel(), 'set “Renovate the kitchen” back to Active');
});

test('a group is one step, however many writes it makes, and it is named by the group', async () => {
  history.clear();
  const notes = { [PATH]: '- [ ] Renew passport\n' };
  const fm = { [PROJECT]: { type: 'project', status: 'active' }, [STORY]: { type: 'task', status: 'open', points: 2 } } as Record<string, Record<string, unknown>>;
  const actions = obsidianActions(vault(notes, fm), view);
  await actions.group('move “Renew passport” back', async () => {
    void actions.setState(line('- [ ] Renew passport'), 'doing');
    void actions.points({ kind: 'note', path: STORY, state: 'todo' }, 3);
  });
  await settle();
  assert.equal(actions.undoLabel(), 'move “Renew passport” back');
  actions.undo();
  await settle();
  assert.equal(notes[PATH], '- [ ] Renew passport\n');
  assert.deepEqual(fm[STORY], { type: 'task', status: 'open', points: 2 });
  assert.equal(actions.undoLabel(), undefined);
});

test('a refused write records no step: an area task has no points, and a stale line is not written', async () => {
  history.clear();
  notices.length = 0;
  const notes = { [AREA]: '- [ ] Renew passport [due:: 2026-10-18]\n' };
  const actions = obsidianActions(vault(notes, { [AREA]: { type: 'task' } }), view);
  assert.equal(await actions.points({ kind: 'note', path: AREA, state: 'todo' }, 3), null);
  await actions.plan({ kind: 'line', path: AREA, line: 0, raw: '- [ ] Renew passport [due:: 2026-10-17]' }, { day: '2026-10-21' });
  await settle();
  assert.equal(actions.undoLabel(), undefined);
});

test('a write that leaves the note as it was records no step', async () => {
  history.clear();
  const fm = { [PROJECT]: { status: 'active' } as Record<string, unknown> };
  const actions = obsidianActions(vault({}, fm), view);
  await actions.setNoteStatus(PROJECT, 'active');
  await settle();
  assert.equal(actions.undoLabel(), undefined);
});
