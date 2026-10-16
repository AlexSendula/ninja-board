import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildSnapshot } from '../src/model/snapshot.ts';
import { buildToday } from '../src/model/today.ts';
import { buildProjects } from '../src/model/projects.ts';
import { parseWeekRecord, weekPlanPath } from '../src/model/record.ts';
import { memoryWrites } from '../preview/memoryWrites.ts';
import { tokensOf } from '../preview/tokens.ts';
import { loadSample, readSample, readSampleWithoutPoints } from './sample.ts';
import type { RawNote, RowTarget } from '../src/model/types.ts';

const TODAY = '2026-10-13';
const SITE = '03 Projects/Website for Sam/Website for Sam.md';
const HOME = '04 Areas/Home/Home.md';
const CABINETS = '03 Projects/Renovate the kitchen/Order cabinets.md';
const CONTRACTOR = '03 Projects/Renovate the kitchen/Choose a contractor.md';
const SPANISH = '03 Projects/Learn Spanish/Learn Spanish.md';

test('sample.json carries the sample vault: the same snapshot the tests use', () => {
  const raw = readSample();
  // 26 notes in v0.1.0, and 20 more: the Guide, the week 41 record, fifteen projects, two tasks and an appointment.
  assert.equal(raw.length, 46);
  assert.deepEqual(buildSnapshot(JSON.parse(JSON.stringify(raw)) as RawNote[]), loadSample());
});

/** A fresh copy of the sample in memory, its writes, and how often they asked for a re-render. */
function vault(notes: RawNote[] = readSample()) {
  const renders = { count: 0 };
  const writes = memoryWrites(notes, TODAY, () => { renders.count++; });
  const note = (path: string): RawNote => notes.find((n) => n.path === path) ?? assert.fail(`no note ${path}`);
  // Line numbers count from 0 and include the frontmatter, as in TaskLine.
  const line = (path: string, n: number): RowTarget => ({ kind: 'line', path, line: n, raw: note(path).lines[n] ?? '' });
  return { notes, writes, note, line, renders };
}

test('toggle ticks a to-do line and stamps today as its completion', async () => {
  const v = vault();
  await v.writes.toggle(v.line(HOME, 6));
  assert.equal(v.note(HOME).lines[6], '- [x] Fix the hallway light switch [due:: 2026-10-13] [completion:: 2026-10-13]');
  assert.equal(v.renders.count, 1);
});

test('toggle ticks a doing line too', async () => {
  const v = vault();
  await v.writes.toggle(v.line(SITE, 10));
  assert.equal(v.note(SITE).lines[10], '- [x] Build the homepage header [scheduled:: 2026-10-13] [completion:: 2026-10-13]');
});

test('toggle unticks a done line and removes its completion', async () => {
  const v = vault();
  await v.writes.toggle(v.line(HOME, 8));
  assert.equal(v.note(HOME).lines[8], '- [ ] Replace the smoke alarm battery');
});

test('setState swaps the checkbox, and the completion and cancelled dates follow the state', async () => {
  const v = vault();
  await v.writes.setState(v.line(SITE, 9), 'waiting');
  await v.writes.setState(v.line(SITE, 11), 'doing');
  await v.writes.setState(v.line(SITE, 13), 'dropped');
  assert.deepEqual(v.note(SITE).lines.slice(9, 15), [
    '- [w] Pick design B with Sam',
    '- [/] Build the homepage header [scheduled:: 2026-10-13]',
    '- [/] Send Sam the hosting options [due:: 2026-10-17]',
    '- [w] Get photos from [[Sam Rivers|Sam]] [scheduled:: 2026-10-20]',
    '- [-] Write the About page text [cancelled:: 2026-10-13]',
    "- [ ] [[Choose hosting for Sam's site]]",
  ]);
  assert.equal(v.renders.count, 3);
});

