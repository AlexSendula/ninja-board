import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EventVM, VaultSnapshot } from './types.ts';
import { loadSample } from '../../test/sample.ts';
import { buildSnapshot } from './snapshot.ts';
import { occurrencesOn } from './appointments.ts';

const sample = loadSample();
const shown = (events: EventVM[]) => events.map((e) => [e.title, e.start, e.end, e.where]);

test('occurrencesOn: the weekly dance class is on Tuesday 13, not on Monday 12', () => {
  const events = occurrencesOn(sample, '2026-10-13');
  assert.deepEqual(shown(events), [['Dance class', '20:15', '22:15', 'Studio Tempo']]);
  assert.equal(events[0]?.key, `${events[0]?.path}@2026-10-13`);
  assert.deepEqual(occurrencesOn(sample, '2026-10-12'), []);
});

test('occurrencesOn: the contractor visit on Thursday 15 and the dentist on Friday 16', () => {
  assert.deepEqual(occurrencesOn(sample, '2026-10-15').map((e) => [e.title, e.start, e.end]), [['Contractor visit', '17:30', '18:30']]);
  assert.deepEqual(occurrencesOn(sample, '2026-10-16').map((e) => [e.title, e.start, e.end]), [['Dentist', '10:00', '10:30']]);
});

test('occurrencesOn: a weekly repeat starts on its date; other repeats only show on their date', () => {
  const s = buildSnapshot([
    { path: 'Yoga.md', frontmatter: { type: 'appointment', date: '2026-10-20', time: '07:00-08:00', repeat: 'every tue, thu' }, lines: [] },
    { path: 'Rent.md', frontmatter: { type: 'appointment', date: '2026-10-01', time: '09:00', repeat: 'every month' }, lines: [] },
  ]);
  const titles = (iso: string) => occurrencesOn(s, iso).map((e) => e.title);
  assert.deepEqual(titles('2026-10-13'), []);        // a Tuesday before the start
  assert.deepEqual(titles('2026-10-15'), []);        // a Thursday before the start
  assert.deepEqual(titles('2026-10-20'), ['Yoga']);  // the start, a Tuesday
  assert.deepEqual(titles('2026-10-21'), []);        // Wednesday
  assert.deepEqual(titles('2026-10-22'), ['Yoga']);  // Thursday
  assert.deepEqual(titles('2026-10-01'), ['Rent']);  // its own date
  assert.deepEqual(titles('2026-11-01'), []);        // no month math
});

test('occurrencesOn: weekly repeats take lists and ranges of weekdays', () => {
  // Mon 5 Oct is the start of every case: Wed 7, Thu 8, Sat 10 and Sun 11 are later days.
  const titlesFor = (repeat: string, iso: string) => occurrencesOn(buildSnapshot([
    { path: 'Class.md', frontmatter: { type: 'appointment', date: '2026-10-05', time: '09:00', repeat }, lines: [] },
  ]), iso).map((e) => e.title);
  assert.deepEqual(titlesFor('every mon-fri', '2026-10-07'), ['Class']);
  assert.deepEqual(titlesFor('every mon-fri', '2026-10-10'), []);
  assert.deepEqual(titlesFor('every tue-thu', '2026-10-07'), ['Class']);
  assert.deepEqual(titlesFor('every tue-thu', '2026-10-09'), []);
  assert.deepEqual(titlesFor('every sat-mon', '2026-10-11'), ['Class']);      // a range may wrap past Sunday
  assert.deepEqual(titlesFor('every sat-mon', '2026-10-07'), []);
  assert.deepEqual(titlesFor('every mon, wed, fri', '2026-10-09'), ['Class']);
  assert.deepEqual(titlesFor('every mon, wed, fri', '2026-10-06'), []);
  assert.deepEqual(titlesFor('every sat, tue-wed', '2026-10-07'), ['Class']); // a list may mix days and ranges
  assert.deepEqual(titlesFor('Every Wed', '2026-10-07'), ['Class']);
});

