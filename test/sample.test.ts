import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSample, readSample } from './sample.ts';
import { isBoardPage } from '../src/model/isBoardPage.ts';
import type { NoteInfo, RawNote } from '../src/model/types.ts';

const snapshot = loadSample();
const raw = readSample();
const SITE = '03 Projects/Website for Sam/Website for Sam.md';
const BANK = '03 Projects/Move to a new bank/Move to a new bank.md';
const W41 = '08 Weeks/2026/2026-W41.md';

function note(path: string): NoteInfo {
  const found = snapshot.notes.find((n) => n.path === path);
  assert.ok(found, `missing note ${path}`);
  return found;
}

/** The note as the loader read it: every line, and the frontmatter as YAML gave it (dates stay strings). */
function rawNote(path: string): RawNote {
  const found = raw.find((n) => n.path === path);
  assert.ok(found, `missing note ${path}`);
  return found;
}

const within = (d: string | undefined, from: string, to: string): boolean => d !== undefined && d >= from && d <= to;

test('the sample vault holds every note the sample needs, by type', () => {
  const counts: Record<string, number> = {};
  for (const n of snapshot.notes) counts[n.type] = (counts[n.type] ?? 0) + 1;
  // project: Website for Sam, Renovate the kitchen, Learn Spanish, Plan summer vacation, Move to a new bank,
  //   plus eleven someday and four done projects, enough for Show all.
  // task: the 3 stories, Dentist checkup, Pay rent, and Back up the laptop (monthly, due in week 43)
  //   and Renew passport (due 9 Nov).
  // area: Health, Home, Money, Friends, Dance.
  // appointment: Dance class, Contractor visit, Dentist, and Kitchen showroom (in week 41's record).
  // week-plan: 2026-W42, and 2026-W41 with its frozen record.
  // other: the 5 dashboard notes (type: note), the Guide among them.
  assert.deepEqual(counts, {
    project: 20, task: 7, area: 5, appointment: 4, inbox: 2, people: 1, 'week-plan': 2, other: 5,
  });
  assert.equal(raw.length, 46);
});

test('a story belongs to the project whose folder holds it', () => {
  const story = note('03 Projects/Renovate the kitchen/Choose a contractor.md');
  assert.equal(story.projectPath, '03 Projects/Renovate the kitchen/Renovate the kitchen.md');
  assert.equal(story.parentName, 'Renovate the kitchen');
  assert.equal(story.areaPath, undefined);
});

test('a repeating task note belongs to the area whose folder holds it', () => {
  const dentist = note('04 Areas/Health/Dentist checkup.md');
  assert.equal(dentist.areaPath, '04 Areas/Health/Health.md');
  assert.equal(dentist.parentName, 'Health');
  assert.equal(dentist.projectPath, undefined);
  assert.equal(dentist.repeat, 'every 6 months');
});

test('frontmatter fields arrive as the views need them', () => {
  const site = note(SITE);
  assert.deepEqual([site.status, site.area, site.due], ['active', 'Friends', '2026-11-14']);
  const dance = note('04 Areas/Dance/Dance class.md');
  assert.deepEqual([dance.date, dance.repeat, dance.time, dance.where], ['2026-09-01', 'every tue', '20:15-22:15', 'Studio Tempo']);
  assert.equal(note('03 Projects/Move to a new bank/Move to a new bank.md').done, '2026-10-02');
  assert.equal(note('02 Inbox/2026-10-13 0912 Order shipped.md').received, '2026-10-13T09:12');
});

test('Website for Sam has six task lines, the last one a story pointer', () => {
  assert.deepEqual(note(SITE).tasks.map((t) => t.isPointer), [false, false, false, false, false, true]);
});

test('task line numbers are the line numbers in the file, frontmatter included', () => {
  const file = readFileSync(new URL(`../sample-vault/${SITE}`, import.meta.url), 'utf8').split('\n');
  const header = note(SITE).tasks.find((t) => t.raw.startsWith('- [/] Build the homepage header'));
  // 0 is the opening '---', 1-5 the fields, 6 the closing '---', 7 blank, 8 '## Tasks', 9 the done line.
  assert.equal(header?.line, 10);
  assert.equal(file.indexOf('- [/] Build the homepage header [scheduled:: 2026-10-13]'), 10);
});

