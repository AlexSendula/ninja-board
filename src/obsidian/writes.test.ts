import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { notices } from '../../test/obsidian-stub.ts';
import type { LineTarget } from './writes.ts';
import { dueLine, dueNote, now, planLine, planNote, setLineState, setNoteState, setNoteStatus, toggleNoteStatus, toggleViaTasks, today } from './writes.ts';
import type { Write } from './undo.ts';
import { nextDue } from '../model/repeat.ts';

const PATH = 'n.md';
const DENIED = "Tasks gave an answer this plugin can't use";
const target = (raw: string, line = 0): LineTarget => ({ kind: 'line', path: PATH, line, raw });

/**
 * A vault holding `notes` (path to content), and the Tasks plugin's toggle answering with `tasks`.
 * `asked` holds the lines Tasks was given; `frontmatter` the notes' frontmatter objects.
 */
function vault(notes: Record<string, string>, tasks?: (line: string) => string) {
  const frontmatter: Record<string, Record<string, unknown>> = {};
  const asked: string[] = [];
  const toggle = tasks && ((line: string) => (asked.push(line), tasks(line)));
  const app = {
    vault: {
      getFileByPath: (path: string) => (path in notes ? { path } : null),
      process: async (file: { path: string }, fn: (data: string) => string) => {
        notes[file.path] = fn(notes[file.path] ?? '');
      },
    },
    fileManager: {
      processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
        fn((frontmatter[file.path] ??= {}));
      },
    },
    plugins: { plugins: toggle ? { 'obsidian-tasks-plugin': { apiV1: { executeToggleTaskDoneCommand: toggle } } } : {} },
  };
  return { app: app as unknown as App, notes, frontmatter, asked };
}

test('toggleViaTasks gives Tasks an uppercase [X] as [x], so reopening it clears the completion date', async () => {
  const v = vault({ [PATH]: '- [X] Pick design B with Sam [completion:: 2026-10-12]\n' }, (line) =>
    line.startsWith('- [x] ') ? '- [ ] Pick design B with Sam' : '- [x] Pick design B with Sam  [completion:: 2026-10-14]');
  const written = await toggleViaTasks(v.app, target('- [X] Pick design B with Sam [completion:: 2026-10-12]'));
  assert.deepEqual(v.asked, ['- [x] Pick design B with Sam [completion:: 2026-10-12]']);
  assert.equal(v.notes[PATH], '- [ ] Pick design B with Sam\n');
  assert.equal(written?.raw, '- [ ] Pick design B with Sam');
});

test('toggleViaTasks writes the line Tasks completes, and returns the target as written', async () => {
  const sent = '- [ ] Send Sam the hosting options [due:: 2026-10-17]';
  const done = '- [x] Send Sam the hosting options  [due:: 2026-10-17]  [completion:: 2026-10-14]';
  const v = vault({ [PATH]: `${sent}\n` }, () => done);
  assert.deepEqual(await toggleViaTasks(v.app, target(sent)), { kind: 'line', path: PATH, line: 0, raw: done });
  assert.equal(v.notes[PATH], `${done}\n`);
});

test('toggleViaTasks accepts a completing answer whether or not Tasks wrote the completion date', async () => {
  for (const answer of ['- [x] Send Sam the hosting options', '- [x] Send Sam the hosting options  [completion:: 2026-10-14]']) {
    const v = vault({ [PATH]: '- [ ] Send Sam the hosting options\n' }, () => answer);
    const written = await toggleViaTasks(v.app, target('- [ ] Send Sam the hosting options'));
    assert.equal(written?.raw, answer);
    assert.equal(v.notes[PATH], `${answer}\n`);
  }
});

test('toggleViaTasks refuses an answer that does not do what the tick was for, and writes nothing', async () => {
  const cases: [string, string][] = [
    ['- [ ] Send Sam the hosting options', '- [ ] Send Sam the hosting options'],     // no change
    ['- [/] Build the homepage header', '- [ ] Build the homepage header'],          // doing, unticked to todo
    ['- [x] Pick design B with Sam [completion:: 2026-10-12]', '- [x] Pick design B with Sam [completion:: 2026-10-12]'], // reopen did nothing
  ];
  for (const [raw, answer] of cases) {
    const v = vault({ [PATH]: `${raw}\n` }, () => answer);
    notices.length = 0;
    assert.equal(await toggleViaTasks(v.app, target(raw)), null, raw);
    assert.equal(v.notes[PATH], `${raw}\n`, raw);
    assert.equal(notices.at(-1), DENIED, raw);
  }
});

test('toggleViaTasks: a recurring task writes both lines it is answered with, and returns null (no single line stands for it)', async () => {
  const water = '- [ ] Water the plants [repeat:: every week] [due:: 2026-10-13]';
  const next = '- [ ] Water the plants [repeat:: every week] [due:: 2026-10-20]';
  const done = '- [x] Water the plants [repeat:: every week] [due:: 2026-10-13] [completion:: 2026-10-13]';
  const v = vault({ [PATH]: `${water}\n` }, () => `${next}\n${done}`);
  assert.equal(await toggleViaTasks(v.app, target(water)), null);
  assert.equal(v.notes[PATH], `${next}\n${done}\n`);
});

