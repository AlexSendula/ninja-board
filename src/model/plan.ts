// A task note's planning and deadline, as frontmatter edits. Pure: the plugin's writes, the preview's
// memory and the planner card (Task 15) all run these same functions.
import type { PlanDates, PlanTo } from './types.ts';
import { addDays, dayMonth, isoWeek, longDate, toISO, weekdayLong } from './dates.ts';

/**
 * Whether planning `to` takes the deadline `due` away (ISO; undefined when the task has none or it isn't a
 * date). A day or a week in a later ISO week than the deadline's leaves it behind; the same week or an
 * earlier one keeps it. No date yet takes one on or before the current week's Sunday (due this week, or
 * overdue); a deadline further out stays. The one place this rule lives: lines, notes and the card use it.
 */
export function planDropsDue(due: string | undefined, to: PlanTo, today: string): boolean {
  if (due === undefined) return false;
  if (to === null) return due <= isoWeek(today).end;
  return isoWeek('day' in to ? to.day : to.week).start > isoWeek(due).start;
}

/** A repeating task note (a non-empty `repeat`): completing an occurrence sets its dates (in Brain or by the agent), and a plan never removes its deadline. */
function repeats(fm: Record<string, unknown>): boolean {
  return typeof fm.repeat === 'string' && fm.repeat !== '';
}

/**
 * A task note's frontmatter after a plan. A day sets `scheduled` and clears `start`; a week sets
 * `start` and clears `scheduled`; no date yet clears both. `due` goes when the plan leaves it behind
 * (see planDropsDue; `today` is for no date yet), unless the note repeats; every other field stays.
 */
export function applyNotePlan(fm: Record<string, unknown>, to: PlanTo, today: string): void {
  planFields(fm, to, today, repeats(fm));
}

/** applyNotePlan's fields, with whether the note repeats given: a repeating note keeps its deadline whatever the plan. */
function planFields(fm: Record<string, unknown>, to: PlanTo, today: string, repeating: boolean): void {
  if (!repeating && planDropsDue(toISO(fm.due), to, today)) delete fm.due;
  if (to === null) {
    delete fm.scheduled;
    delete fm.start;
  } else if ('day' in to) {
    fm.scheduled = to.day;
    delete fm.start;
  } else {
    fm.start = to.week;
    delete fm.scheduled;
  }
}

/**
 * A task note's frontmatter after a deadline is set (a date) or removed (`null`). A deadline on the
 * day the note is planned for takes that plan away. A repeating note's deadline is never removed here.
 */
export function applyNoteDue(fm: Record<string, unknown>, date: string | null): void {
  if (date === null) {
    if (repeats(fm)) return;
    delete fm.due;
    return;
  }
  fm.due = date;
  if (toISO(fm.scheduled) === date) delete fm.scheduled;
}

// ---------- the planner card: do and due, the card's weeks and chips (Task 14) ----------

/** The do day (scheduled) and the deadline (due) a day chip alternates between. */
export interface DayState { plan?: string; due?: string }
/** One edit the card writes: a plan (Actions.plan) or a deadline (Actions.due). */
export type DateEdit = { kind: 'plan'; to: PlanTo } | { kind: 'due'; date: string | null };

/**
 * A click on a day chip (Review Focus 2): the first click makes the day the do day; the same day
 * again makes it the deadline (no longer the do day); again the do day. A deadline chip makes the
 * day the do day and removes the deadline, in that order. A day in a later week than the deadline's
 * leaves the deadline behind (planDropsDue). Keys that are undefined are left out.
 * A repeating note (`repeating`) keeps its deadline: a click sets the do day, or clears it when it is the do day.
 */
export function pickDay(current: DayState, day: string, today: string, repeating = false): { next: DayState; edits: DateEdit[] } {
  if (repeating) {
    const due = current.due === undefined ? {} : { due: current.due };
    return day === current.plan
      ? { next: due, edits: [{ kind: 'plan', to: null }] }
      : { next: { plan: day, ...due }, edits: [{ kind: 'plan', to: { day } }] };
  }
  if (day === current.plan) return { next: { due: day }, edits: [{ kind: 'due', date: day }] };
  if (day === current.due) {
    return { next: { plan: day }, edits: [{ kind: 'plan', to: { day } }, { kind: 'due', date: null }] };
  }
  const next: DayState = { plan: day };
  if (current.due !== undefined && !planDropsDue(current.due, { day }, today)) next.due = current.due;
  return { next, edits: [{ kind: 'plan', to: { day } }] };
}

/**
 * The any-day button or a Later week chip: a week plan, unless that week is already planned any day and
 * the plan leaves no deadline behind (a pressed button still writes to clear a `due` in an earlier week).
 * A repeating note keeps its deadline, so a pressed week writes nothing.
 */
export function pickWeek(dates: PlanDates, monday: string, today: string, repeating = false): DateEdit[] {
  return anyDayPressed(monday, dates) && (repeating || !planDropsDue(dates.due, { week: monday }, today))
    ? []
    : [{ kind: 'plan', to: { week: monday } }];
}

/** No date yet: every plan removed, and a deadline this week or overdue with them; no write when nothing would go. */
export function pickNoDate(dates: PlanDates, today: string, repeating = false): DateEdit[] {
  return hasPlan(dates) || (!repeating && planDropsDue(dates.due, null, today)) ? [{ kind: 'plan', to: null }] : [];
}