test('setState to the state a line is already in leaves it as it is, but the view still refreshes', async () => {
  const v = vault();
  // Dates from before today, so a re-stamp would show.
  v.note(HOME).lines[7] = '- [-] Clean the gutters [cancelled:: 2026-10-01]';
  const before = v.note(HOME).lines.slice();
  await v.writes.setState(v.line(HOME, 8), 'done');
  await v.writes.setState(v.line(HOME, 7), 'dropped');
  await v.writes.setState(v.line(HOME, 6), 'todo');
  assert.deepEqual(v.note(HOME).lines, before);
  assert.equal(v.renders.count, 3);
});

test('toggle on a dropped line reopens it as to do, without its cancelled date', async () => {
  const v = vault();
  v.note(HOME).lines[7] = '- [-] Clean the gutters [cancelled:: 2026-10-01] [scheduled:: 2026-10-15]';
  await v.writes.toggle(v.line(HOME, 7));
  assert.equal(v.note(HOME).lines[7], '- [ ] Clean the gutters [scheduled:: 2026-10-15]');
});

test('a line that changed since it was drawn is not written, but the view still refreshes', async () => {
  const v = vault();
  await v.writes.toggle({ kind: 'line', path: HOME, line: 6, raw: '- [ ] Fix the light switch' });
  assert.equal(v.note(HOME).lines[6], '- [ ] Fix the hallway light switch [due:: 2026-10-13]');
  assert.equal(v.renders.count, 1);
});

test('setNoteStatus and setState on a note set the status in its frontmatter', async () => {
  const v = vault();
  await v.writes.setNoteStatus(SPANISH, 'active');
  await v.writes.setState({ kind: 'note', path: CONTRACTOR, state: 'waiting' }, 'todo');
  assert.deepEqual(v.note(SPANISH).frontmatter, { type: 'project', created: '2026-06-02', status: 'active', area: '[[Health]]' });
  assert.equal(v.note(CONTRACTOR).frontmatter?.status, 'open');
  assert.equal(v.renders.count, 2);
});

test('a dropped note gets a done date, like a done one, and any other status clears it', async () => {
  const v = vault();
  await v.writes.setNoteStatus(SPANISH, 'dropped');
  assert.deepEqual([v.note(SPANISH).frontmatter?.status, v.note(SPANISH).frontmatter?.done], ['dropped', TODAY]);
  await v.writes.setNoteStatus(SPANISH, 'active');
  assert.equal(v.note(SPANISH).frontmatter?.status, 'active');
  assert.equal('done' in (v.note(SPANISH).frontmatter ?? {}), false);
});

test('toggle on a task note marks it done today, and open again', async () => {
  const v = vault();
  const fields = () => [v.note(CABINETS).frontmatter?.status, v.note(CABINETS).frontmatter?.done];
  await v.writes.toggle({ kind: 'note', path: CABINETS, state: 'todo' });
  assert.deepEqual(fields(), ['done', TODAY]);
  // A second click on the row as it was drawn (todo) is not an undo: the note stays done.
  await v.writes.toggle({ kind: 'note', path: CABINETS, state: 'todo' });
  assert.deepEqual(fields(), ['done', TODAY]);
  await v.writes.toggle({ kind: 'note', path: CABINETS, state: 'done' });
  assert.deepEqual(fields(), ['open', undefined]);
});

test('the writes reach the views when the snapshot is rebuilt', async () => {
  const v = vault();
  await v.writes.toggle(v.line(HOME, 6));
  await v.writes.setNoteStatus(SPANISH, 'active');
  const s = buildSnapshot(v.notes);
  const today = buildToday(s, TODAY);
  // Fix the hallway light switch leaves Today (4 left, 0 done) for Done today; Learn Spanish joins the 2 active.
  assert.deepEqual([today.left, today.doneToday, today.doneRows[0]?.title], [3, 1, 'Fix the hallway light switch']);
  assert.equal(buildProjects(s, TODAY).active, 3);
});

