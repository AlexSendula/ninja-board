// Folding stories on the Week board: the view saves the folded names in its config's `collapsed:` (the dashboard note's base block),
// keeps them for the session where the config can't, and draws the board from them.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App, BasesViewConfig, Plugin, QueryController, TFile } from 'obsidian';
import { notices } from '../../test/obsidian-stub.ts';
import '../../test/ui.ts';   // installs linkedom's document, for the view's container
import { readSample } from '../../test/sample.ts';
import { BrainView } from './view.ts';

const HOSTING = "Choose hosting for Sam's site";
const CONTRACTOR = 'Choose a contractor';
const NOTICE = 'Open the dashboard note itself to keep stories folded';

/** The sample vault as Obsidian's API shows it: files, their lines, and a metadata cache that knows the task lines. */
function sampleApp(): App {
  const notes = readSample();
  const files = new Map(notes.map((n) => [n.path, { path: n.path, extension: 'md' } as TFile]));
  const note = (f: TFile) => notes.find((n) => n.path === f.path);
  return {
    vault: { getFileByPath: () => null, cachedRead: async (f: TFile) => note(f)?.lines.join('\n') ?? '' },
    metadataCache: {
      getFileCache: (f: TFile) => ({
        frontmatter: note(f)?.frontmatter,
        listItems: (note(f)?.lines ?? []).flatMap((line, i) => /^\s*- \[.\] /.test(line) ? [{ task: line.match(/\[(.)\]/)?.[1] ?? ' ', position: { start: { line: i }, end: { line: i } }, parent: -1 }] : []),
      }),
    },
    __files: [...files.values()],
  } as unknown as App;
}

/** A Week view on a container (inside an embed when `inEmbed`), its config a plain object Bases would write to, drawing for real from the sample. */
function view(config: Record<string, unknown> = {}, opts: { persists?: boolean; inEmbed?: boolean } = {}) {
  const outer = document.createElement('div');
  if (opts.inEmbed) outer.className = 'markdown-embed';
  Object.assign(outer, { createDiv: (o?: { cls?: string }) => outer.appendChild(Object.assign(document.createElement('div'), { className: o?.cls ?? '' })) });
  const app = sampleApp();
  const brain = new BrainView({} as QueryController, outer, 'ninja-board-week', { app } as unknown as Plugin);
  const sets: [string, unknown][] = [];
  const fail = { on: opts.persists === false };   // a save that throws, while it is on
  (brain as unknown as { config: unknown }).config = {
    get: (key: string) => config[key],
    set: (key: string, value: unknown) => {
      if (fail.on) throw new Error('no config');
      sets.push([key, value]);
      config[key] = value;
    },
  } as unknown as BasesViewConfig;
  (brain as unknown as { data: unknown }).data = { data: (app as unknown as { __files: TFile[] }).__files.map((file) => ({ file })) };
  const draw = () => (brain as unknown as { render: () => Promise<void> }).render();
  const root = outer.firstElementChild as HTMLElement;
  /** The chevrons' states on the board, by story title. */
  const peeks = () => Object.fromEntries([...root.querySelectorAll('.brain-board li.brain-card')].map((li) => [li.querySelector('.brain-card-title')?.textContent, li.querySelector('.brain-peek')?.getAttribute('aria-expanded')]));
  return { brain, config, sets, fail, draw, peeks, root };
}

/** The clock stood still on the sample's day, and no timer set: a draw arms one for the strip. */
function onSampleDay(t: TestContext): void {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 13, 11, 10, 20) });
}

test('a draw reads the config\'s collapsed list: a folded story hides its lines, and the button reads Expand all once every story is folded', async (t) => {
  onSampleDay(t);
  const open = view();
  await open.draw();
  assert.deepEqual(open.peeks(), { [HOSTING]: 'true', [CONTRACTOR]: 'true' });
  assert.equal(open.root.querySelector('.brain-fold-all')?.getAttribute('aria-label'), 'Collapse all stories');

  const some = view({ collapsed: [HOSTING, 'A story that left the week', 2026, null] });
  await some.draw();
  assert.deepEqual(some.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'true' });
  assert.equal(some.root.querySelectorAll('.brain-board .brain-story-lines[hidden]').length, 1);

  const every = view({ collapsed: [HOSTING, CONTRACTOR] });
  await every.draw();
  assert.equal(every.root.querySelector('.brain-fold-all')?.getAttribute('aria-label'), 'Expand all stories');
});

