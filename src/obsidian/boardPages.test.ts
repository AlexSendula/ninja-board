// A board page, a note whose frontmatter cssclasses holds ninja-board, opens in reading view, so the page shows only the board; the note's own text is one switch away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App, Plugin, WorkspaceLeaf } from 'obsidian';
import { MarkdownView, TFile } from '../../test/obsidian-stub.ts';
import { obsidianActions } from './actions.ts';
import { leaveReadOnly, registerBoardPages } from './boardPages.ts';

const BOARD = '01 Dashboard/01 Today.md';
const WEEK = '01 Dashboard/02 Week.md';
const TASK = '03 Projects/Renovate/Order cabinets.md';
const EMBED = 'Home.md';
const PLAIN_BASE = '01 Dashboard/06 Unmarked.md';   // a dashboard note without the class
const NEW = 'Fresh.md';                               // a note Obsidian has not indexed yet

/** The frontmatter metadataCache gives for each note. A board page carries `cssclasses`; the cache holds no entry at all for NEW. */
const NOTES: Record<string, Record<string, unknown> | null> = {
  [BOARD]: { type: 'note', cssclasses: ['ninja-board'] },
  [WEEK]: { type: 'note', cssclasses: 'ninja-board' },
  [TASK]: { type: 'task' },
  [EMBED]: {},
  [PLAIN_BASE]: { type: 'note' },
  [NEW]: null,
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

type Leaf = WorkspaceLeaf & { view: MarkdownView & { file: TFile | null } };

/**
 * A workspace with the notes' frontmatter, the leaves in it and Obsidian's 'file-open' event. `looks` is every getFileCache call.
 * `config` is the vault's config (app.json): empty, as in a vault that never changed its default view, which is editing.
 * The events fire synchronously, as Obsidian's do, and the tests look at once: nothing here waits.
 */
function workspace(notes: Record<string, Record<string, unknown> | null> = NOTES) {
  const handlers: Record<string, (() => void)[]> = {};
  const leaves: Leaf[] = [];
  const looks: string[] = [];
  let active: MarkdownView | null = null;
  let layoutReady: (() => void) | undefined;
  const config: Record<string, unknown> = {};
  const app = {
    vault: {
      getConfig: (key: string) => config[key],
      getFileByPath: (path: string) => Object.assign(new TFile(), { path, extension: 'md' }),
    },
    metadataCache: {
      on: (name: string, cb: () => void) => {
        (handlers[name] ??= []).push(cb);
        return { name };
      },
      getFileCache: (file: { path: string }) => {
        looks.push(file.path);
        const frontmatter = notes[file.path];
        return frontmatter === null ? null : { frontmatter };
      },
    },
    workspace: {
      on: (name: string, cb: () => void) => {
        (handlers[name] ??= []).push(cb);
        return { name };
      },
      onLayoutReady: (cb: () => void) => { layoutReady = cb; },
      getLeavesOfType: (type: string) => (type === 'markdown' ? leaves : []),
      getActiveViewOfType: (cls: typeof MarkdownView) => (active instanceof cls ? active : null),
      getLeaf: () => leaves[0],
    },
  } as unknown as App;
  const events: unknown[] = [];
  registerBoardPages({ app, registerEvent: (ref: unknown) => events.push(ref) } as unknown as Plugin);
  return {
    app, leaves, looks, events, config, notes,
    /** A leaf that shows `path`, in `mode`: as it is after the layout is restored, before any file-open. */
    leaf(path: string | null, mode = 'source'): Leaf {
      const view = Object.assign(new MarkdownView(), { file: path === null ? null : Object.assign(new TFile(), { path }), mode });
      const leaf = { view } as unknown as Leaf;
      view.leaf = leaf;
      leaves.push(leaf);
      return leaf;
    },
    /** The leaf opens `path` (or the user switches to its tab, when that is the file it shows): Obsidian's 'file-open'. */
    open(leaf: Leaf, path: string): void {
      leaf.view.file = Object.assign(new TFile(), { path });
      active = leaf.view;
      handlers['file-open']?.forEach((cb) => cb());
    },
    layoutReady(): void {
      layoutReady?.();
    },
    /** Obsidian's metadataCache 'changed': a note has been indexed (or edited), and its cache is there now. */
    changed(): void {
      handlers['changed']?.forEach((cb) => cb());
    },
    /** Obsidian's 'file-open' with no note view active: every tab closed, say. */
    openNothing(): void {
      active = null;
      handlers['file-open']?.forEach((cb) => cb());
    },
  };
}

test('a board page opened in source mode is switched to reading view inside the file-open handler, with no history entry, and the leaf is remembered', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);   // no await: the switch was asked for before the event returned
  assert.equal(leaf.view.mode, 'preview');
  assert.deepEqual(leaf.view.setStates.map((s) => [s.state.mode, s.result]), [['preview', { history: false }]]);
  assert.equal(leaveReadOnly(leaf), true);
  assert.equal(leaveReadOnly(leaf), false, 'forgotten once left');
});

