import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanDates, PlanTo } from './types.ts';
import { isoWeek } from './dates.ts';
import {
  anyDayPressed, applyEdit, applyNoteDue, applyNotePlan, cardWeeks, dayChips, flipWeek, hasPlan, otherWeek,
  pickDay, pickNoDate, pickWeek, stepWeeks, toggleLater, weekChips, weekName,
} from './plan.ts';

const TODAY = '2026-10-13';   // a Tuesday; this week is 12 to 18 October

test('a day plan sets scheduled and clears start; a deadline in a later week is kept', () => {
  const fm: Record<string, unknown> = { status: 'open', start: '2026-10-19', due: '2026-11-09' };
  applyNotePlan(fm, { day: '2026-10-21' }, TODAY);
  assert.deepEqual(fm, { status: 'open', scheduled: '2026-10-21', due: '2026-11-09' });
});

test('a week plan sets start to that Monday and clears every scheduled; a Date from YAML is read as its day', () => {
  const monday = isoWeek('2026-10-21').start;
  assert.equal(monday, '2026-10-19');
  const fm: Record<string, unknown> = { status: 'open', scheduled: new Date(2026, 9, 21), due: new Date(2026, 10, 9) };
  applyNotePlan(fm, { week: monday }, TODAY);
  assert.deepEqual(fm, { status: 'open', start: '2026-10-19', due: new Date(2026, 10, 9) });
});

test('no date yet clears scheduled and start, and keeps a deadline after this week', () => {
  const fm: Record<string, unknown> = { status: 'open', scheduled: '2026-10-21', start: '2026-10-19', due: '2026-11-09' };
  applyNotePlan(fm, null, TODAY);
  assert.deepEqual(fm, { status: 'open', due: '2026-11-09' });
});

test('a plan in a later week than a Date deadline (as YAML gives it) removes the deadline; the same week keeps it', () => {
  const later: Record<string, unknown> = { status: 'open', due: new Date(2026, 9, 15) };
  applyNotePlan(later, { week: '2026-10-19' }, TODAY);
  assert.deepEqual(later, { status: 'open', start: '2026-10-19' });
  const same: Record<string, unknown> = { status: 'open', due: new Date(2026, 9, 15) };
  applyNotePlan(same, { day: '2026-10-17' }, TODAY);
  assert.deepEqual(same, { status: 'open', scheduled: '2026-10-17', due: new Date(2026, 9, 15) });
});

test('a repeating note keeps its deadline whatever the plan: only applyNoteDue(null) was guarded before', () => {
  const fm: Record<string, unknown> = { status: 'open', repeat: 'every month', scheduled: '2026-10-16', due: '2026-10-15' };
  applyNotePlan(fm, { week: '2026-10-19' }, TODAY);
  assert.deepEqual(fm, { status: 'open', repeat: 'every month', due: '2026-10-15', start: '2026-10-19' });
  applyNotePlan(fm, null, TODAY);
  assert.deepEqual(fm, { status: 'open', repeat: 'every month', due: '2026-10-15' });
});

test('no date yet removes a deadline on or before this week\'s Sunday and keeps one on the Monday after', () => {
  for (const [due, kept] of [['2026-10-18', false], ['2026-10-08', false], ['2026-10-19', true]] as const) {
    const fm: Record<string, unknown> = { status: 'open', due };
    applyNotePlan(fm, null, TODAY);
    assert.deepEqual(fm, kept ? { status: 'open', due } : { status: 'open' }, due);
  }
});

test('a deadline on the day the note is planned for takes the plan away; a later deadline keeps it', () => {
  const sameDay: Record<string, unknown> = { status: 'open', scheduled: new Date(2026, 9, 23) };
  applyNoteDue(sameDay, '2026-10-23');
  assert.deepEqual(sameDay, { status: 'open', due: '2026-10-23' });
  const later: Record<string, unknown> = { status: 'open', scheduled: new Date(2026, 9, 23) };
  applyNoteDue(later, '2026-10-30');
  assert.deepEqual(later, { status: 'open', scheduled: new Date(2026, 9, 23), due: '2026-10-30' });
});

test('a repeating note keeps its deadline when it is removed; any other note loses it', () => {
  const repeating: Record<string, unknown> = { status: 'open', due: '2026-11-01', repeat: 'every month' };
  applyNoteDue(repeating, null);
  assert.deepEqual(repeating, { status: 'open', due: '2026-11-01', repeat: 'every month' });
  const plain: Record<string, unknown> = { status: 'open', due: '2026-11-09' };
  applyNoteDue(plain, null);
  assert.deepEqual(plain, { status: 'open' });
});