test('occurrencesOn: a repeat that does not fully parse shows on its own date only', () => {
  const titlesFor = (repeat: string, iso: string) => occurrencesOn(buildSnapshot([
    { path: 'Class.md', frontmatter: { type: 'appointment', date: '2026-10-05', time: '09:00', repeat }, lines: [] },
  ]), iso).map((e) => e.title);
  for (const repeat of ['every tue, thu and sat', 'every tue, thu until dec']) {
    assert.deepEqual(titlesFor(repeat, '2026-10-05'), ['Class'], repeat);
    assert.deepEqual(titlesFor(repeat, '2026-10-06'), [], repeat);   // Tue
    assert.deepEqual(titlesFor(repeat, '2026-10-08'), [], repeat);   // Thu
  }
});

test('occurrencesOn: sorted by start; end and where only when given', () => {
  const s = buildSnapshot([
    { path: 'Gym.md', frontmatter: { type: 'appointment', date: '2026-10-13', time: '18:00-19:00', where: 'Basic-Fit' }, lines: [] },
    { path: 'Call the bank.md', frontmatter: { type: 'appointment', date: '2026-10-13', time: '09:00' }, lines: [] },
  ]);
  const events = occurrencesOn(s, '2026-10-13');
  assert.deepEqual(events.map((e) => e.key), ['Call the bank.md@2026-10-13', 'Gym.md@2026-10-13']);
  assert.deepEqual(shown(events), [['Call the bank', '09:00', undefined, undefined], ['Gym', '18:00', '19:00', 'Basic-Fit']]);
});

// A snapshot holding one appointment note with the given frontmatter fields.
const oneNote = (fields: Record<string, unknown>) => ({
  notes: [{ type: 'appointment', path: 'Appointments/2026-10-16 Dentist.md', name: '2026-10-16 Dentist', date: '2026-10-16', ...fields }],
}) as unknown as VaultSnapshot;

test('occurrencesOn splits a time range with or without spaces round the dash', () => {
  const range = (time: string) => {
    const [e] = occurrencesOn(oneNote({ time }), '2026-10-16');
    return [e?.start, e?.end];
  };
  assert.deepEqual(range('10:00-10:30'), ['10:00', '10:30']);
  assert.deepEqual(range('10:00 – 10:30'), ['10:00', '10:30']);
  assert.deepEqual(range('10:00'), ['10:00', undefined]);
});

test('occurrencesOn reads a 40 KB time value in linear time', () => {
  const time = `9:00${' '.repeat(40000)}x`;
  const started = performance.now();
  assert.equal(occurrencesOn(oneNote({ time }), '2026-10-16')[0]?.start, time);
  assert.ok(performance.now() - started < 200, 'a 40 KB time value took too long');
});

test('a time splits at its dash as the lookbehind form did: the spaces round the dash belong to neither part', () => {
  const split = (t: string): [string, string | undefined] => {
    const [start = '', end] = t.split(/(?<!\s)\s*[-–]\s*/);   // the lookbehind form this replaced: Node has one, iOS 16.3 does not
    return [start, end];
  };
  // Every string of up to four characters from these, which covers the cases that split differently.
  const chars = ['0', ' ', '-', '–', '\t', 'x'];
  const times = [''];
  for (let len = 1; len <= 4; len++) {
    const all = times.filter((t) => t.length === len - 1);
    for (const t of all) for (const c of chars) times.push(t + c);
  }
  const notes = times.map((time, i) => ({ path: `N${i}.md`, frontmatter: { type: 'appointment', date: '2026-10-13', time }, lines: [] }));
  const byPath = new Map(occurrencesOn(buildSnapshot(notes), '2026-10-13').map((e) => [e.path, e]));
  times.forEach((time, i) => {
    const e = byPath.get(`N${i}.md`);
    assert.deepEqual([e?.start, e?.end], split(time), JSON.stringify(time));
  });
});

test('a time with a 40 KB run of spaces splits in linear time', () => {
  const time = `${' '.repeat(40000)}-${' '.repeat(40000)}x${' '.repeat(40000)}`;
  const started = performance.now();
  const [e] = occurrencesOn(buildSnapshot([{ path: 'Long.md', frontmatter: { type: 'appointment', date: '2026-10-13', time }, lines: [] }]), '2026-10-13');
  assert.equal(e?.start, '');
  assert.equal(e?.end?.trimEnd(), 'x');   // the end keeps its trailing spaces, as the split always did
  assert.ok(performance.now() - started < 200, 'took too long');
});