test('the switch keeps the rest of the view\'s state', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  assert.deepEqual(leaf.view.setStates[0]!.state, { file: BOARD, mode: 'preview', source: false });
});

test('the page is known from the metadata cache, not from a read of the note', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  assert.deepEqual(ws.looks, [BOARD]);
  assert.equal(leaf.view.mode, 'preview');
});

test('a cssclasses string, not only a list, makes a board page', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, WEEK);   // cssclasses: ninja-board
  assert.equal(leaf.view.mode, 'preview');
});

test('a tab switch, the same path again, does nothing: a board page the user switched to editing stays in editing', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  leaf.view.mode = 'source';   // Cmd/Ctrl+E
  ws.open(leaf, BOARD);
  ws.open(leaf, BOARD);
  assert.equal(leaf.view.mode, 'source');
  assert.equal(leaf.view.setStates.length, 1);
  assert.deepEqual(ws.looks, [BOARD], 'the note was looked up once');
});

test('a board page opened again after another note is read-only again, even from editing', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  leaf.view.mode = 'source';
  ws.open(leaf, TASK);
  ws.open(leaf, BOARD);
  assert.equal(leaf.view.mode, 'preview');
});

test('another note in a remembered leaf goes back to source, and the leaf is forgotten', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);   // reading view
  ws.open(leaf, TASK);    // the leaf keeps its mode, so the task note arrives in reading view
  assert.equal(leaf.view.mode, 'source');
  assert.deepEqual(leaf.view.setStates.map((s) => [s.state.mode, s.result]), [['preview', { history: false }], ['source', { history: false }]]);
  assert.equal(leaveReadOnly(leaf), false);
});

test('another note a remembered leaf has switched to editing already is left in editing', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  leaf.view.mode = 'source';
  ws.open(leaf, TASK);
  assert.equal(leaf.view.setStates.length, 1);
  assert.equal(leaf.view.mode, 'source');
  assert.equal(leaveReadOnly(leaf), false);
});

test('a board page opened over a board page stays in reading view without a flash of source, and stays remembered', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  ws.open(leaf, WEEK);
  assert.deepEqual(leaf.view.setStates.map((s) => s.state.mode), ['preview']);
  assert.equal(leaveReadOnly(leaf), true);
});

test('with reading as the default view, a board page already in reading view is untouched and not remembered, and a note opened after it is untouched too', () => {
  const ws = workspace();
  ws.config.defaultViewMode = 'preview';
  const leaf = ws.leaf(null, 'preview');
  ws.open(leaf, BOARD);
  assert.equal(leaf.view.setStates.length, 0);
  assert.equal(leaveReadOnly(leaf), false);
  ws.open(leaf, TASK);
  assert.equal(leaf.view.setStates.length, 0);
  assert.equal(leaf.view.mode, 'preview');
});

test('a note that only embeds a dashboard, a plain note and a dashboard note without the class keep editing', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, EMBED);
  ws.open(leaf, TASK);
  ws.open(leaf, PLAIN_BASE);
  assert.equal(leaf.view.setStates.length, 0);
  assert.equal(leaf.view.mode, 'source');
});

test('a note Obsidian has not indexed yet is no board page: it is left as it is', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, NEW);
  assert.equal(leaf.view.setStates.length, 0);
  assert.equal(leaveReadOnly(leaf), false);
});

test('a note that was not indexed yet is looked at again on the next file-open, a tab switch included', () => {
  const ws = workspace({ ...NOTES });
  const leaf = ws.leaf(null);
  ws.open(leaf, NEW);
  ws.notes[NEW] = { type: 'note', cssclasses: ['ninja-board'] };   // the index caught up
  ws.open(leaf, NEW);
  assert.equal(leaf.view.mode, 'preview');
  assert.deepEqual(ws.looks, [NEW, NEW]);
  assert.equal(leaveReadOnly(leaf), true);
});

test('a note that is indexed after it opened is checked when its cache arrives: a freshly set-up vault still indexing at the start page', () => {
  const ws = workspace({ ...NOTES });
  const leaf = ws.leaf(NEW);
  ws.layoutReady();   // the start page is open and the cache has no entry for it yet
  assert.equal(leaf.view.setStates.length, 0);
  ws.notes[NEW] = { type: 'note', cssclasses: ['ninja-board'] };
  ws.changed();
  assert.equal(leaf.view.mode, 'preview');
  assert.equal(leaveReadOnly(leaf), true);
});