test('plan sets a line\'s planned day, moves it, and unplans it', async () => {
  const v = vault();
  const set = await v.writes.plan(v.line(HOME, 7), { day: '2026-10-21' });
  assert.equal(v.note(HOME).lines[7], '- [ ] Clean the gutters [scheduled:: 2026-10-21]');
  assert.equal(set?.kind === 'line' ? set.raw : undefined, '- [ ] Clean the gutters [scheduled:: 2026-10-21]');
  await v.writes.plan(v.line(HOME, 7), null);
  assert.equal(v.note(HOME).lines[7], '- [ ] Clean the gutters');
  await v.writes.plan(v.line(HOME, 7), { week: '2026-10-19' });
  assert.equal(v.note(HOME).lines[7], '- [ ] Clean the gutters [start:: 2026-10-19]');
  assert.equal(v.renders.count, 3);
});

test('plan resolves to the target as written, so a deadline can go on it straight after', async () => {
  const v = vault();
  const planned = (await v.writes.plan(v.line(HOME, 7), { day: '2026-10-21' })) ?? assert.fail('the plan was refused');
  const due = await v.writes.due(planned, '2026-10-21');
  assert.equal(v.note(HOME).lines[7], '- [ ] Clean the gutters [due:: 2026-10-21]');
  assert.deepEqual(due, { ...planned, raw: '- [ ] Clean the gutters [due:: 2026-10-21]' });
});

test('plan writes no line that changed since it was drawn, but the view still refreshes', async () => {
  const v = vault();
  const stale = await v.writes.plan({ kind: 'line', path: HOME, line: 7, raw: '- [ ] Clean the roof gutters' }, { day: '2026-10-21' });
  assert.equal(stale, null);
  assert.equal(v.note(HOME).lines[7], '- [ ] Clean the gutters [scheduled:: 2026-10-15]');
  assert.equal(v.renders.count, 1);
});

test('plan keeps a due in the plan\'s week, and a plan for a later week or No date yet takes a due this week', async () => {
  const v = vault();
  await v.writes.plan(v.line(SITE, 11), { day: '2026-10-15' });
  assert.equal(v.note(SITE).lines[11], '- [ ] Send Sam the hosting options [due:: 2026-10-17] [scheduled:: 2026-10-15]');
  await v.writes.plan(v.line(SITE, 11), { week: '2026-10-19' });
  assert.equal(v.note(SITE).lines[11], '- [ ] Send Sam the hosting options [start:: 2026-10-19]');
  await v.writes.plan(v.line(SITE, 11), { week: '2026-10-12' });
  await v.writes.due(v.line(SITE, 11), '2026-10-17');
  await v.writes.plan(v.line(SITE, 11), null);   // TODAY is Tue 13 Oct: a due on Sat 17 Oct is this week's
  assert.equal(v.note(SITE).lines[11], '- [ ] Send Sam the hosting options');
});

test('plan on a task note removes a due the plan leaves behind, in its frontmatter', async () => {
  const v = vault();
  const renew = { kind: 'note' as const, path: '04 Areas/Home/Renew passport.md', state: 'todo' as const };
  await v.writes.due(renew, '2026-10-15');
  await v.writes.plan(renew, { day: '2026-10-17' });
  assert.deepEqual(v.note(renew.path).frontmatter, { type: 'task', created: '2026-10-02', status: 'open', due: '2026-10-15', scheduled: '2026-10-17' });
  await v.writes.plan(renew, { week: '2026-10-19' });
  assert.deepEqual(v.note(renew.path).frontmatter, { type: 'task', created: '2026-10-02', status: 'open', start: '2026-10-19' });
});

test('plan on a task note sets and removes scheduled in its frontmatter', async () => {
  const v = vault(readSampleWithoutPoints());
  const cabinets = { kind: 'note' as const, path: CABINETS, state: 'todo' as const };
  await v.writes.plan(cabinets, { day: '2026-10-21' });
  assert.deepEqual(v.note(CABINETS).frontmatter, { type: 'task', created: '2026-09-14', status: 'open', scheduled: '2026-10-21' });
  await v.writes.plan(cabinets, null);
  assert.deepEqual(v.note(CABINETS).frontmatter, { type: 'task', created: '2026-09-14', status: 'open' });
  assert.equal(v.renders.count, 2);
});

