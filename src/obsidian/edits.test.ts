import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../../test/ui.ts';   // installs linkedom's document, for arrangementPersists
import { arrangementPersists, isUsableToggle, lineWithDue, lineWithPlan, lineWithState, readTasksSetup, replaceLineIfUnchanged, tasksApi } from './edits.ts';
import { BRACKET_VALUE } from '../model/taskLine.ts';

// The sample's Website for Sam note: frontmatter on lines 0-6, "## Tasks" on line 8, task lines on 9-14.
const SITE = readFileSync(new URL('../../sample-vault/03 Projects/Website for Sam/Website for Sam.md', import.meta.url), 'utf8');
const SEND = '- [ ] Send Sam the hosting options [due:: 2026-10-17]';
const SENT = '- [x] Send Sam the hosting options [due:: 2026-10-17] [completion:: 2026-10-13]';
const TODAY = '2026-10-13';

test('replaces the line when it is still what was read', () => {
  assert.equal(SITE.split('\n')[11], SEND);
  assert.equal(replaceLineIfUnchanged(SITE, 11, SEND, SENT), SITE.replace(SEND, SENT));
});

test('returns null when the line changed since it was read', () => {
  const edited = SITE.replace(SEND, '- [ ] Send Sam the hosting options [due:: 2026-10-18]');
  assert.equal(replaceLineIfUnchanged(edited, 11, SEND, SENT), null);
  // A line added above moves the task down, so line 11 now holds "Build the homepage header".
  const added = SITE.replace('## Tasks\n', '## Tasks\n- [ ] Call Sam\n');
  assert.equal(replaceLineIfUnchanged(added, 11, SEND, SENT), null);
});

test('returns null for a line number outside the file', () => {
  // The note has 15 lines and ends with a newline, so split gives 16 parts: 0 to 15.
  assert.equal(replaceLineIfUnchanged(SITE, 16, SEND, SENT), null);
  assert.equal(replaceLineIfUnchanged(SITE, -1, SEND, SENT), null);
});

test('keeps CRLF line endings', () => {
  const crlf = SITE.replaceAll('\n', '\r\n');
  assert.equal(replaceLineIfUnchanged(crlf, 11, SEND, SENT), crlf.replace(SEND, SENT));
});

test('a two-line replacement (a Tasks recurrence) is joined with the file\'s line ending', () => {
  const water = '- [ ] Water the plants [repeat:: every week] [due:: 2026-10-13]';
  const next = '- [ ] Water the plants [repeat:: every week] [due:: 2026-10-20]';
  const done = '- [x] Water the plants [repeat:: every week] [due:: 2026-10-13] [completion:: 2026-10-13]';
  const fromTasks = `${next}\n${done}`;
  assert.equal(replaceLineIfUnchanged(`## Tasks\n${water}\n`, 1, water, fromTasks), `## Tasks\n${next}\n${done}\n`);
  assert.equal(replaceLineIfUnchanged(`## Tasks\r\n${water}\r\n`, 1, water, fromTasks), `## Tasks\r\n${next}\r\n${done}\r\n`);
  // The last line of a CRLF file has no ending of its own; the two lines still get CRLF between them.
  assert.equal(replaceLineIfUnchanged(`## Tasks\r\n${water}`, 1, water, fromTasks), `## Tasks\r\n${next}\r\n${done}`);
});

test('lineWithState sets the checkbox and keeps the other fields', () => {
  assert.equal(lineWithState(SEND, 'doing', TODAY), '- [/] Send Sam the hosting options [due:: 2026-10-17]');
  assert.equal(
    lineWithState('- [/] Build the homepage header [scheduled:: 2026-10-13]', 'waiting', TODAY),
    '- [w] Build the homepage header [scheduled:: 2026-10-13]',
  );
});