test('the Guide dashboard note holds a base block that shows ninja-board-guide', () => {
  const guide = rawNote('01 Dashboard/05 Guide.md');
  assert.equal(guide.frontmatter?.type, 'note');
  assert.ok(guide.lines.includes('```base'));
  assert.ok(guide.lines.includes('  - type: ninja-board-guide'));
});

test('each of the five dashboard notes is a board page: cssclasses holds ninja-board, after created, written as a list', () => {
  const dashboards = raw.filter((n) => n.path.startsWith('01 Dashboard/'));
  assert.equal(dashboards.length, 5);
  for (const n of dashboards) {
    assert.equal(isBoardPage(n.frontmatter), true, n.path);
    assert.deepEqual(Object.keys(n.frontmatter ?? {}), ['type', 'created', 'cssclasses'], n.path);
    const text = readFileSync(new URL(`../sample-vault/${n.path}`, import.meta.url), 'utf8');
    assert.match(text, /^---\ntype: note\ncreated: \d{4}-\d{2}-\d{2}\ncssclasses:\n {2}- ninja-board\n---\n\n```base\n/, n.path);
  }
});

test('no other note in the sample vault is a board page', () => {
  assert.deepEqual(raw.filter((n) => !n.path.startsWith('01 Dashboard/') && isBoardPage(n.frontmatter)), []);
});

test('the week 41 plan holds a frozen record: five sections in order, and no task lines', () => {
  const w41 = rawNote(W41);
  assert.deepEqual(
    [w41.frontmatter?.type, w41.frontmatter?.week, w41.frontmatter?.frozen, w41.frontmatter?.updated],
    ['week-plan', '2026-W41', '2026-10-12', '2026-10-11'],
  );
  assert.deepEqual(w41.lines.filter((l) => l.startsWith('### ')), [
    '### Appointments', '### Done', '### In progress', '### Not done', '### Backlog',
  ]);
  // Record items are plain list items, never checkboxes, so no view ever sees them as live tasks.
  assert.deepEqual(note(W41).tasks, []);
  // The record's Kitchen showroom is a note too, so its chip can open it.
  const showroom = note('03 Projects/Renovate the kitchen/2026-10-08 Kitchen showroom.md');
  assert.deepEqual(
    [showroom.type, showroom.date, showroom.time, showroom.where],
    ['appointment', '2026-10-08', '10:00-11:00', 'Kitchen Corner'],
  );
});

test('twelve someday projects, by the date they were added, newest first', () => {
  const someday = snapshot.notes
    .filter((n) => n.type === 'project' && n.status === 'someday')
    .map((n) => [n.name, String(rawNote(n.path).frontmatter?.created)])
    .sort((a, b) => b[1].localeCompare(a[1]));
  assert.deepEqual(someday, [
    ['Organise a reunion weekend', '2026-10-04'],
    ['Run a half marathon', '2026-09-12'],
    ['Plan summer vacation', '2026-08-30'],
    ['Repaint the bedroom', '2026-08-02'],
    ['Build a vegetable garden', '2026-07-11'],
    ['Digitise the family photos', '2026-06-20'],
    ['Open a holiday savings account', '2026-06-05'],
    ['Write a family recipe book', '2026-05-24'],
    ['Learn to sail', '2026-05-10'],
    ['Set up a home office', '2026-04-26'],
    ['Plan a trip to Japan', '2026-04-12'],
    ['Start a monthly dinner club', '2026-03-29'],
  ]);
});

test('five done projects, by the date they were finished, latest first', () => {
  const done = snapshot.notes
    .filter((n) => n.type === 'project' && n.status === 'done')
    .map((n) => [n.name, String(n.done)])
    .sort((a, b) => b[1].localeCompare(a[1]));
  assert.deepEqual(done, [
    ['Paint the garden fence', '2026-10-11'],
    ['Switch health insurance', '2026-10-06'],
    ['Move to a new bank', '2026-10-02'],
    ['File the tax return', '2026-09-29'],
    ['Clear out the attic', '2026-09-24'],
  ]);
});

test('Move to a new bank has four done lines, three of them in week 40', () => {
  assert.deepEqual(note(BANK).tasks.map((t) => [t.text, t.state, t.completion]), [
    ['Open the new account', 'done', '2026-09-24'],
    ['Move the direct debits', 'done', '2026-09-30'],
    ['Close the old account', 'done', '2026-10-02'],
    ['Cancel the old bank cards', 'done', '2026-10-02'],
  ]);
});

test('the weeks the views page to: week 40 done, weeks 43 to 47 ahead', () => {
  // Week 40 (28 Sep to 4 Oct): every line done that week, in date order, then file order.
  const doneIn = (from: string, to: string) => snapshot.notes
    .flatMap((n) => n.tasks.filter((t) => t.state === 'done' && within(t.completion, from, to)).map((t) => [String(t.completion), t.text, n.name]))
    .sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(doneIn('2026-09-28', '2026-10-04'), [
    ['2026-09-30', 'Move the direct debits', 'Move to a new bank'],
    ['2026-10-01', 'Send the meter reading', 'Money'],
    ['2026-10-02', 'Close the old account', 'Move to a new bank'],
    ['2026-10-02', 'Cancel the old bank cards', 'Move to a new bank'],
    ['2026-10-03', 'Fix the bike light', 'Home'],
  ]);
  // Open task lines and open task notes with a due, planned, chase or week-plan (start) date in the week.
  const OPEN: readonly string[] = ['todo', 'doing', 'waiting'];
  const openIn = (from: string, to: string) => [
    ...snapshot.notes.flatMap((n) => n.tasks
      .filter((t) => OPEN.includes(t.state) && (within(t.due, from, to) || within(t.scheduled, from, to) || within(t.start, from, to)))
      .map((t) => t.text)),
    ...snapshot.notes
      .filter((n) => n.type === 'task' && n.status !== 'done' && n.status !== 'dropped')
      .filter((n) => within(n.due, from, to) || within(n.scheduled, from, to) || within(n.chase, from, to) || within(n.start, from, to))
      .map((n) => n.name),
  ].sort();
  assert.deepEqual(openIn('2026-09-28', '2026-10-04'), []);
  assert.deepEqual(openIn('2026-10-19', '2026-10-25'), [
    'Back up the laptop', 'Book the boiler service', 'Choose a contractor', "Choose hosting for Sam's site", 'Get photos from [[Sam Rivers|Sam]]',
  ]);
  assert.deepEqual(openIn('2026-10-26', '2026-11-01'), ['Pay rent']);
  assert.deepEqual(openIn('2026-11-02', '2026-11-08'), []);
  assert.deepEqual(openIn('2026-11-09', '2026-11-15'), ['Renew passport']);
  assert.deepEqual(openIn('2026-11-16', '2026-11-22'), ['Pay the car insurance']);
  // One-off appointments all fall before week 43, so Coming up counts tasks only.
  assert.deepEqual(snapshot.notes.filter((n) => n.type === 'appointment' && !n.repeat).map((n) => n.date), [
    '2026-10-08', '2026-10-15', '2026-10-16',
  ]);
});

test('Home has four undated to-dos after its done lines, and Friends has no task lines', () => {
  assert.deepEqual(note('04 Areas/Home/Home.md').tasks.filter((t) => t.start === undefined).slice(4).map((t) => [t.line, t.text, t.due, t.scheduled]), [
    [10, 'Replace the bathroom tap washer', undefined, undefined],
    [11, 'Sort the winter clothes', undefined, undefined],
    [12, 'Fix the squeaky door', undefined, undefined],
    [13, 'Oil the garden bench', undefined, undefined],
  ]);
  assert.deepEqual(note('04 Areas/Friends/Friends.md').tasks, []);
});

test("Home's two week plans: Back up the photos for week 42, Book the boiler service for week 43", () => {
  const plans = note('04 Areas/Home/Home.md').tasks.filter((t) => t.start !== undefined).map((t) => [t.text, t.start]);
  assert.deepEqual(plans, [['Back up the photos', '2026-10-12'], ['Book the boiler service', '2026-10-19']]);
});
