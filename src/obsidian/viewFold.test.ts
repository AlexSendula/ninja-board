// Folding stories on the Week board: the view saves the folded names in its config's `collapsed:` (the dashboard note's base block),
// keeps them for the session where the config can't, and draws the board from them. And the draws it skips: one that would draw the
// page already on screen (the echo of a fold's save is one) replaces nothing.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App, BasesViewConfig, Plugin, QueryController, TFile } from 'obsidian';
import { notices } from '../../test/obsidian-stub.ts';
import { fire, same } from '../../test/ui.ts';   // installs linkedom's document, for the view's container
import { readSample } from '../../test/sample.ts';
import { foldStory } from '../ui/card.ts';
import { BrainView, type BrainViewType } from './view.ts';
import { history } from './undo.ts';

const HOSTING = "Choose hosting for Sam's site";
const CONTRACTOR = 'Choose a contractor';
const NOTICE = 'Open the dashboard note itself to keep stories folded';

/** The sample vault as Obsidian's API shows it: files, their lines, and a metadata cache that knows the task lines. */
function sampleApp(plans = false): App {
  const notes = readSample();
  const files = new Map(notes.map((n) => [n.path, { path: n.path, extension: 'md' } as TFile]));
  const note = (f: TFile) => notes.find((n) => n.path === f.path);
  return {
    vault: { getFileByPath: (path: string) => (plans ? files.get(path) ?? null : null), cachedRead: async (f: TFile) => note(f)?.lines.join('\n') ?? '' },
    metadataCache: {
      getFileCache: (f: TFile) => ({
        frontmatter: note(f)?.frontmatter,
        listItems: (note(f)?.lines ?? []).flatMap((line, i) => /^\s*- \[.\] /.test(line) ? [{ task: line.match(/\[(.)\]/)?.[1] ?? ' ', position: { start: { line: i }, end: { line: i } }, parent: -1 }] : []),
      }),
    },
    __files: [...files.values()],
    __notes: notes,
  } as unknown as App;
}

/** A Week view on a container (inside an embed when `inEmbed`), its config a plain object Bases would write to, drawing for real from the sample. */
function view(config: Record<string, unknown> = {}, opts: { persists?: boolean; inEmbed?: boolean; kind?: BrainViewType; plans?: boolean } = {}) {
  const outer = document.createElement('div');
  if (opts.inEmbed) outer.className = 'markdown-embed';
  Object.assign(outer, { createDiv: (o?: { cls?: string }) => outer.appendChild(Object.assign(document.createElement('div'), { className: o?.cls ?? '' })) });
  const app = sampleApp(opts.plans);
  const brain = new BrainView({} as QueryController, outer, opts.kind ?? 'ninja-board-week', { app } as unknown as Plugin);
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
  const notes = (app as unknown as { __notes: { lines: string[] }[] }).__notes;
  const page = () => root.querySelector('.brain-page');
  return { brain, config, sets, fail, draw, peeks, root, notes, page };
}

/** The clock stood still on the sample's day, and no timer set: a draw arms one for the strip. */
function onSampleDay(t: TestContext): void {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 13, 11, 10, 20) });
}

/** The clock a minute on, so the next draw is from other inputs and is made: a draw from the inputs of the page on screen is skipped. */
function aMinuteOn(t: TestContext): void {
  t.mock.timers.setTime(Date.now() + 60_000);
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
  aMinuteOn(t);
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
  aMinuteOn(t);
  await v.draw();
  assert.deepEqual(v.sets, []);                                      // nothing written to the config
  assert.deepEqual(notices, [NOTICE]);
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'true' });   // but the board is drawn folded
  v.brain.foldStories([CONTRACTOR], true);
  aMinuteOn(t);
  await v.draw();
  assert.deepEqual(notices, [NOTICE]);                               // once
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'false' });
  v.brain.foldStories([HOSTING, CONTRACTOR], false);
  aMinuteOn(t);
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
  aMinuteOn(t);
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