test('lineWithState clears the completion and cancelled dates of a reopened line', () => {
  assert.equal(lineWithState('- [x] Pick design B with Sam [completion:: 2026-10-12]', 'todo', TODAY), '- [ ] Pick design B with Sam');
  assert.equal(lineWithState('- [-] Try a page builder [cancelled:: 2026-10-11]', 'doing', TODAY), '- [/] Try a page builder');
  assert.equal(
    lineWithState('- [x] Get three quotes (completion:: 2026-10-09) from contractors ^q3', 'todo', TODAY),
    '- [ ] Get three quotes from contractors ^q3',
  );
});

test('lineWithDue takes the spaces before a field with it, and keeps a block id last', () => {
  assert.equal(lineWithDue('- [ ] a   [due:: 2026-10-17]   ^b7k2', null), '- [ ] a   ^b7k2');
});

test('lineWithDue, lineWithPlan and lineWithState edit a 40 KB run of spaces or of field openers in linear time', () => {
  const spaces = `- [ ] a${' '.repeat(40000)}x`;
  const openers = `- [x] ${'[completion:: '.repeat(5800)}`;
  const edits: [string, () => string, string][] = [
    ['lineWithDue, a date', () => lineWithDue(spaces, '2026-10-15'), `${spaces} [due:: 2026-10-15]`],
    ['lineWithDue, no date', () => lineWithDue(spaces, null), spaces],
    ['lineWithPlan, no date', () => lineWithPlan(spaces, null, TODAY), spaces],
    ['lineWithState, a run of completion openers', () => lineWithState(openers, 'todo', TODAY), openers.replace('- [x]', '- [ ]')],
  ];
  for (const [name, edit, expected] of edits) {
    const started = performance.now();
    assert.equal(edit(), expected);
    assert.ok(performance.now() - started < 200, `${name} took too long`);
  }
});

test('lineWithState stamps a dropped line with today', () => {
  assert.equal(
    lineWithState('- [ ] Clean the gutters [scheduled:: 2026-10-15]', 'dropped', TODAY),
    '- [-] Clean the gutters [scheduled:: 2026-10-15] [cancelled:: 2026-10-13]',
  );
  assert.equal(
    lineWithState('- [x] Replace the smoke alarm battery [completion:: 2026-10-12]', 'dropped', TODAY),
    '- [-] Replace the smoke alarm battery [cancelled:: 2026-10-13]',
  );
});

test('tasksApi finds the API only while the Tasks plugin is loaded', () => {
  const api = { executeToggleTaskDoneCommand: (line: string) => line };
  assert.equal(tasksApi({ plugins: { plugins: { 'obsidian-tasks-plugin': { apiV1: api } } } }), api);
  // Obsidian keeps only enabled plugins in app.plugins.plugins, so missing and disabled look the same.
  assert.equal(tasksApi({ plugins: { plugins: {} } }), undefined);
  assert.equal(tasksApi({ plugins: { plugins: { 'obsidian-tasks-plugin': {} } } }), undefined);
  assert.equal(tasksApi({}), undefined);
  // An old Tasks without the toggle command is as good as missing.
  assert.equal(tasksApi({ plugins: { plugins: { 'obsidian-tasks-plugin': { apiV1: {} } } } }), undefined);
});

test('isUsableToggle accepts only whole task lines from Tasks', () => {
  const path = 'n.md';
  assert.equal(isUsableToggle(SENT, path, 11), true);
  assert.equal(isUsableToggle(`${SEND}\n${SENT}`, path, 11), true);
  assert.equal(isUsableToggle(`${SEND}\r\n${SENT}`, path, 11), true);
  // Anything else would blank or garble the line it replaces.
  assert.equal(isUsableToggle('', path, 11), false);
  assert.equal(isUsableToggle('\n', path, 11), false);
  assert.equal(isUsableToggle(undefined, path, 11), false);
  assert.equal(isUsableToggle(42, path, 11), false);
  assert.equal(isUsableToggle('Send Sam the hosting options', path, 11), false);
  assert.equal(isUsableToggle(`${SENT}\nnot a task`, path, 11), false);
  assert.equal(isUsableToggle(`${SENT}\n`, path, 11), false);
});