/** The task's dates after an edit, by the Edits rows; only scheduled, start and due. A repeating note keeps its deadline. */
export function applyEdit(dates: PlanDates, edit: DateEdit, today: string, repeating = false): PlanDates {
  const fm: Record<string, unknown> = { scheduled: dates.scheduled, start: dates.start, due: dates.due };
  if (edit.kind === 'plan') planFields(fm, edit.to, today, repeating);
  else if (!repeating || edit.date !== null) applyNoteDue(fm, edit.date);   // a repeating note's deadline is never removed
  const out: PlanDates = {};
  if (typeof fm.scheduled === 'string') out.scheduled = fm.scheduled;
  if (typeof fm.start === 'string') out.start = fm.start;
  if (typeof fm.due === 'string') out.due = fm.due;
  return out;
}

/** start is that Monday and no scheduled falls in that week. */
export function anyDayPressed(monday: string, dates: PlanDates): boolean {
  return dates.start === monday && !inWeek(dates.scheduled, monday);
}

/** scheduled or start is set. */
export function hasPlan(dates: PlanDates): boolean {
  return dates.scheduled !== undefined || dates.start !== undefined;
}

function inWeek(iso: string | undefined, monday: string): boolean {
  return iso !== undefined && iso >= monday && iso <= addDays(monday, 6);
}

export interface CardWeeks {
  thisWeek: string;   // this week's Monday
  shown: string;      // the week the card plans by default: the shown upcoming week, else thisWeek
  other: string;      // shown === thisWeek ? next week's Monday : thisWeek
  week: string;       // the week whose any-day button and day chips show now
  later: boolean;     // Later pressed: the scroller and No date yet replace the days
  first: string;      // the scroller's earliest first chip: the earliest Monday after this week that is neither shown nor other
  from: string;       // the scroller's first chip now
}

/** The card's weeks. `shown` is the shown upcoming week (any date in it works); without one, this week. */
export function cardWeeks(today: string, shown?: string): CardWeeks {
  const thisWeek = isoWeek(today).start;
  const planned = isoWeek(shown ?? today).start;
  const other = planned === thisWeek ? addDays(thisWeek, 7) : thisWeek;
  let first = addDays(thisWeek, 7);
  while (first === planned || first === other) first = addDays(first, 7);
  return { thisWeek, shown: planned, other, week: planned, later: false, first, from: first };
}

/** The other-week button: the any-day button and the days switch to the other week, and Later closes. */
export function flipWeek(w: CardWeeks): CardWeeks {
  return { ...w, week: w.week === w.shown ? w.other : w.shown, later: false };
}

/** Later: the scroller and No date yet replace the days, and back. */
export function toggleLater(w: CardWeeks): CardWeeks {
  return { ...w, later: !w.later };
}

/** A week at a time along the scroller: never before its first chip, and no end going forward. */
export function stepWeeks(w: CardWeeks, dir: -1 | 1): CardWeeks {
  const from = addDays(w.from, dir * 7);
  return { ...w, from: from < w.first ? w.first : from };
}

/** 'This week', 'Next week' (only while shown is this week) or 'Week 43'. */
export function weekName(monday: string, w: CardWeeks): string {
  if (monday === w.thisWeek) return 'This week';
  if (w.shown === w.thisWeek && monday === addDays(w.thisWeek, 7)) return 'Next week';
  return `Week ${isoWeek(monday).week}`;
}

/** The week the other-week button switches to, its name, and whether it lies before the week shown now (the back arrow). */
export function otherWeek(w: CardWeeks): { start: string; name: string; back: boolean } {
  const start = w.week === w.shown ? w.other : w.shown;
  return { start, name: weekName(start, w), back: start < w.week };
}

/**
 * The red deadline day: the due day, unless it is also the do day. A repeating note's deadline is always red, so its do
 * day can be its deadline too (a left click there sets the do day and keeps the deadline; see pickDay).
 */
export function isDueDay(dates: PlanDates, iso: string, repeating: boolean): boolean {
  return iso === dates.due && (repeating || iso !== dates.scheduled);
}

export interface DayChipVM {
  iso: string; letter: string; day: number;   // 'T', 20
  label: string;                              // 'Tuesday 20 October', plus ', planned' and ', due' as they apply
  pressed: boolean;                           // the do day: iso === scheduled
  due: boolean;                               // the red deadline day (isDueDay)
  today: boolean; disabled: boolean;          // disabled: before today
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The seven day chips of a week, Monday first. `repeating`: the note's deadline is red even on its do day. */
export function dayChips(monday: string, dates: PlanDates, today: string, repeating = false): DayChipVM[] {
  return LETTERS.map((letter, i) => {
    const iso = addDays(monday, i);
    const pressed = iso === dates.scheduled;
    const due = isDueDay(dates, iso, repeating);
    const word = `${pressed ? ', planned' : ''}${due ? ', due' : ''}`;
    return {
      iso, letter, day: Number(iso.slice(8, 10)),
      label: `${weekdayLong(iso)} ${longDate(iso)}${word}`,
      pressed, due, today: iso === today, disabled: iso < today,
    };
  });
}

export interface WeekChipVM { start: string; label: string; date: string; aria: string; pressed: boolean }   // 'Wk 45', '2 Nov', 'Week 45, from 2 November, any day', anyDayPressed

/** The scroller's three week chips, from `w.from`. */
export function weekChips(w: CardWeeks, dates: PlanDates): WeekChipVM[] {
  return [0, 1, 2].map((i) => {
    const start = addDays(w.from, 7 * i);
    const week = isoWeek(start).week;
    return {
      start,
      label: `Wk ${week}`,
      date: dayMonth(start),
      aria: `Week ${week}, from ${longDate(start)}, any day`,
      pressed: anyDayPressed(start, dates),
    };
  });
}
