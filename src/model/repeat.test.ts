// A repeating task note's completion (implementation spec, Edits: "Complete a repeating task note"; weeks design, section 8).
// Each step counts from the due date being completed (month ends drift, as the author accepted), or from the done date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyNoteComplete, nextDue, occurrencesIn, parseRepeat, withLogEntry, withoutLogEntry } from './repeat.ts';

const entry = (day: string, due: string, next: string) => `- ${day} Done: the occurrence due ${due}. Next due ${next}.`;

test('parseRepeat reads a step repeat and a weekday repeat, and nothing else', () => {
  assert.deepEqual(parseRepeat('every month'), { kind: 'step', n: 1, unit: 'month' });
  assert.deepEqual(parseRepeat('every 6 months'), { kind: 'step', n: 6, unit: 'month' });
  assert.deepEqual(parseRepeat('every 2 weeks'), { kind: 'step', n: 2, unit: 'week' });
  assert.deepEqual(parseRepeat('every year'), { kind: 'step', n: 1, unit: 'year' });
  assert.deepEqual(parseRepeat('every day'), { kind: 'step', n: 1, unit: 'day' });
  assert.deepEqual(parseRepeat('every tue'), { kind: 'weekdays', days: [1] });
  assert.deepEqual(parseRepeat('every mon, wed, fri'), { kind: 'weekdays', days: [0, 2, 4] });
  assert.deepEqual(parseRepeat('every mon-fri'), { kind: 'weekdays', days: [0, 1, 2, 3, 4] });
  assert.equal(parseRepeat('every fortnight'), undefined);
  assert.equal(parseRepeat('monthly'), undefined);
  assert.equal(parseRepeat(''), undefined);
});

// The three examples of the spec's Edits table.
test('Rent: counted from the due date, a missed fixed date carries over', () => {
  assert.equal(nextDue({ repeat: 'every month', from: 'due', missed: 'carry', due: '2026-10-01' }, '2026-11-16'), '2026-11-01');
});

test('Dentist: counted from the done date', () => {
  assert.equal(nextDue({ repeat: 'every 6 months', from: 'done', missed: 'carry', due: '2026-10-16' }, '2026-10-20'), '2027-04-20');
});

test('Bins: a missed weekday date lapses; the day it was done is covered by the completion, not lapsed', () => {
  assert.equal(nextDue({ repeat: 'every tue', from: 'due', missed: 'lapse', due: '2026-10-06' }, '2026-10-20'), '2026-10-27');
});

test('a carried weekday date stays due: the next one is the first after the due date, even if it has passed', () => {
  assert.equal(nextDue({ repeat: 'every tue', from: 'due', missed: 'carry', due: '2026-10-06' }, '2026-10-20'), '2026-10-13');
});

test('a carried date counted from the due date is one step after it, even when that has passed', () => {
  assert.equal(nextDue({ repeat: 'every week', from: 'due', missed: 'carry', due: '2026-10-06' }, '2026-10-20'), '2026-10-13');
});

test('a note with no if_missed or repeat_from counts from its due date and carries a missed date', () => {
  const fm: Record<string, unknown> = { type: 'task', status: 'open', repeat: 'every week', due: '2026-10-06' };
  assert.equal(applyNoteComplete(fm, '2026-10-20'), entry('2026-10-20', '2026-10-06', '2026-10-13'));
  assert.equal(fm.due, '2026-10-13');
});

test('a lapse with several missed steps skips to the first one after the day it was done', () => {
  assert.equal(nextDue({ repeat: 'every 2 weeks', from: 'due', missed: 'lapse', due: '2026-09-01' }, '2026-10-20'), '2026-10-27');
});

test('month ends drift: each step counts from the due date being completed, so 31 Jan, 28 Feb, 28 Mar', () => {
  const step = (due: string) => nextDue({ repeat: 'every month', from: 'due', missed: 'carry', due }, due);
  assert.equal(step('2026-01-31'), '2026-02-28');
  assert.equal(step('2026-02-28'), '2026-03-28');
});

test('a yearly repeat from 29 February lands on 28 February in a year without one', () => {
  assert.equal(nextDue({ repeat: 'every year', from: 'due', missed: 'carry', due: '2028-02-29' }, '2028-02-29'), '2029-02-28');
});

test('weekdays counted from the done date: the next listed weekday after the day it was done', () => {
  assert.equal(nextDue({ repeat: 'every mon, wed, fri', from: 'done', missed: 'carry', due: '2026-10-12' }, '2026-10-14'), '2026-10-16');
  assert.equal(nextDue({ repeat: 'every mon-fri', from: 'done', missed: 'carry', due: '2026-10-16' }, '2026-10-16'), '2026-10-19');
});

test('a day in the step is counted in days and weeks from the due date', () => {
  assert.equal(nextDue({ repeat: 'every 10 days', from: 'due', missed: 'carry', due: '2026-10-01' }, '2026-10-03'), '2026-10-11');
  assert.equal(nextDue({ repeat: 'every week', from: 'due', missed: 'lapse', due: '2026-10-01' }, '2026-10-20'), '2026-10-22');
});

test('a repeat that would land more than 100 years on is refused; one that lands exactly 100 years on is not', () => {
  assert.equal(nextDue({ repeat: 'every 200 years', from: 'due', missed: 'lapse', due: '2026-10-16' }, '2026-10-16'), undefined);
  assert.equal(nextDue({ repeat: 'every 100 years', from: 'due', missed: 'lapse', due: '2026-10-16' }, '2026-10-16'), '2126-10-16');
});