test('lineWithPlan and lineWithDue leave a line that is not a task as it is', () => {
  for (const raw of ['## Tasks', '- Clean the gutters', 'Clean the gutters [scheduled:: 2026-10-15]', '- [link](x)', '']) {
    for (const to of [{ day: '2026-10-21' }, { week: '2026-10-19' }, null] as const) {
      assert.equal(lineWithPlan(raw, to, '2026-10-14'), raw, JSON.stringify(raw));
    }
    assert.equal(lineWithDue(raw, '2026-10-21'), raw, JSON.stringify(raw));
    assert.equal(lineWithDue(raw, null), raw, JSON.stringify(raw));
  }
});

test('lineWithPlan(raw, null) and lineWithDue(raw, null) leave a task that has neither field as it is', () => {
  assert.equal(lineWithPlan('- [ ] Clean the gutters ^b7k2', null, '2026-10-14'), '- [ ] Clean the gutters ^b7k2');
  assert.equal(lineWithDue('- [ ] Clean the gutters', null), '- [ ] Clean the gutters');
});

test('arrangementPersists: only where Bases can write the base block back into the note', () => {
  document.body.innerHTML = `
    <div class="markdown-preview-view"><div class="block-language-base"><div id="reading"></div></div></div>
    <div class="cm-embed-block cm-lang-base"><div id="live"></div></div>
    <div class="internal-embed markdown-embed"><div class="markdown-embed-content"><div id="embed"></div></div></div>
    <div class="popover hover-popover"><div class="markdown-preview-view"><div id="hover"></div></div></div>
    <div class="canvas-node"><div class="canvas-node-content"><div id="canvas"></div></div></div>`;
  const at = (id: string) => document.getElementById(id) ?? assert.fail(`no #${id}`);
  assert.equal(arrangementPersists(at('reading')), true);
  assert.equal(arrangementPersists(at('live')), true);
  // An embed, a hover and a canvas node render the block without a section to write back to.
  assert.equal(arrangementPersists(at('embed')), false);
  assert.equal(arrangementPersists(at('hover')), false);
  assert.equal(arrangementPersists(at('canvas')), false);
});

test("readTasksSetup: Tasks off, its saved settings, never saved, or settings it can't read", async () => {
  const withTasks = (tasks: object) => ({ plugins: { plugins: { 'obsidian-tasks-plugin': tasks } } });
  const saved = { taskFormat: 'dataview', statusSettings: { customStatuses: [] } };
  // loadData is called on the plugin, as Obsidian's Plugin.loadData expects.
  const tasks = { saved, loadData() { return Promise.resolve(this.saved); } };
  assert.deepEqual(await readTasksSetup(withTasks(tasks)), { on: true, settings: saved });
  // A fresh install has no data.json yet: Tasks' defaults apply.
  assert.deepEqual(await readTasksSetup(withTasks({ loadData: async () => null })), { on: true, settings: null });
  // Settings Brain can't read: rejected, thrown, or no loadData at all.
  assert.deepEqual(await readTasksSetup(withTasks({ loadData: () => Promise.reject(new Error('EACCES')) })), { on: true });
  assert.deepEqual(await readTasksSetup(withTasks({ loadData: () => { throw new Error('EACCES'); } })), { on: true });
  assert.deepEqual(await readTasksSetup(withTasks({ apiV1: {} })), { on: true });
});

test("readTasksSetup: Tasks enabled but not loaded yet (the Guide at launch) is 'can't check', not off", async () => {
  const enabled = (ids: string[], loaded: object = {}) => ({ plugins: { enabledPlugins: new Set(ids), plugins: loaded } });
  assert.deepEqual(await readTasksSetup(enabled(['obsidian-tasks-plugin'])), { on: true });
  // Enabled and loaded: its settings are read as before.
  assert.deepEqual(
    await readTasksSetup(enabled(['obsidian-tasks-plugin'], { 'obsidian-tasks-plugin': { loadData: async () => null } })),
    { on: true, settings: null },
  );
  // Another plugin enabled, Tasks not: off.
  assert.deepEqual(await readTasksSetup(enabled(['dataview'])), { on: false });
});