test('a note whose cache arrived and is no board page is checked once, and the cache changing again does nothing', () => {
  const ws = workspace({ ...NOTES });
  const leaf = ws.leaf(NEW);
  ws.layoutReady();
  ws.notes[NEW] = { type: 'note' };
  ws.changed();
  ws.changed();
  assert.equal(leaf.view.setStates.length, 0);
  assert.deepEqual(ws.looks, [NEW, NEW], 'one look before the cache, one after, none for the second change');
});

test('the cache changing for a note already checked does nothing: a board page switched to editing stays so while the user types', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  leaf.view.mode = 'source';   // Cmd/Ctrl+E
  ws.changed();
  ws.changed();
  assert.equal(leaf.view.mode, 'source');
  assert.equal(leaf.view.setStates.length, 1);
  assert.deepEqual(ws.looks, [BOARD]);
});

test('the layout-ready pass handles each note leaf, and skips a leaf whose view is not loaded', () => {
  const ws = workspace();
  const a = ws.leaf(BOARD);
  const b = ws.leaf(WEEK, 'preview');
  const c = ws.leaf(TASK);
  const d = ws.leaf(EMBED);
  const empty = ws.leaf(null);
  const deferred = { view: {} } as unknown as Leaf;   // a tab Obsidian has not loaded yet
  ws.leaves.push(deferred);
  ws.layoutReady();
  assert.deepEqual([a, b, c, d, empty].map((l) => l.view.setStates.length), [1, 0, 0, 0, 0]);
  assert.equal(a.view.mode, 'preview');
  assert.deepEqual([leaveReadOnly(a), leaveReadOnly(b)], [true, true], 'b was restored in reading view, which the default (editing) does not explain');
  assert.deepEqual(ws.looks.sort(), [BOARD, EMBED, TASK, WEEK].sort());
});

test('a board page restored in reading view, with editing as the default, is not switched but is remembered', () => {
  const ws = workspace();
  const leaf = ws.leaf(BOARD, 'preview');   // workspace.json brings a tab back in the mode Ninja Board gave it
  ws.layoutReady();
  assert.equal(leaf.view.setStates.length, 0);
  assert.equal(leaveReadOnly(leaf), true);
});

test('a board page restored in reading view, with reading as the default, is left alone and not remembered', () => {
  const ws = workspace();
  ws.config.defaultViewMode = 'preview';
  const leaf = ws.leaf(BOARD, 'preview');
  ws.layoutReady();
  assert.equal(leaf.view.setStates.length, 0);
  assert.equal(leaveReadOnly(leaf), false);
});

test('without the vault config API, the default view is taken to be editing', () => {
  const ws = workspace();
  (ws.app.vault as unknown as { getConfig?: unknown }).getConfig = undefined;
  const leaf = ws.leaf(BOARD, 'preview');
  ws.layoutReady();
  assert.equal(leaveReadOnly(leaf), true);
});

test('Back to a board page in reading view, with editing as the default, remembers the leaf', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  ws.open(leaf, TASK);
  leaf.view.mode = 'preview';   // Back: the history entry of the board page brings its mode with it
  ws.open(leaf, BOARD);
  assert.deepEqual(leaf.view.setStates.map((s) => s.state.mode), ['preview', 'source'], 'no switch on Back');
  assert.equal(leaveReadOnly(leaf), true);
});

test('another note in a leaf remembered from reading view goes back to source', () => {
  const ws = workspace();
  const leaf = ws.leaf(BOARD, 'preview');
  ws.layoutReady();
  ws.open(leaf, TASK);   // the leaf keeps its mode
  assert.equal(leaf.view.mode, 'source');
  assert.equal(leaveReadOnly(leaf), false);
});

test('a board page shown again after a view that is no note is checked afresh', () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);   // reading view
  (leaf as unknown as { view: unknown }).view = {};   // the tab shows a PDF, say
  ws.openNothing();
  const fresh = Object.assign(new MarkdownView(), { leaf });   // the board page opens again: Obsidian builds a new note view, in source mode
  (leaf as unknown as { view: unknown }).view = fresh;
  ws.open(leaf, BOARD);
  assert.equal(fresh.mode, 'preview');
  assert.deepEqual(ws.looks, [BOARD, BOARD]);
});

test('a tab switch after the layout-ready pass is not an open', () => {
  const ws = workspace();
  const leaf = ws.leaf(BOARD);
  ws.layoutReady();
  leaf.view.mode = 'source';
  ws.open(leaf, BOARD);
  assert.equal(leaf.view.mode, 'source');
  assert.deepEqual(ws.looks, [BOARD]);
});

