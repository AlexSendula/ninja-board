import type { MetaPart, NoteInfo, PlanDates, RowVM, TaskLine, TaskState } from './types.ts';
import { chaseText, doneText, dueText, plannedText, weekPlanText } from './dates.ts';
import { displayText } from './taskLine.ts';

/**
 * A meta part with this text ends a meta line. The UI starts a new
 * <p class="brain-meta"> there and does not render the part itself.
 * Only repeating notes use it: [parent, date, META_BREAK, 'Every 6 months'].
 */
export const META_BREAK = '\n';

/** The date part of a row's meta, with the ISO date it speaks about. */
export interface DatePart { iso: string; part: MetaPart }

/** The dates a task line or a note carries; a note's chase is its waiting date. */
interface Dated { due?: string; scheduled?: string; start?: string; chase?: string; completion?: string; done?: string }

const NOTE_STATE = new Map<string, TaskState>([
  ['open', 'todo'], ['someday', 'todo'], ['doing', 'doing'],
  ['waiting', 'waiting'], ['done', 'done'], ['dropped', 'dropped'],
]);

const STATE_WORDS: Partial<Record<TaskState, string>> = {
  doing: ', in progress', waiting: ', waiting', dropped: ', dropped',
};

export function lineRow(
  t: TaskLine,
  note: NoteInfo,
  today: string,
  opts: { meta?: 'parent' | 'none'; draggable?: boolean } = {},
): RowVM {
  const title = displayText(t.text);
  const dates = dateParts(t.state, t, today);
  // A line's parent is the note it sits in: the project or area, or the story.
  const meta: MetaPart[] = opts.meta === 'none' ? [] : [{ text: note.name }];
  meta.push(...dates.map((d) => d.part));
  return {
    key: `${t.path}#${t.line}`,
    target: { kind: 'line', path: t.path, line: t.line, raw: t.raw },
    title,
    state: t.state,
    meta,
    repeating: false,
    draggable: opts.draggable ?? false,
    ...(PLANNABLE_LINE.has(t.state) ? { plan: planOf(t) } : {}),
    ariaLabel: ariaLabel(title, t.state, dates),
  };
}

/**
 * A task note as a row. A repeating one gets a second meta line with its repeat (a dropped one repeats no more), and is
 * ticked like any row: a tick completes this occurrence, and the note moves to its next date.
 */
export function noteRow(n: NoteInfo, today: string): RowVM {
  const state = NOTE_STATE.get(n.status ?? 'open') ?? 'todo';
  const dates = dateParts(state, n, today);
  const parent = n.parentName ?? n.area;
  const plan = notePlan(n);
  const repeats = Boolean(n.repeat) && state !== 'dropped';
  const meta: MetaPart[] = [];
  if (parent) meta.push({ text: parent });
  meta.push(...dates.map((d) => d.part));
  if (repeats && n.repeat) meta.push({ text: META_BREAK }, { text: capitalise(n.repeat) });
  return {
    key: n.path,
    target: { kind: 'note', path: n.path, state },
    title: n.name,
    state,
    meta,
    repeating: repeats,
    draggable: false,
    ...(plan ? { plan } : {}),
    ariaLabel: ariaLabel(n.name, state, dates),
  };
}

/**
 * The key of a completed occurrence's row: its note and the day it was done, so two occurrences of one note are two rows.
 * The second and later lines dated that day add `#2`, `#3` (their nth in the Log), so the keys stay unique.
 */
export function occurrenceKey(path: string, on: string, nth = 1): string {
  return nth > 1 ? `${path}@${on}#${nth}` : `${path}@${on}`;
}

/**
 * A completed occurrence of a repeating note, as a Done row of the week it was done in: its title, its parent and "Done Thu",
 * with the repeat mark (no tick, and no card: the note itself is where the next occurrence is ticked).
 */
export function occurrenceRow(n: NoteInfo, on: string, today: string, nth = 1): RowVM {
  const parent = n.parentName ?? n.area;
  return {
    key: occurrenceKey(n.path, on, nth),
    target: { kind: 'note', path: n.path, state: 'done' },
    title: n.name,
    state: 'done',
    meta: [...(parent ? [{ text: parent }] : []), { text: doneText(on, today) }],
    repeating: true,
    occurrence: true,
    draggable: false,
    ariaLabel: ariaLabel(n.name, 'done', []),
  };
}