test('folding saves and does not redraw: the card was folded in place, and a draw would only fade the chevron in again', () => {
  const v = view();
  let draws = 0;
  (v.brain as unknown as { render: () => Promise<void> }).render = async () => { draws++; };
  v.brain.foldStories([HOSTING], true);
  assert.deepEqual(v.sets, [['collapsed', [HOSTING]]]);
  assert.equal(draws, 0);
  // Nor does a fold the config cannot hold (an embed, or a save that throws): the page already shows it.
  const session = view({}, { inEmbed: true });
  (session.brain as unknown as { render: () => Promise<void> }).render = async () => { draws++; };
  session.brain.foldStories([HOSTING], true);
  const error = console.error;
  console.error = () => {};
  try {
    const failing = view({}, { persists: false });
    (failing.brain as unknown as { render: () => Promise<void> }).render = async () => { draws++; };
    failing.brain.foldStories([HOSTING], true);
  } finally {
    console.error = error;
  }
  assert.equal(draws, 0);
});

test('a click on a story\'s chevron folds the drawn page in place and saves; the page is not drawn again, and a draw later shows the same folds', async (t) => {
  onSampleDay(t);
  const v = view();
  await v.draw();
  const page = v.root.querySelector('.brain-page');
  const chevron = v.root.querySelector<HTMLElement>('.brain-board .brain-peek')!;
  const title = chevron.closest('li')!.querySelector('.brain-card-title')!.textContent!;
  fire(chevron, 'click');
  same(v.root.querySelector('.brain-page'), page, 'the page was drawn again');
  assert.deepEqual(v.sets, [['collapsed', [title]]]);
  assert.equal(chevron.getAttribute('aria-expanded'), 'false');
  const inPlace = v.peeks();
  aMinuteOn(t);
  await v.draw();   // a vault change or the clock: a draw made, from the saved list
  assert.deepEqual(v.peeks(), inPlace);
  const button = v.root.querySelector('.brain-fold-all')!;
  fire(button, 'click');   // Collapse all
  assert.deepEqual(Object.values(v.peeks()), ['false', 'false']);
  assert.equal(button.getAttribute('aria-label'), 'Expand all stories');
  assert.deepEqual(v.sets.at(-1), ['collapsed', [HOSTING, CONTRACTOR]]);
  aMinuteOn(t);
  await v.draw();
  assert.equal(v.root.querySelector('.brain-fold-all')?.getAttribute('aria-label'), 'Expand all stories');
});

test('a draw from the same inputs as the last one keeps the page: nothing is replaced', async (t) => {
  onSampleDay(t);
  const v = view();
  await v.draw();
  const page = v.page();
  assert.ok(page);
  await v.draw();
  same(v.page(), page, 'the page was drawn again');
  await v.draw();
  same(v.page(), page, 'the page was drawn again');
});

test('a draw replaces the page when anything it shows has changed: a note, the time, an arrangement, a view choice, the undo label', async (t) => {
  onSampleDay(t);
  history.clear();
  const v = view();
  await v.draw();
  const changes: [string, () => void | Promise<void>][] = [
    ['a note', () => { v.notes[0].lines.push('- [ ] A task that was not there'); }],
    ['the time', () => t.mock.timers.setTime(new Date(2026, 9, 13, 11, 11, 20).getTime())],
    ['an arrangement', () => { v.config.arrange = { todo: [HOSTING] }; }],
    ['the Waiting view', () => { v.config.waiting = 'group'; }],
    ['the Schedule view', () => { v.config.schedule = 'compact'; }],
    ['the undo label (a step in the history)', () => history.act('tick “Order cabinets”', async (writes) => { writes.push({ kind: 'lost', path: 'a.md' }); })],
  ];
  try {
    for (const [what, change] of changes) {
      const before = v.page();
      await change();
      await v.draw();
      assert.ok(v.page() !== before, `${what} changed and the page was kept`);
      const after = v.page();
      await v.draw();
      same(v.page(), after, `the draw after ${what} was drawn again`);
    }
  } finally {
    history.clear();
  }
});

test('a story card opened on a page elsewhere (card.ts keeps the list for the next draw) is an input of Backlog\'s draw, which reads it, and of no other view\'s', async (t) => {
  onSampleDay(t);
  const week = view();
  const backlog = view({}, { kind: 'ninja-board-backlog' });
  await week.draw();
  await backlog.draw();
  const [weekPage, backlogPage] = [week.page(), backlog.page()];
  const card = document.createElement('li');
  card.dataset.key = 'Home › A story';
  foldStory(card, true);
  try {
    await week.draw();
    await backlog.draw();
    same(week.page(), weekPage, 'the Week view draws no planner card: it was drawn again');
    assert.ok(backlog.page() !== backlogPage, 'the open card changed and Backlog\'s page was kept');
  } finally {
    foldStory(card, false);
  }
});