test('a line changed since it was read is not written: the user is told, and nothing changes', async () => {
  const v = vault({ [PATH]: '- [ ] Send Sam the hosting options [due:: 2026-10-18]\n' });
  notices.length = 0;
  const stale = target('- [ ] Send Sam the hosting options [due:: 2026-10-17]');
  assert.equal(await planLine(v.app, stale, { day: '2026-10-21' }), null);
  assert.equal(await setLineState(v.app, stale, 'doing'), null);
  assert.equal(v.notes[PATH], '- [ ] Send Sam the hosting options [due:: 2026-10-18]\n');
  assert.deepEqual(notices, ['That task changed — refreshed', 'That task changed — refreshed']);
});

test('setLineState leaves a line in the state it already has: nothing is written or asked of Tasks', async () => {
  const v = vault({ [PATH]: '- [/] Build the homepage header\n' }, () => 'never');
  const same = target('- [/] Build the homepage header');
  assert.equal(await setLineState(v.app, same, 'doing'), same);
  assert.deepEqual(v.asked, []);
});

test('setLineState: drop stamps the cancelled date, and completing a dropped line gives Tasks the todo form', async () => {
  const v = vault({ [PATH]: '- [ ] Clean the gutters\n- [-] Try a page builder [cancelled:: 2026-10-11]\n' },
    () => '- [x] Try a page builder  [completion:: 2026-10-14]');
  const dropped = await setLineState(v.app, target('- [ ] Clean the gutters'), 'dropped');
  assert.equal(dropped?.raw, `- [-] Clean the gutters [cancelled:: ${today()}]`);
  const completed = await setLineState(v.app, target('- [-] Try a page builder [cancelled:: 2026-10-11]', 1), 'done');
  assert.deepEqual(v.asked, ['- [ ] Try a page builder']);
  assert.equal(completed?.raw, '- [x] Try a page builder  [completion:: 2026-10-14]');
  assert.equal(v.notes[PATH], `- [-] Clean the gutters [cancelled:: ${today()}]\n- [x] Try a page builder  [completion:: 2026-10-14]\n`);
});

test('planLine and dueLine write the line and return it as written', async () => {
  const v = vault({ [PATH]: '- [ ] Renew passport\n' });
  const planned = await planLine(v.app, target('- [ ] Renew passport'), { day: '2026-10-21' });
  assert.equal(planned?.raw, '- [ ] Renew passport [scheduled:: 2026-10-21]');
  const due = await dueLine(v.app, { ...target('- [ ] Renew passport'), raw: planned?.raw ?? '' }, '2026-10-30');
  assert.equal(due?.raw, '- [ ] Renew passport [scheduled:: 2026-10-21] [due:: 2026-10-30]');
  assert.equal(v.notes[PATH], `${due?.raw}\n`);
});

test('planNote, dueNote, setNoteStatus and toggleNoteStatus write the note frontmatter', async () => {
  const v = vault({ 'Renew.md': '' });
  await planNote(v.app, 'Renew.md', { day: '2026-10-21' });
  await dueNote(v.app, 'Renew.md', '2026-10-30');
  assert.deepEqual(v.frontmatter['Renew.md'], { scheduled: '2026-10-21', due: '2026-10-30' });
  await setNoteStatus(v.app, 'Renew.md', 'done');
  assert.deepEqual(v.frontmatter['Renew.md'], { scheduled: '2026-10-21', due: '2026-10-30', status: 'done', done: today() });
  await toggleNoteStatus(v.app, 'Renew.md', 'done');
  assert.equal(v.frontmatter['Renew.md']?.status, 'open');
  // A note that is gone is not written.
  await setNoteStatus(v.app, 'Gone.md', 'done');
  assert.equal(v.frontmatter['Gone.md'], undefined);
});

test('without the Tasks plugin a tick tells the user and writes nothing', async () => {
  const v = vault({ [PATH]: '- [ ] Renew passport\n' });
  notices.length = 0;
  assert.equal(await toggleViaTasks(v.app, target('- [ ] Renew passport')), null);
  assert.deepEqual(notices, ['Tasks must be on to tick a task']);
  assert.equal(v.notes[PATH], '- [ ] Renew passport\n');
});

test('today and now read the local clock, zero-padded, at a fixed time', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 5, 9, 7) });
  assert.deepEqual([today(), now()], ['2026-10-05', '09:07']);
});

test('today and now at the first and last minute of a year', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2027, 0, 1, 0, 0) });
  assert.deepEqual([today(), now()], ['2027-01-01', '00:00']);
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 11, 31, 23, 59) });
  assert.deepEqual([today(), now()], ['2026-12-31', '23:59']);
});

/** A vault with `notes`, whose notes' frontmatter is `frontmatter` (the fake keeps it apart from the text, as Obsidian does). */
function withFrontmatter(notes: Record<string, string>, frontmatter: Record<string, Record<string, unknown>>) {
  const v = vault(notes);
  Object.assign(v.frontmatter, frontmatter);
  return v;
}

