import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RawNote } from './types.ts';
import { readSample } from '../../test/sample.ts';
import { RECORD_SECTIONS, parseWeekRecord, weekPlanPath } from './record.ts';

type Section = (typeof RECORD_SECTIONS)[number];

const sample = readSample();

function rawNote(path: string): RawNote {
  const n = sample.find((x) => x.path === path);
  if (!n) throw new Error('missing note ' + path);
  return n;
}

/** A week plan with these body lines, as readSample gives a note: every line, the frontmatter's included. */
function plan(body: string[], frontmatter: Record<string, unknown> = { type: 'week-plan' }): RawNote {
  return { path: '08 Weeks/2026/2026-W40.md', frontmatter, lines: ['---', 'type: week-plan', '---', '', ...body] };
}

/** The five headings in order, each followed by its own lines (none by default). */
function sections(under: Partial<Record<Section, string[]>> = {}): string[] {
  return RECORD_SECTIONS.flatMap((name) => [`### ${name}`, ...(under[name] ?? [])]);
}

test('parseWeekRecord: the sample week 41 record', () => {
  const r = parseWeekRecord(rawNote('08 Weeks/2026/2026-W41.md'));
  assert.ok(r);
  assert.deepEqual([r.frozen, r.updated], ['2026-10-12', '2026-10-11']);
  assert.deepEqual(
    [r.appointments.length, r.done.length, r.inProgress.length, r.notDone.length, r.backlog.length],
    [2, 5, 2, 3, 4],
  );
  assert.deepEqual(r.appointments, [
    { title: 'Dance class', context: 'Dance', day: '2026-10-06', time: '20:15' },
    { title: 'Kitchen showroom', context: 'Renovate the kitchen', day: '2026-10-08', time: '10:00' },
  ]);
  assert.deepEqual(r.done.map((i) => [i.title, i.context, i.day]), [
    ['Hang the hallway mirror', 'Home', '2026-10-06'],
    ['Cancel the old gym membership', 'Health', '2026-10-06'],
    ['Pay the water bill', 'Money', '2026-10-08'],
    ['Get three quotes', 'Choose a contractor', '2026-10-09'],
    ['List three hosting options', "Choose hosting for Sam's site", '2026-10-11'],
  ]);
  assert.deepEqual(r.inProgress, [
    { title: "Choose hosting for Sam's site", context: 'Website for Sam' },
    { title: 'Build the homepage header', context: 'Website for Sam' },
  ]);
  assert.deepEqual(r.notDone, [
    { title: 'Book a physio session', context: 'Health', due: '2026-10-10' },
    { title: 'Clean the gutters', context: 'Home', day: '2026-10-09', moved: '2026-10-15' },
    { title: 'Try a page builder', context: 'Website for Sam', dropped: '2026-10-11' },
  ]);
  assert.deepEqual(r.backlog, [
    { title: 'Podcast tip from Sam', context: 'Inbox' },
    { title: 'Write the About page text', context: 'Website for Sam' },
    { title: 'Measure the kitchen walls', context: 'Renovate the kitchen' },
    { title: 'Order new running shoes', context: 'Health' },
  ]);
});

test('parseWeekRecord: no record without all five exact headings', () => {
  assert.equal(parseWeekRecord(rawNote('08 Weeks/2026/2026-W42.md')), undefined);   // a plan from before the headings were added
  assert.equal(parseWeekRecord(plan(sections().filter((l) => l !== '### Backlog'))), undefined);
  assert.equal(parseWeekRecord(plan(sections().map((l) => (l === '### Done' ? '### Done this week' : l)))), undefined);
  assert.equal(parseWeekRecord(plan(sections().map((l) => (l === '### Done' ? '## Done' : l)))), undefined);
  // Exact after trimming: spaces around a heading are fine.
  assert.deepEqual(parseWeekRecord(plan(sections().map((l) => (l === '### Done' ? '  ### Done  ' : l)))), {
    appointments: [], done: [], inProgress: [], notDone: [], backlog: [],
  });
});

test('parseWeekRecord: only plain list items count; checkboxes and other lines are ignored', () => {
  const r = parseWeekRecord(plan(sections({
    Done: [
      '- [x] Pay the water bill [completion:: 2026-10-08]',
      '- [ ] Book a physio session',
      'Some words in between',
      '',
      '* Hang the hallway mirror · Home [day:: 2026-10-06]',
      '  + Fix the bike light · Home',
      '-Not an item: no space after the dash',
    ],
  })));
  assert.deepEqual(r?.done.map((i) => i.title), ['Hang the hallway mirror', 'Fix the bike light']);
});