test('a fold keeps the page: the draw that echoes its save, from the same inputs and the new folds, replaces nothing', async (t) => {
  onSampleDay(t);
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const [what, opts] of [['saved in the config', {}], ['kept for the session', { inEmbed: true }], ['refused by the config', { persists: false }]] as const) {
      const v = view({}, opts);
      await v.draw();
      const page = v.page();
      fire(v.root.querySelector<HTMLElement>('.brain-board .brain-peek')!, 'click');
      const folded = v.peeks();
      await v.draw();
      same(v.page(), page, `a fold ${what}: the echo drew the page again`);
      assert.deepEqual(v.peeks(), folded);
      fire(v.root.querySelector('.brain-fold-all')!, 'click');   // Collapse all
      await v.draw();
      same(v.page(), page, `Collapse all, ${what}: the echo drew the page again`);
      fire(v.root.querySelector('.brain-fold-all')!, 'click');   // Expand all
      await v.draw();
      same(v.page(), page, `Expand all, ${what}: the echo drew the page again`);
      assert.deepEqual(Object.values(v.peeks()), ['true', 'true']);
    }
  } finally {
    console.error = quiet;
  }
});

test('a fold list changed from outside (the agent editing the base block) replaces the page, with or without a fold on the page before', async (t) => {
  onSampleDay(t);
  const v = view();
  await v.draw();
  let page = v.page();
  v.config.collapsed = [HOSTING];
  await v.draw();
  assert.ok(v.page() !== page, 'the folds changed from outside and the page was kept');
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'true' });

  page = v.page();
  fire(v.root.querySelector<HTMLElement>('.brain-board .brain-peek[aria-expanded="true"]')!, 'click');   // the Contractor story
  await v.draw();
  same(v.page(), page, 'the echo drew the page again');
  v.config.collapsed = [CONTRACTOR];   // not what the page has: the board is drawn from it
  await v.draw();
  assert.ok(v.page() !== page, 'the folds changed from outside and the page was kept');
  assert.deepEqual(v.peeks(), { [HOSTING]: 'true', [CONTRACTOR]: 'false' });
  v.config.collapsed = [HOSTING, CONTRACTOR];
  await v.draw();
  const both = v.page();
  v.config.collapsed = [CONTRACTOR, HOSTING];   // the same folds in another order are the same folds
  await v.draw();
  same(v.page(), both, 'the same folds in another order drew the page again');
});

test('a fold list changed from outside that has not been drawn yet is not taken for drawn by a click: the next draw shows both', async (t) => {
  onSampleDay(t);
  const v = view();
  await v.draw();
  const page = v.page();
  v.config.collapsed = [CONTRACTOR];   // the agent edits the base block; the draw for it has not run
  const hosting = [...v.root.querySelectorAll('.brain-board li.brain-card')].find((li) => li.querySelector('.brain-card-title')?.textContent === HOSTING)!;
  fire(hosting.querySelector<HTMLElement>('.brain-peek')!, 'click');   // the click saves [Contractor, Hosting]
  assert.deepEqual(v.config.collapsed, [CONTRACTOR, HOSTING]);
  await v.draw();
  assert.ok(v.page() !== page, 'the pending outside change was taken for drawn and the page was kept');
  assert.deepEqual(v.peeks(), { [HOSTING]: 'false', [CONTRACTOR]: 'false' });
});

test('a draw that failed leaves no record: the next draw from the inputs of the page before it draws again', async (t) => {
  onSampleDay(t);
  const v = view();
  const actions = (v.brain as unknown as { actions: { undoLabel(): string | undefined } }).actions;
  let failing = false;
  // Drawn into the empty page a draw has just made, the head asks for the label: that is the draw failing midway. The inputs are read earlier, off the old page.
  actions.undoLabel = () => {
    if (failing && v.page()?.childElementCount === 0) throw new Error('the draw failed');
    return undefined;
  };
  await v.draw();
  const good = v.page();
  const quiet = console.error;
  console.error = () => {};
  try {
    v.config.arrange = { todo: [HOSTING] };
    failing = true;
    await v.draw();
    assert.ok(v.page() !== good);
    failing = false;
    delete v.config.arrange;   // back to the inputs of `good`
    const broken = v.page();
    await v.draw();
    assert.ok(v.page() !== broken, 'the page the failed draw left was kept');
    assert.ok(v.page()?.childElementCount);
  } finally {
    console.error = quiet;
  }
});

// ---------- Every week folds, by the one list ----------