// A repeating task note: its done is this occurrence, so it stays open with its next date and a Log line (see setNoteState).
test('a repeating note done completes its occurrence: open with the next due date, and the occurrence in its Log', async () => {
  const fm = { 'Dentist checkup.md': { status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16', scheduled: '2026-10-18' } as Record<string, unknown> };
  const notes = { 'Dentist checkup.md': '## Log\n- 2026-06-01 Done: the occurrence due 2026-04-16. Next due 2026-10-16.\n' };
  const v = withFrontmatter(notes, fm);
  const writes: Write[] = [];
  assert.equal(await setNoteState(v.app, 'Dentist checkup.md', 'done', writes), true);
  const next = nextDue({ repeat: 'every 6 months', from: 'done', missed: 'carry', due: '2026-10-16' }, today());
  assert.deepEqual(fm['Dentist checkup.md'], { status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: next });
  assert.equal(notes['Dentist checkup.md'], `## Log\n- ${today()} Done: the occurrence due 2026-10-16. Next due ${next}.\n`
    + '- 2026-06-01 Done: the occurrence due 2026-04-16. Next due 2026-10-16.\n');
  // The due date and the planned day changed (the status stayed open): two field writes, then the Log line.
  assert.deepEqual(writes.map((w) => w.kind), ['field', 'field', 'log']);
  assert.deepEqual(writes.at(-1), { kind: 'log', path: 'Dentist checkup.md', entry: `- ${today()} Done: the occurrence due 2026-10-16. Next due ${next}.`, made: false, tail: '' });
});

test('a repeating note with no Log section gets one, and undo knows it made it', async () => {
  const fm = { 'Bins.md': { status: 'open', repeat: 'every tue', repeat_from: 'due', if_missed: 'lapse', due: '2026-10-06' } as Record<string, unknown> };
  const notes = { 'Bins.md': '## Tasks\n' };
  const writes: Write[] = [];
  assert.equal(await setNoteState(withFrontmatter(notes, fm).app, 'Bins.md', 'done', writes), true);
  const last = writes.at(-1);
  assert.equal(last?.kind === 'log' && last.made, true);   // undo knows the section is Brain's
  assert.equal(notes['Bins.md'].startsWith('## Tasks\n\n## Log\n- '), true);
});

test('a state other than done on a repeating note is a status write, with no occurrence', async () => {
  const fm = { 'Dentist checkup.md': { status: 'open', repeat: 'every 6 months', due: '2026-10-16' } as Record<string, unknown> };
  const notes = { 'Dentist checkup.md': '## Tasks\n' };
  assert.equal(await setNoteState(withFrontmatter(notes, fm).app, 'Dentist checkup.md', 'doing'), true);
  assert.deepEqual(fm['Dentist checkup.md'], { status: 'doing', repeat: 'every 6 months', due: '2026-10-16' });
  assert.equal(notes['Dentist checkup.md'], '## Tasks\n');
});

test('a repeat Brain does not know is refused: nothing is written', async () => {
  const fm = { 'Odd.md': { status: 'open', repeat: 'fortnightly', due: '2026-10-16' } as Record<string, unknown> };
  const notes = { 'Odd.md': '## Tasks\n' };
  const writes: Write[] = [];
  assert.equal(await setNoteState(withFrontmatter(notes, fm).app, 'Odd.md', 'done', writes), false);
  assert.deepEqual(fm['Odd.md'], { status: 'open', repeat: 'fortnightly', due: '2026-10-16' });
  assert.equal(notes['Odd.md'], '## Tasks\n');
  assert.deepEqual(writes, []);
  assert.equal(notices.at(-1), "Can't complete this repeating note: its repeat or its due date isn't one this plugin knows");
});

test('a repeating note due on 9999-12-31 is refused, and the walk does not hang: nothing is written', async () => {
  const fm = { 'Far.md': { status: 'open', repeat: 'every day', repeat_from: 'due', if_missed: 'lapse', due: '9999-12-31' } as Record<string, unknown> };
  const notes = { 'Far.md': '## Tasks\n' };
  const writes: Write[] = [];
  assert.equal(await setNoteState(withFrontmatter(notes, fm).app, 'Far.md', 'done', writes), false);
  assert.equal(notes['Far.md'], '## Tasks\n');
  assert.deepEqual(writes, []);
  assert.equal(notices.at(-1), "Can't complete this repeating note: its repeat or its due date isn't one this plugin knows");
});

test('a repeating note with no due date is refused too: nothing is written', async () => {
  const fm = { 'Stretch.md': { status: 'open', repeat: 'every day' } as Record<string, unknown> };
  const notes = { 'Stretch.md': '## Tasks\n' };
  const writes: Write[] = [];
  assert.equal(await setNoteState(withFrontmatter(notes, fm).app, 'Stretch.md', 'done', writes), false);
  assert.deepEqual(fm['Stretch.md'], { status: 'open', repeat: 'every day' });
  assert.equal(notes['Stretch.md'], '## Tasks\n');
  assert.deepEqual(writes, []);
  assert.equal(notices.at(-1), "Can't complete this repeating note: its repeat or its due date isn't one this plugin knows");
});