/**
 * The day a task note is planned for: its scheduled day, or while it waits its chase date.
 * A story whose own waiting lines carry the chase is planned by them, so it never counts twice.
 */
export function plannedDay(n: NoteInfo): string | undefined {
  if (n.status !== 'waiting' || n.tasks.some((t) => t.state === 'waiting')) return n.scheduled;
  return n.chase ?? n.scheduled;
}

/**
 * The deadline a task note counts by in a week. A repeating note with a plan (its do day, its chase or its start week) is in
 * the week the plan gives: its deadline stays in the file and on its row, and places it nowhere. Otherwise its deadline counts.
 */
export function countedDue(n: NoteInfo): string | undefined {
  const planned = plannedDay(n) !== undefined || n.start !== undefined;
  return n.repeat && planned ? undefined : n.due;
}

/**
 * The dates a row shows, in order: a plan part (the chase of a waiting row, else its scheduled day,
 * else its start week), then a due part. A done row shows its completion only; a dropped row none,
 * so it never reads as overdue.
 */
export function dateParts(state: TaskState, d: Dated, today: string): DatePart[] {
  if (state === 'dropped') return [];
  if (state === 'done') {
    const done = d.completion ?? d.done;
    return done ? [{ iso: done, part: { text: doneText(done, today) } }] : [];
  }
  const parts: DatePart[] = [];
  const chase = d.chase ?? d.scheduled;   // a note has `chase`; a line's chase date is its `scheduled`
  if (state === 'waiting' && chase) parts.push({ iso: chase, part: chaseText(chase, today) });
  else if (d.scheduled) parts.push({ iso: d.scheduled, part: plannedText(d.scheduled, today) });
  else if (d.start) parts.push({ iso: d.start, part: weekPlanText(d.start, today) });
  if (d.due) parts.push({ iso: d.due, part: dueText(d.due, today) });
  return parts;
}

// As in the mockup, the checkbox label carries only the overdue cue; other dates are read from the meta.
function ariaLabel(title: string, state: TaskState, dates: DatePart[]): string {
  const late = dates.find((d) => d.part.when === 'due' && d.part.tone === 'overdue');
  const overdue = late ? `, ${late.part.text}` : '';
  return title + overdue + (STATE_WORDS[state] ?? '');
}

/** Line states Brain may plan: a task line still to do or under way. A waiting line's `scheduled` is its chase date, so it is never planned. */
const PLANNABLE_LINE = new Set<TaskState>(['todo', 'doing']);

/** A row's planning dates: only the keys that are set. */
function planOf(d: { scheduled?: string; start?: string; due?: string }): PlanDates {
  const plan: PlanDates = {};
  if (d.scheduled !== undefined) plan.scheduled = d.scheduled;
  if (d.start !== undefined) plan.start = d.start;
  if (d.due !== undefined) plan.due = d.due;
  return plan;
}

/** A task note Brain may plan: open or doing. A story and a repeating note are such notes too: a repeating note's deadline stays whatever the plan. */
function plannableNote(n: NoteInfo): boolean {
  return n.status === undefined || n.status === 'open' || n.status === 'doing';
}

/** A task note's plan, the dates a row carries: undefined when Brain may not plan it (see plannableNote). */
export function notePlan(n: NoteInfo): PlanDates | undefined {
  return plannableNote(n) ? planOf(n) : undefined;
}

/** A story as a row: its note's row, with its progress over the lines that aren't dropped (the ring and the count), and its lines. */
export function storyRow(n: NoteInfo, today: string): RowVM {
  const counted = n.tasks.filter((t) => t.state !== 'dropped');
  return {
    ...noteRow(n, today),
    progress: { done: counted.filter((t) => t.state === 'done').length, total: counted.length },
    lines: storyLines(n, today),
    ...(n.points !== undefined ? { points: n.points } : {}),
  };
}

/** A story's lines as its card shows them: all of them, file order. A line's note name is left out, and a done line has no date. */
export function storyLines(n: NoteInfo, today: string): RowVM[] {
  return n.tasks.map((t) => {
    const row = lineRow(t, n, today, { meta: 'none', draggable: false });
    return t.state === 'done' ? { ...row, meta: [] } : row;
  });
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