test('parseWeekRecord: a section ends at the next heading or comment', () => {
  const r = parseWeekRecord(plan([
    '### Appointments',
    '### Done',
    '- Pay the water bill · Money',
    '<!-- brain week: end -->',
    '- After the comment · Home',
    '### In progress',
    '- Build the homepage header · Website for Sam',
    '## Notes',
    '- After a heading · Home',
    '### Not done',
    '### Backlog',
    '- Order new running shoes · Health',
  ]));
  assert.ok(r);
  assert.deepEqual(
    [r.appointments, r.done, r.inProgress, r.notDone, r.backlog].map((items) => items.map((i) => i.title)),
    [[], ['Pay the water bill'], ['Build the homepage header'], [], ['Order new running shoes']],
  );
});

test('parseWeekRecord: title and context split at the last " · "; links read as shown', () => {
  const r = parseWeekRecord(plan(sections({
    Backlog: [
      '- Call Sam · about the logo · Website for Sam',
      '- Get photos from [[Sam Rivers|Sam]] · [[Website for Sam]]',
      '- Podcast tip from Sam',
    ],
  })));
  assert.deepEqual(r?.backlog, [
    { title: 'Call Sam · about the logo', context: 'Website for Sam' },
    { title: 'Get photos from Sam', context: 'Website for Sam' },
    { title: 'Podcast tip from Sam' },
  ]);
});

test('parseWeekRecord: a bad date or time is ignored; every [word:: value] field leaves the text', () => {
  const r = parseWeekRecord(plan(sections({
    Appointments: ['- Dentist · Health [day:: 2026-10-16] [time:: 9:30-10:00]'],
    'Not done': ['- Clean [owner:: Pat] the gutters · Home [day:: 2026-13-40] [time:: half past] [moved:: 2026-10-15] [x:: y] [due::]'],
  })));
  assert.deepEqual(r?.appointments, [{ title: 'Dentist', context: 'Health', day: '2026-10-16', time: '9:30-10:00' }]);
  assert.deepEqual(r?.notDone, [{ title: 'Clean the gutters', context: 'Home', moved: '2026-10-15' }]);
});

test('parseWeekRecord: frozen and updated are dates or nothing', () => {
  const r = parseWeekRecord(plan(sections(), { type: 'week-plan', frozen: 'soon', updated: '2026-10-11' }));
  assert.equal(r?.frozen, undefined);
  assert.equal(r?.updated, '2026-10-11');
  assert.equal(parseWeekRecord({ path: 'W.md', frontmatter: undefined, lines: sections() })?.frozen, undefined);
});

test('parseWeekRecord: garbage lines and an empty note never throw', () => {
  const garbage = ['- ', '- ·', '- · Home', '- [day:: 2026-10-06]', '- [[unclosed', '[[', ']]', '- [day:: [[x]]', '-'];
  assert.doesNotThrow(() => parseWeekRecord(plan(sections({ Done: garbage, Backlog: garbage }))));
  assert.ok(parseWeekRecord(plan(sections({ Done: garbage }))));
  assert.equal(parseWeekRecord(plan(garbage)), undefined);
  assert.equal(parseWeekRecord({ path: 'W.md', frontmatter: undefined, lines: [] }), undefined);
  assert.equal(parseWeekRecord({ path: 'W.md', frontmatter: undefined, lines: [''] }), undefined);
});

test('weekPlanPath: the ISO year and the two-digit week number', () => {
  assert.equal(weekPlanPath('2026-10-05'), '08 Weeks/2026/2026-W41.md');
  assert.equal(weekPlanPath('2026-10-08'), '08 Weeks/2026/2026-W41.md');   // any day of the week
  assert.equal(weekPlanPath('2026-12-28'), '08 Weeks/2026/2026-W53.md');
  assert.equal(weekPlanPath('2027-01-01'), '08 Weeks/2026/2026-W53.md');   // a Friday in 2026's last week
  assert.equal(weekPlanPath('2027-01-04'), '08 Weeks/2027/2027-W01.md');
  // The folder is the ISO week's year, not the Monday's: the week of Mon 29 Dec 2025 is week 1 of 2026.
  assert.equal(weekPlanPath('2025-12-29'), '08 Weeks/2026/2026-W01.md');
  assert.equal(weekPlanPath('2026-01-01'), '08 Weeks/2026/2026-W01.md');
});

test('parseWeekRecord reads a 40 KB item of field openers in linear time', () => {
  const lines = ['### Appointments', `- Dentist · Home ${'[day:: '.repeat(5000)}`, '### Done', '### In progress', '### Not done', '### Backlog'];
  const started = performance.now();
  const record = parseWeekRecord({ path: 'w.md', frontmatter: {}, lines });
  assert.equal(record?.appointments[0]?.title, 'Dentist');
  assert.ok(performance.now() - started < 200, 'a 40 KB record item took too long');
});