test('due sets, moves and removes a line\'s deadline, and keeps its planned day', async () => {
  const v = vault();
  await v.writes.plan(v.line(SITE, 11), { day: '2026-10-15' });
  await v.writes.due(v.line(SITE, 11), '2026-10-30');
  assert.equal(v.note(SITE).lines[11], '- [ ] Send Sam the hosting options [due:: 2026-10-30] [scheduled:: 2026-10-15]');
  await v.writes.due(v.line(SITE, 11), null);
  assert.equal(v.note(SITE).lines[11], '- [ ] Send Sam the hosting options [scheduled:: 2026-10-15]');
});

test('due on a task note sets its deadline; planning it for that same day turns the plan into the deadline', async () => {
  const v = vault();
  const renew = { kind: 'note' as const, path: '04 Areas/Home/Renew passport.md', state: 'todo' as const };
  await v.writes.due(renew, '2026-11-06');
  assert.equal(v.note(renew.path).frontmatter?.due, '2026-11-06');
  await v.writes.plan(renew, { day: '2026-11-06' });
  await v.writes.due(renew, '2026-11-06');
  assert.deepEqual(v.note(renew.path).frontmatter, { type: 'task', created: '2026-10-02', status: 'open', due: '2026-11-06' });
  await v.writes.due(renew, null);
  assert.deepEqual(v.note(renew.path).frontmatter, { type: 'task', created: '2026-10-02', status: 'open' });
});

test('setState resolves to the target as written: the line with its new raw, or the note with its new state', async () => {
  const v = vault();
  const row = v.line(HOME, 6);
  const done = await v.writes.setState(row, 'done');
  assert.deepEqual(done, { ...row, raw: '- [x] Fix the hallway light switch [due:: 2026-10-13] [completion:: 2026-10-13]' });
  const doing = await v.writes.setState({ kind: 'note', path: CABINETS, state: 'todo' }, 'doing');
  assert.deepEqual(doing, { kind: 'note', path: CABINETS, state: 'doing' });
});

test('the W41 sample note parses to the record the preview shows for a past week', () => {
  // For a past week the preview passes buildWeek the note at weekPlanPath(start), as BrainView's readWeekPlan does.
  const plan = readSample().find((n) => n.path === weekPlanPath('2026-10-05')) ?? assert.fail('no note at 08 Weeks/2026/2026-W41.md');
  assert.equal(parseWeekRecord(plan)?.frozen, '2026-10-12');
});

test('tokensOf: a page as tokens, without the mockup\'s templates, frozen nodes and mock classes', () => {
  const { document } = parseHTML(`<!doctype html><html><body>
    <div class="mock-week" data-week="42">
      <p class="brain-label">Week 42</p>
      <section class="brain-col brain-is-drop" data-frozen-drop>
        <ul class="brain-col-items">
          <li class="brain-task mock-slot brain-draggable" aria-label="Clean the gutters">Clean the gutters</li>
          <li class="brain-drop-line" aria-hidden="true" data-frozen></li>
        </ul>
      </section>
      <p class="brain-meta"><a href="#" class="brain-link">Home</a><span>Thu</span></p>
      <!-- a comment -->
      <li class="brain-day brain-is-drop"><span class="brain-label">Tue</span><template data-date=""><li class="brain-empty">No appointments</li></template></li>
    </div></body></html>`);
  assert.deepEqual(tokensOf(document.querySelector('.mock-week')), [
    'div',
    'p.brain-label', 'week 42',
    'section.brain-col',
    'ul.brain-col-items',
    'li.brain-draggable.brain-task [Clean the gutters]', 'Clean the gutters',
    'p.brain-meta', 'span', 'Home', 'span', 'Thu',
    'li.brain-day.brain-is-drop', 'span.brain-label', 'tue',
  ]);
  assert.deepEqual(tokensOf(null), []);
});