// ---------- Task 14: the planner card's model ----------

const THU = '2026-10-15';
const FRI = '2026-10-16';
const TUE = '2026-10-13';
const MON19 = '2026-10-19';

/** A frontmatter's three planning dates, with the keys that are not set left out. */
function datesOf(fm: Record<string, unknown>): PlanDates {
  const out: PlanDates = {};
  if (typeof fm.scheduled === 'string') out.scheduled = fm.scheduled;
  if (typeof fm.start === 'string') out.start = fm.start;
  if (typeof fm.due === 'string') out.due = fm.due;
  return out;
}

// The shared cases (test/edit-cases.json) that applyEdit must agree with.
const shared = JSON.parse(readFileSync(new URL('../../test/edit-cases.json', import.meta.url), 'utf8')) as {
  today: string;
  notePlans: { name: string; before: Record<string, unknown>; today?: string; to: PlanTo; expect: Record<string, unknown> }[];
  noteDues: { name: string; before: Record<string, unknown>; date: string | null; expect: Record<string, unknown> }[];
};

test('pickDay: the first click makes the do day, the same day again the deadline', () => {
  const first = pickDay({}, FRI, TODAY);
  assert.deepEqual(first, { next: { plan: FRI }, edits: [{ kind: 'plan', to: { day: FRI } }] });
  assert.deepEqual(pickDay(first.next, FRI, TODAY), { next: { due: FRI }, edits: [{ kind: 'due', date: FRI }] });
});

test('pickDay: a deadline chip makes the do day and removes the deadline, plan first', () => {
  assert.deepEqual(pickDay({ due: FRI }, FRI, TODAY), {
    next: { plan: FRI },
    edits: [{ kind: 'plan', to: { day: FRI } }, { kind: 'due', date: null }],
  });
});

test('pickDay: a click on another day in the deadline\'s week (or earlier) keeps the deadline', () => {
  assert.deepEqual(pickDay({ due: FRI }, TUE, TODAY), { next: { plan: TUE, due: FRI }, edits: [{ kind: 'plan', to: { day: TUE } }] });
  assert.deepEqual(pickDay({ plan: TUE, due: '2026-10-21' }, MON19, TODAY), { next: { plan: MON19, due: '2026-10-21' }, edits: [{ kind: 'plan', to: { day: MON19 } }] });
});

test('pickDay: a click on a day in a later week than the deadline\'s leaves the deadline behind', () => {
  assert.deepEqual(pickDay({ plan: TUE, due: FRI }, MON19, TODAY), { next: { plan: MON19 }, edits: [{ kind: 'plan', to: { day: MON19 } }] });
});

test('pickDay: "do Tuesday, due Friday" is three clicks from nothing: Friday, Friday, Tuesday', () => {
  const a = pickDay({}, FRI, TODAY);
  const b = pickDay(a.next, FRI, TODAY);
  const c = pickDay(b.next, TUE, TODAY);
  assert.deepEqual(c.next, { plan: TUE, due: FRI });
  assert.deepEqual([...a.edits, ...b.edits, ...c.edits], [
    { kind: 'plan', to: { day: FRI } }, { kind: 'due', date: FRI }, { kind: 'plan', to: { day: TUE } },
  ]);
});

test('pickDay: a day that is both the do day and the deadline is the deadline', () => {
  assert.deepEqual(pickDay({ plan: FRI, due: FRI }, FRI, TODAY), { next: { due: FRI }, edits: [{ kind: 'due', date: FRI }] });
});

test('pickWeek and pickNoDate write one edit each, and only when something changes', () => {
  assert.deepEqual(pickWeek({}, MON19, TODAY), [{ kind: 'plan', to: { week: MON19 } }]);
  assert.deepEqual(pickWeek({ start: MON19 }, MON19, TODAY), []);
  assert.deepEqual(pickWeek({ start: MON19, scheduled: '2026-10-21' }, MON19, TODAY), [{ kind: 'plan', to: { week: MON19 } }]);
  assert.deepEqual(pickNoDate({ due: '2026-11-09' }, TODAY), []);
  assert.deepEqual(pickNoDate({ start: MON19, due: '2026-11-09' }, TODAY), [{ kind: 'plan', to: null }]);
});