/** The view on another week: the plan notes are readable, so a past week is drawn from its record. */
function onWeek(start: string, config: Record<string, unknown> = {}, opts: { inEmbed?: boolean } = {}) {
  const v = view(config, { plans: true, ...opts });
  (v.brain as unknown as { weekStart: string }).weekStart = start;
  /** The chevrons' states of every story card on the page, by story title. */
  const cards = () => Object.fromEntries([...v.root.querySelectorAll('li.brain-card')].map((li) => [li.querySelector('.brain-card-title')?.textContent, li.querySelector('.brain-peek')?.getAttribute('aria-expanded')]));
  return { ...v, cards };
}

test('the list is one for every week: a story folded in the config is folded on this week, an upcoming week and a past week', async (t) => {
  onSampleDay(t);
  for (const start of ['2026-10-12', '2026-10-19', '2026-10-05']) {
    const v = onWeek(start, { collapsed: [HOSTING] });
    await v.draw();
    assert.equal(v.cards()[HOSTING], 'false', start);
    assert.equal(v.cards()[CONTRACTOR], 'true', start);
  }
});

test('a fold on one week is the next week\'s: folding on this week and showing another draws it folded', async (t) => {
  onSampleDay(t);
  const v = onWeek('2026-10-12');
  await v.draw();
  fire([...v.root.querySelectorAll<HTMLElement>('.brain-board li.brain-card')].find((li) => li.querySelector('.brain-card-title')?.textContent === HOSTING)!.querySelector('.brain-peek')!, 'click');
  for (const start of ['2026-10-19', '2026-10-05']) {
    (v.brain as unknown as { weekStart: string }).weekStart = start;
    await v.draw();
    assert.equal(v.cards()[HOSTING], 'false', start);
    assert.equal(v.cards()[CONTRACTOR], 'true', start);
  }
});

test('on an upcoming week and on a past week a fold keeps the page: the draw that echoes its save, and the one after Collapse all, replace nothing', async (t) => {
  onSampleDay(t);
  for (const start of ['2026-10-19', '2026-10-05']) {
    const v = onWeek(start);
    await v.draw();
    const page = v.page();
    assert.ok(page);
    const chevron = v.root.querySelector<HTMLElement>('li.brain-card .brain-peek')!;
    fire(chevron, 'click');
    assert.equal(chevron.getAttribute('aria-expanded'), 'false');
    assert.equal(v.sets.length, 1, start);
    await v.draw();
    same(v.page(), page, `${start}: the echo of a fold drew the page again`);
    const button = v.root.querySelector<HTMLElement>('.brain-fold-all')!;
    fire(button, 'click');   // Collapse all
    assert.equal(button.getAttribute('aria-label'), 'Expand all stories');
    await v.draw();
    same(v.page(), page, `${start}: the echo of Collapse all drew the page again`);
    fire(button, 'click');   // Expand all
    await v.draw();
    same(v.page(), page, `${start}: the echo of Expand all drew the page again`);
    assert.ok(Object.values(v.cards()).every((state) => state === 'true'), start);
  }
});

test('on an upcoming week and on a past week a list changed from outside redraws the page, and a draw from the same inputs keeps it', async (t) => {
  onSampleDay(t);
  for (const start of ['2026-10-19', '2026-10-05']) {
    const v = onWeek(start);
    await v.draw();
    const page = v.page();
    await v.draw();
    same(v.page(), page, `${start}: a draw from the same inputs drew the page again`);
    v.config.collapsed = [HOSTING];
    await v.draw();
    assert.ok(v.page() !== page, `${start}: the folds changed from outside and the page was kept`);
    assert.equal(v.cards()[HOSTING], 'false', start);
  }
});

test('an upcoming week drawn with the planner open keeps its folds: opening To plan is no draw and no fold', async (t) => {
  onSampleDay(t);
  const v = onWeek('2026-10-19', { collapsed: [HOSTING] });
  await v.draw();
  const page = v.page();
  fire(v.root.querySelector<HTMLElement>('.brain-plan-toggle')!, 'click');
  same(v.page(), page, 'the toggle drew the page again');
  assert.equal(v.cards()[HOSTING], 'false');
  assert.deepEqual(v.sets, []);   // planning saved nothing
  aMinuteOn(t);
  await v.draw();   // a draw made while the planner is open reads the list, and the planner stays open
  assert.equal(v.cards()[HOSTING], 'false');
  assert.equal(v.root.querySelector('.brain-plan-toggle')?.getAttribute('aria-expanded'), 'true');
});
