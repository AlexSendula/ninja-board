import type { NoteInfo, RowVM, TaskLine, TodayVM, VaultSnapshot } from './types.ts';
import type { DatePart } from './rows.ts';
import { occurrencesOn } from './appointments.ts';
import { longDate, weekdayLong } from './dates.ts';
import { countedDue, dateParts, lineRow, noteRow, plannedDay } from './rows.ts';
import { compareText, earliest, onOrBefore, UNDATED } from './order.ts';

const TASK_HOLDERS = new Set(['project', 'area', 'task']);
const RESTING = new Set(['paused', 'someday', 'done', 'dropped']);

export function buildToday(s: VaultSnapshot, today: string): TodayVM {
  const live = liveNotes(s);
  const now = nowRows(live, today);
  const due = dueRows(live, today);
  const done = doneRows(s, today);
  return {
    label: weekdayLong(today).toUpperCase(),
    title: longDate(today),
    left: now.length + due.length,
    doneToday: done.length,
    now,
    today: due,
    schedule: occurrencesOn(s, today),
    doneRows: done,
  };
}

/**
 * Project, area and task notes in play: not paused, someday, done or dropped,
 * and not inside a project that is.
 */
export function liveNotes(s: VaultSnapshot): NoteInfo[] {
  const byPath = new Map(s.notes.map((n) => [n.path, n]));
  const resting = (n: NoteInfo | undefined) => n?.status !== undefined && RESTING.has(n.status);
  return s.notes.filter((n) => {
    const project = n.projectPath ? byPath.get(n.projectPath) : undefined;
    return TASK_HOLDERS.has(n.type) && !resting(n) && !resting(project);
  });
}

/**
 * Doing lines, then doing task notes, soonest date first, undated last. A repeating note stays out,
 * and a story with doing lines of its own is already there through them.
 */
function nowRows(live: NoteInfo[], today: string): RowVM[] {
  const lines = linesWhere(live, (t) => t.state === 'doing')
    .map(({ t, n }) => ({ date: earliest(t.due, t.scheduled), row: todayLineRow(t, n, today) }));
  const notes = live
    .filter((n) => n.type === 'task' && n.status === 'doing' && !n.repeat && !n.tasks.some((t) => t.state === 'doing'))
    .map((n) => ({ date: earliest(n.due, n.scheduled), row: todayNoteRow(n, today) }));
  return [...lines, ...notes].sort((a, b) => compareText(a.date, b.date)).map((item) => item.row);
}

/**
 * Open lines due, planned or chased today or earlier, then task notes that are.
 * Overdue ones move to the top, oldest due first; the rest keep their order.
 */
function dueRows(live: NoteInfo[], today: string): RowVM[] {
  const lines = linesWhere(live, (t) => lineIsDue(t, today))
    .map(({ t, n }) => ({ due: t.due, row: todayLineRow(t, n, today) }));
  const notes = live.filter((n) => n.type === 'task' && noteIsDue(n, today))
    .map((n) => ({ due: countedDue(n), row: todayNoteRow(n, today) }));
  const overdueKey = (due: string | undefined) => (due !== undefined && due < today ? due : UNDATED);
  return [...lines, ...notes]
    .sort((a, b) => compareText(overdueKey(a.due), overdueKey(b.due)))
    .map((item) => item.row);
}

/** Lines completed today and task notes done today, whatever their note's status now. */
function doneRows(s: VaultSnapshot, today: string): RowVM[] {
  const holders = s.notes.filter((n) => TASK_HOLDERS.has(n.type));
  const lines = linesWhere(holders, (t) => t.state === 'done' && t.completion === today)
    .map(({ t, n }) => todayLineRow(t, n, today));
  const notes = holders.filter((n) => n.type === 'task' && n.status === 'done' && n.done === today)
    .map((n) => todayNoteRow(n, today));
  return [...lines, ...notes];
}

/** Real task lines, not pointers to a story, that pass `keep`, with their note. */
function linesWhere(notes: NoteInfo[], keep: (t: TaskLine) => boolean): { t: TaskLine; n: NoteInfo }[] {
  return notes.flatMap((n) => n.tasks.filter((t) => !t.isPointer && keep(t)).map((t) => ({ t, n })));
}

function lineIsDue(t: TaskLine, today: string): boolean {
  const open = t.state === 'todo' || t.state === 'waiting';
  return open && (onOrBefore(t.due, today) || onOrBefore(t.scheduled, today));
}

/** Open or waiting task notes (repeating ones too) due or planned by today; a waiting note is planned on its chase date. */
function noteIsDue(n: NoteInfo, today: string): boolean {
  const open = n.status === undefined || n.status === 'open' || n.status === 'waiting';
  return open && (onOrBefore(countedDue(n), today) || onOrBefore(plannedDay(n), today));
}

// On the Today view a plan or a done date that is today goes without saying; a deadline today stays.
function todayLineRow(t: TaskLine, n: NoteInfo, today: string): RowVM {
  const row = lineRow(t, n, today);
  return withoutToday(row, dateParts(row.state, t, today), today);
}

function todayNoteRow(n: NoteInfo, today: string): RowVM {
  const row = noteRow(n, today);
  return withoutToday(row, dateParts(row.state, n, today), today);
}

function withoutToday(row: RowVM, dates: DatePart[], today: string): RowVM {
  const gone = new Set(dates.filter((d) => d.iso === today && d.part.when !== 'due').map((d) => d.part.text));
  if (gone.size === 0) return row;
  return { ...row, meta: row.meta.filter((p) => !gone.has(p.text)) };
}