test('pickWeek on a week that is already planned any day still writes when it leaves a deadline behind', () => {
  assert.deepEqual(pickWeek({ start: MON19, due: THU }, MON19, TODAY), [{ kind: 'plan', to: { week: MON19 } }]);
  assert.deepEqual(pickWeek({ start: MON19, due: '2026-10-08' }, MON19, TODAY), [{ kind: 'plan', to: { week: MON19 } }]);
  // A deadline in that week or later is not left behind: the pressed button still does nothing.
  assert.deepEqual(pickWeek({ start: MON19, due: '2026-10-21' }, MON19, TODAY), []);
  assert.deepEqual(pickWeek({ start: MON19, due: '2026-11-09' }, MON19, TODAY), []);
  assert.deepEqual(applyEdit({ start: MON19, due: THU }, { kind: 'plan', to: { week: MON19 } }, TODAY), { start: MON19 });
});

test('pickNoDate also writes for a task with no plan whose deadline is this week or overdue: the deadline goes', () => {
  assert.deepEqual(pickNoDate({ due: THU }, TODAY), [{ kind: 'plan', to: null }]);
  assert.deepEqual(pickNoDate({ due: '2026-10-08' }, TODAY), [{ kind: 'plan', to: null }]);
  assert.deepEqual(pickNoDate({ due: '2026-10-19' }, TODAY), []);
});

test('a deadline this week stays when the plan moves inside the week, and goes with a plan for next week, in the card\'s dates', () => {
  const dates: PlanDates = { scheduled: TUE, due: THU };
  assert.deepEqual(applyEdit(dates, { kind: 'plan', to: { day: '2026-10-17' } }, TODAY), { scheduled: '2026-10-17', due: THU });
  assert.deepEqual(applyEdit(dates, { kind: 'plan', to: { week: '2026-10-12' } }, TODAY), { start: '2026-10-12', due: THU });
  const next = pickWeek(dates, MON19, TODAY);
  assert.deepEqual(next, [{ kind: 'plan', to: { week: MON19 } }]);
  assert.deepEqual(applyEdit(dates, next[0], TODAY), { start: MON19 });
  assert.deepEqual(applyEdit(dates, { kind: 'plan', to: { day: '2026-10-21' } }, TODAY), { scheduled: '2026-10-21' });
  assert.deepEqual(applyEdit(dates, { kind: 'plan', to: { week: '2026-11-02' } }, TODAY), { start: '2026-11-02' });
});

test('No date yet takes the plan and a deadline this week or overdue in the card\'s dates; a later deadline stays', () => {
  assert.deepEqual(applyEdit({ scheduled: TUE, due: THU }, { kind: 'plan', to: null }, TODAY), {});
  assert.deepEqual(applyEdit({ start: MON19, due: '2026-10-08' }, { kind: 'plan', to: null }, TODAY), {});
  assert.deepEqual(applyEdit({ scheduled: TUE, due: '2026-11-04' }, { kind: 'plan', to: null }, TODAY), { due: '2026-11-04' });
});

test('anyDayPressed: a day inside the week unpresses it, a day in another week does not; hasPlan', () => {
  assert.equal(anyDayPressed(MON19, { start: MON19 }), true);
  assert.equal(anyDayPressed(MON19, { start: MON19, scheduled: '2026-10-21' }), false);
  assert.equal(anyDayPressed(MON19, { start: MON19, scheduled: '2026-10-28' }), true);
  assert.equal(anyDayPressed(MON19, { scheduled: '2026-10-21' }), false);
  assert.equal(hasPlan({ due: '2026-11-09' }), false);
  assert.equal(hasPlan({ start: MON19 }), true);
  assert.equal(hasPlan({ scheduled: '2026-10-21' }), true);
});

// applyEdit gives the dates the shared cases expect (Review Focus 1): the card's copy is the same edit. A repeating
// note's case is read as one: its deadline stays.
for (const c of shared.notePlans) {
  test(`applyEdit, note plan: ${c.name}`, () => {
    assert.deepEqual(applyEdit(datesOf(c.before), { kind: 'plan', to: c.to }, c.today ?? shared.today, c.before.repeat !== undefined), datesOf(c.expect));
  });
}
for (const c of shared.noteDues) {
  test(`applyEdit, note due: ${c.name}`, () => {
    assert.deepEqual(applyEdit(datesOf(c.before), { kind: 'due', date: c.date }, shared.today, c.before.repeat !== undefined), datesOf(c.expect));
  });
}