test('a run of spaces before a field goes with it, once, and the spaces after a kept field stay', () => {
  assert.equal(lineWithDue('- [ ] a [due:: 2026-10-17] b  [due:: 2026-10-18] c', null), '- [ ] a b c');
  assert.equal(lineWithDue('- [ ] a      [due:: 2026-10-17]', null), '- [ ] a');
  // A field with no space before it, and a field at the very start of the text, are removed the same way.
  assert.equal(lineWithDue('- [ ] a[due:: 2026-10-17]', null), '- [ ] a');
  assert.equal(lineWithState('- [x] a   (completion:: 2026-10-09)   [cancelled:: 2026-10-11] b', 'todo', TODAY), '- [ ] a b');
  // A scheduled field the due date does not match is kept, with the spaces before it.
  assert.equal(lineWithDue('- [ ] a [scheduled:: 2026-10-13]   [due:: 2026-10-20]', '2026-10-20'), '- [ ] a [scheduled:: 2026-10-13]   [due:: 2026-10-20]');
});

test('the field edits remove exactly what the lookbehind form they replaced removed, over generated lines', () => {
  // The lookbehind form (Node has one; iOS before 16.4 does not): a run of spaces read once, from its first space.
  const dueOld = new RegExp(`(?<!\\s)\\s*(?:\\[due::${BRACKET_VALUE}\\]|\\(due::[^)(]*\\))`, 'g');
  const doneOld = new RegExp(`(?<!\\s)\\s*(?:\\[(?:completion|cancelled)::${BRACKET_VALUE}\\]|\\((?:completion|cancelled)::[^)(]*\\))`, 'g');
  const parts = ['a', ' ', '  ', '\t', '[due:: 2026-10-17]', '(due:: 2026-10-17)', '[due:: x]', ' [completion:: 2026-10-13]', '[cancelled:: 2026-10-11]',
    '(completion:: 2026-10-12)', '[[Note]]', '[', ']', '(', ')', '^b7k2', ' - ', '[scheduled:: 2026-10-13]'];
  let seed = 7;
  const pick = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  for (let i = 0; i < 3000; i++) {
    let text = '- [ ] ';
    for (let j = 1 + pick(10); j > 0; j--) text += parts[pick(parts.length)];
    assert.equal(lineWithDue(text, null), text.replace(dueOld, ''), JSON.stringify(text));
    assert.equal(lineWithState(text, 'todo', TODAY), text.replace(doneOld, ''), JSON.stringify(text));
  }
});

test("readTasksSetup: a plugin list that can't be read, or that isn't a list of ids, gives no answer about Tasks (Can't check)", async () => {
  const unreadable = { get plugins(): never { throw new Error('gone'); } };
  assert.deepEqual(await readTasksSetup(unreadable), {});
  // No plugin list, or a loaded list with no enabledPlugins beside it: nothing says whether Tasks is on.
  assert.deepEqual(await readTasksSetup({}), {});
  assert.deepEqual(await readTasksSetup({ plugins: { plugins: {} } }), {});
  // Enabled plugins as something without has(): the check is refused, not thrown into the Guide's draw.
  assert.deepEqual(await readTasksSetup({ plugins: { enabledPlugins: ['obsidian-tasks-plugin'], plugins: {} } }), {});
  // A loaded entry that is not a plugin: no loadData, so Tasks is on and its settings are unknown.
  assert.deepEqual(await readTasksSetup({ plugins: { plugins: { 'obsidian-tasks-plugin': 'on' } } }), { on: true });
});