test('foldStories saves the list through the config and draws the board from it at once', async (t) => {
  onSampleDay(t);
  const v = view();
  await v.draw();
  v.brain.foldStories([HOSTING], true);
  await v.draw();
  assert.deepEqual(v.sets, [['collapsed', [HOSTING]]]);
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'true' });
});

test('the saved list keeps every name it had: folding adds without repeating one, opening takes out only the names given', () => {
  const v = view({ collapsed: ['Left the week', HOSTING, 'Left the week'] });
  v.brain.foldStories([HOSTING, CONTRACTOR], true);
  assert.deepEqual(v.config.collapsed, ['Left the week', HOSTING, CONTRACTOR]);
  v.brain.foldStories([HOSTING, CONTRACTOR], false);
  assert.deepEqual(v.config.collapsed, ['Left the week']);
  v.brain.foldStories([CONTRACTOR], false);
  assert.deepEqual(v.config.collapsed, ['Left the week']);
});

test('where the config cannot be saved (an embed, a hover, a canvas) the fold lasts for the session, and a Notice says so, the first time only', async (t) => {
  onSampleDay(t);
  notices.length = 0;
  const v = view({}, { inEmbed: true });
  await v.draw();
  v.brain.foldStories([HOSTING], true);
  await v.draw();
  assert.deepEqual(v.sets, []);                                      // nothing written to the config
  assert.deepEqual(notices, [NOTICE]);
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'true' });   // but the board is drawn folded
  v.brain.foldStories([CONTRACTOR], true);
  await v.draw();
  assert.deepEqual(notices, [NOTICE]);                               // once
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'false' });
  v.brain.foldStories([HOSTING, CONTRACTOR], false);
  await v.draw();
  assert.deepEqual(v.peeks(), { [HOSTING]: 'true', [CONTRACTOR]: 'true' });
});

test('the session fold starts from what the config holds, and it wins over the config for the draws that follow', async (t) => {
  onSampleDay(t);
  notices.length = 0;
  const v = view({ collapsed: [HOSTING] }, { inEmbed: true });
  v.brain.foldStories([CONTRACTOR], true);
  await v.draw();
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'false' });
  v.brain.foldStories([HOSTING], false);
  await v.draw();
  assert.deepEqual(v.peeks(), { [HOSTING]: 'true', [CONTRACTOR]: 'false' });
  assert.deepEqual(v.config.collapsed, [HOSTING]);                   // the config was never touched
});

test('a save that throws keeps the fold for the session and says so once; a later save that works hands the fold back to the config', async (t) => {
  onSampleDay(t);
  notices.length = 0;
  const v = view({}, { persists: false });
  const error = console.error;
  console.error = () => {};
  try {
    v.brain.foldStories([HOSTING], true);
    v.brain.foldStories([CONTRACTOR], true);
  } finally {
    console.error = error;
  }
  await v.draw();
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'false' });
  assert.deepEqual(notices, ["Couldn't save the folded stories"]);

  v.fail.on = false;   // Bases saves again
  v.brain.foldStories([HOSTING], false);
  assert.deepEqual(v.config.collapsed, [CONTRACTOR]);   // the session's list, one opened, now saved
  v.config.collapsed = [HOSTING];                       // and the config is the truth again: an edit of the note shows
  await v.draw();
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'true' });
});

test('folding draws at once, as the other view choices do', () => {
  const v = view();
  let draws = 0;
  (v.brain as unknown as { render: () => Promise<void> }).render = async () => { draws++; };
  v.brain.foldStories([HOSTING], true);
  assert.equal(draws, 1);
});