test('a date past 9999-12-31 is refused for every kind of step, and the lapse walk ends', () => {
  assert.equal(nextDue({ repeat: 'every day', from: 'due', missed: 'carry', due: '9999-12-31' }, '2026-10-16'), undefined);
  assert.equal(nextDue({ repeat: 'every day', from: 'done', missed: 'carry', due: '2026-10-16' }, '9999-12-31'), undefined);
  assert.equal(nextDue({ repeat: 'every day', from: 'due', missed: 'lapse', due: '9999-12-31' }, '2026-10-16'), undefined);
  assert.equal(nextDue({ repeat: 'every month', from: 'due', missed: 'lapse', due: '9999-12-31' }, '2026-10-16'), undefined);
  assert.equal(nextDue({ repeat: 'every 500 years', from: 'due', missed: 'lapse', due: '9800-01-01' }, '2026-10-16'), undefined);
});

test('applyNoteComplete: the note is open with its next due date, and the planned day, waiting and done go', () => {
  const fm: Record<string, unknown> = {
    type: 'task', status: 'waiting', repeat: 'every 6 months', repeat_from: 'done', due: '2026-10-16',
    scheduled: '2026-10-18', start: '2026-10-12', waiting_on: '[[Bram]]', chase: '2026-10-22', area: '[[Health]]',
  };
  const line = applyNoteComplete(fm, '2026-10-20');
  assert.equal(line, entry('2026-10-20', '2026-10-16', '2027-04-20'));
  assert.deepEqual(fm, { type: 'task', status: 'open', repeat: 'every 6 months', repeat_from: 'done', due: '2027-04-20', area: '[[Health]]' });
});

test('applyNoteComplete: a note whose repeat does not parse is refused, and its frontmatter is left alone', () => {
  const fm: Record<string, unknown> = { type: 'task', status: 'open', repeat: 'fortnightly', due: '2026-10-16' };
  assert.equal(applyNoteComplete(fm, '2026-10-20'), undefined);
  assert.deepEqual(fm, { type: 'task', status: 'open', repeat: 'fortnightly', due: '2026-10-16' });
});

test('withLogEntry: the entry goes at the top of an existing Log section', () => {
  const body = '## Tasks\n\n## Log\n- 2026-10-01 Done: the occurrence due 2026-09-16. Next due 2026-10-16.\n';
  const out = withLogEntry(body, entry('2026-10-20', '2026-10-16', '2027-04-20'));
  assert.equal(out.made, false);
  assert.equal(out.text, '## Tasks\n\n## Log\n- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2027-04-20.\n'
    + '- 2026-10-01 Done: the occurrence due 2026-09-16. Next due 2026-10-16.\n');
});

test('withLogEntry: a note with no Log section gets one at its end, with the line under it', () => {
  const out = withLogEntry('## Tasks\n- [ ] Book it\n', entry('2026-10-20', '2026-10-16', '2027-04-20'));
  assert.equal(out.made, true);
  assert.equal(out.text, '## Tasks\n- [ ] Book it\n\n## Log\n' + entry('2026-10-20', '2026-10-16', '2027-04-20') + '\n');
});

test('withLogEntry: a note with no text at all gets only the section', () => {
  assert.equal(withLogEntry('', entry('2026-10-20', '2026-10-16', '2027-04-20')).text, '## Log\n' + entry('2026-10-20', '2026-10-16', '2027-04-20') + '\n');
});

test('withoutLogEntry puts the text back as it was, for a section that was there and for one Brain made', () => {
  const e = entry('2026-10-20', '2026-10-16', '2027-04-20');
  const before = '## Tasks\n\n## Log\n- 2026-10-01 Done: the occurrence due 2026-09-16. Next due 2026-10-16.\n';
  const kept = withLogEntry(before, e);
  assert.equal(withoutLogEntry(kept.text, e, kept.made, kept.tail), before);
  const bare = '## Tasks\n- [ ] Book it\n';
  const made = withLogEntry(bare, e);
  assert.equal(withoutLogEntry(made.text, e, made.made, made.tail), bare);
  const empty = withLogEntry('', e);
  assert.equal(withoutLogEntry(empty.text, e, empty.made, empty.tail), '');
});

test('withoutLogEntry refuses a line that has changed, or a section that is not as Brain left it', () => {
  const e = entry('2026-10-20', '2026-10-16', '2027-04-20');
  const made = withLogEntry('## Tasks\n', e);
  assert.equal(withoutLogEntry(made.text.replace('2027-04-20', '2027-05-01'), e, made.made, made.tail), undefined);
  const kept = withLogEntry('## Log\n- 2026-10-01 Done: x.\n', e);
  assert.equal(withoutLogEntry(kept.text.replace(e, 'edited'), e, kept.made, kept.tail), undefined);
});

test('occurrencesIn reads the completed occurrences in the Log section, and nothing else', () => {
  const lines = [
    '## Tasks', '- [ ] Something', '## Log',
    '- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2027-04-20.',
    '- 2026-04-20 Done: the occurrence due 2026-04-16. Next due 2026-10-16.',
    '- 2026-03-01 a note that is not a completion',
    '## Other', '- 2026-02-02 Done: the occurrence due 2026-02-01. Next due 2026-02-03.',
  ];
  assert.deepEqual(occurrencesIn(lines), [
    { on: '2026-10-20', due: '2026-10-16', next: '2027-04-20', nth: 1 },
    { on: '2026-04-20', due: '2026-04-16', next: '2026-10-16', nth: 1 },
  ]);
});

test('occurrencesIn numbers the lines dated the same day from the top of the Log: the second such line is nth 2', () => {
  const lines = [
    '## Log',
    '- 2026-10-20 Done: the occurrence due 2026-10-17. Next due 2026-10-18.',
    '- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2026-10-17.',
    '- 2026-10-19 Done: the occurrence due 2026-10-15. Next due 2026-10-16.',
  ];
  assert.deepEqual(occurrencesIn(lines).map((o) => o.nth), [1, 2, 1]);
});