test('cardWeeks: the week planned is the shown week, else this week; the other week and the scroller start', () => {
  const w = cardWeeks('2026-10-13');
  assert.deepEqual(
    [w.thisWeek, w.shown, w.week, w.other, w.first, w.from],
    ['2026-10-12', '2026-10-12', '2026-10-12', '2026-10-19', '2026-10-26', '2026-10-26'],
  );
  assert.equal(w.later, false);
  const week43 = cardWeeks('2026-10-13', '2026-10-19');
  assert.deepEqual([week43.other, week43.first], ['2026-10-12', '2026-10-26']);
  const week44 = cardWeeks('2026-10-13', '2026-10-26');
  assert.deepEqual([week44.other, week44.first], ['2026-10-12', '2026-10-19']);
  const week45 = cardWeeks('2026-10-13', '2026-11-02');
  assert.deepEqual([week45.other, week45.first], ['2026-10-12', '2026-10-19']);
});

test('flipWeek: twice returns to the start, and leaves Later', () => {
  const w = cardWeeks('2026-10-13');
  assert.equal(flipWeek(w).week, '2026-10-19');
  assert.deepEqual(flipWeek(flipWeek(w)), w);
  assert.equal(flipWeek(toggleLater(w)).later, false);
  // Later and the other week keep the scroller's first chip where it is.
  const scrolled = stepWeeks(w, 1);
  assert.equal(scrolled.from, '2026-11-02');
  assert.equal(flipWeek(scrolled).from, '2026-11-02');
  assert.equal(toggleLater(scrolled).from, '2026-11-02');
});

test('stepWeeks: never before the first chip, and no end going forward', () => {
  let w = cardWeeks('2026-10-13');
  assert.equal(stepWeeks(w, -1).from, '2026-10-26');
  assert.equal(stepWeeks(cardWeeks('2026-10-13', '2026-10-26'), -1).from, '2026-10-19');
  for (let i = 0; i < 9; i++) w = stepWeeks(w, 1);
  assert.equal(w.from, '2026-12-28');
  assert.equal(stepWeeks(w, 1).from, '2027-01-04');
});

test('weekName: This week, Next week while the shown week is this one, else the week number', () => {
  const w = cardWeeks('2026-10-13');
  assert.equal(weekName('2026-10-12', w), 'This week');
  assert.equal(weekName('2026-10-19', w), 'Next week');
  assert.equal(weekName('2026-10-19', cardWeeks('2026-10-13', '2026-10-19')), 'Week 43');
});

test('otherWeek: the button names the week it switches to, and is back when that is earlier than the week shown', () => {
  const w = cardWeeks('2026-10-13');
  assert.deepEqual(otherWeek(w), { start: '2026-10-19', name: 'Next week', back: false });
  assert.deepEqual(otherWeek(flipWeek(w)), { start: '2026-10-12', name: 'This week', back: true });
  assert.deepEqual(otherWeek(cardWeeks('2026-10-13', '2026-10-19')), { start: '2026-10-12', name: 'This week', back: true });
});

test('dayChips: past days are disabled, today is marked, the do day is pressed and the deadline is due', () => {
  const chips = dayChips('2026-10-12', { scheduled: '2026-10-18', due: '2026-10-16' }, '2026-10-13');
  assert.deepEqual(chips.map((c) => c.letter), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.deepEqual(chips.map((c) => c.day), [12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(chips.map((c) => c.disabled), [true, false, false, false, false, false, false]);
  assert.deepEqual(chips.map((c) => c.today), [false, true, false, false, false, false, false]);
  assert.deepEqual(chips.map((c) => c.pressed), [false, false, false, false, false, false, true]);
  assert.deepEqual(chips.map((c) => c.due), [false, false, false, false, true, false, false]);
  assert.equal(chips[4].label, 'Friday 16 October, due');
  assert.equal(chips[6].label, 'Sunday 18 October, planned');
});

test('dayChips: a do day that is also the deadline is pressed, not due', () => {
  const chip = dayChips('2026-10-12', { scheduled: FRI, due: FRI }, '2026-10-13')[4];
  assert.deepEqual([chip.pressed, chip.due, chip.label], [true, false, 'Friday 16 October, planned']);
});

test('weekChips: three weeks from the scroller, with week numbers and first days; the any-day week is pressed', () => {
  const w = stepWeeks(cardWeeks('2026-10-13'), 1);
  assert.equal(w.from, '2026-11-02');
  const chips = weekChips(w, { start: '2026-11-09' });
  assert.deepEqual(chips.map((c) => [c.label, c.date]), [['Wk 45', '2 Nov'], ['Wk 46', '9 Nov'], ['Wk 47', '16 Nov']]);
  assert.deepEqual(chips.map((c) => c.aria), [
    'Week 45, from 2 November, any day', 'Week 46, from 9 November, any day', 'Week 47, from 16 November, any day',
  ]);
  assert.deepEqual(chips.map((c) => c.pressed), [false, true, false]);
});