test('a leaf that throws in the layout-ready pass is logged, and does not stop the leaves after it', async () => {
  const ws = workspace();
  const bad = ws.leaf(TASK);
  bad.view.getMode = () => { throw new Error('boom'); };
  const board = ws.leaf(BOARD);
  const out = await logged(() => ws.layoutReady());   // the pass runs inside onload when the plugin is enabled after startup: a throw would abort it
  assert.equal((out[0] as Error).message, 'boom');
  assert.equal(out.length, 1);
  assert.equal(board.view.mode, 'preview');
});

test('a file-open with no note view active does nothing', () => {
  const ws = workspace();
  const leaf = ws.leaf(BOARD);
  ws.openNothing();
  assert.equal(leaf.view.setStates.length, 0);
  assert.deepEqual(ws.looks, []);
});

/** Runs `fn` with console.error collected: a failed switch is logged, and the test then reads what was logged. */
async function logged(fn: () => void): Promise<unknown[]> {
  const out: unknown[] = [];
  const real = console.error;
  console.error = (...args: unknown[]) => { out.push(args[0]); };
  try {
    fn();
    await settle();
  } finally {
    console.error = real;
  }
  return out;
}

test('a switch that fails is logged, and does not escape the handler as an unhandled rejection', async () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  leaf.view.setState = async () => { throw new Error('cannot switch'); };
  const out = await logged(() => ws.open(leaf, BOARD));
  assert.equal((out[0] as Error).message, 'cannot switch');
});

test('a switch back to source that fails is logged too', async () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  leaf.view.setState = async () => { throw new Error('cannot switch back'); };
  const out = await logged(() => ws.open(leaf, TASK));
  assert.equal((out[0] as Error).message, 'cannot switch back');
});

test('the plugin listens to file-open and the cache\'s changed through registerEvent, so both are released on unload', () => {
  const ws = workspace();
  assert.deepEqual(ws.events, [{ name: 'file-open' }, { name: 'changed' }]);
});

/** The leaf the actions open a note in: it records the openFile calls and the cursor it is given. */
function openingFrom(ws: ReturnType<typeof workspace>, leaf: Leaf) {
  const calls: { path: string; options: unknown }[] = [];
  const cursors: unknown[] = [];
  Object.assign(leaf, {
    openFile: async (file: { path: string }, options: unknown) => { calls.push({ path: file.path, options }); },
  });
  Object.assign(leaf.view, { editor: { setCursor: (pos: unknown) => cursors.push(pos), scrollIntoView: () => {} } });
  const actions = obsidianActions(ws.app, {} as Parameters<typeof obsidianActions>[1]);
  return { calls, cursors, open: async (path: string, line?: number) => { actions.open(path, line); await settle(); } };
}

test('a note opened from a remembered leaf opens for editing at once, and the leaf is forgotten', async () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  const { calls, cursors, open } = openingFrom(ws, leaf);
  await open(TASK, 4);
  assert.deepEqual(calls, [{ path: TASK, options: { active: true, state: { mode: 'source' } } }]);
  assert.deepEqual(cursors, [{ line: 4, ch: 0 }]);
  assert.equal(leaveReadOnly(leaf), false);
});

test('a note opened from a board page restored in reading view opens for editing at once', async () => {
  const ws = workspace();
  const leaf = ws.leaf(BOARD, 'preview');
  ws.layoutReady();
  const { calls, cursors, open } = openingFrom(ws, leaf);
  await open(TASK, 4);
  assert.deepEqual(calls, [{ path: TASK, options: { active: true, state: { mode: 'source' } } }]);
  assert.deepEqual(cursors, [{ line: 4, ch: 0 }]);
});

test('a board page opened from a remembered leaf passes no mode: it stays in reading view, and the leaf is forgotten for check to re-add', async () => {
  const ws = workspace();
  const leaf = ws.leaf(null);
  ws.open(leaf, BOARD);
  const { calls, open } = openingFrom(ws, leaf);
  await open(WEEK);
  assert.deepEqual(calls, [{ path: WEEK, options: { active: true } }]);
  assert.equal(leaveReadOnly(leaf), false);
});

test('a note opened from any other leaf passes no mode', async () => {
  const ws = workspace();
  ws.config.defaultViewMode = 'preview';
  const leaf = ws.leaf(null, 'preview');   // a board page in the user\'s own reading view: not remembered
  ws.open(leaf, BOARD);
  const { calls, open } = openingFrom(ws, leaf);
  await open(TASK);
  assert.deepEqual(calls, [{ path: TASK, options: { active: true } }]);
});
