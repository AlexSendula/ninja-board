import type {
  EventVM, MetaPart, NoteInfo, PastWeekVM, RecordRowVM, TaskLine, TaskState, VaultSnapshot, WeekHeadVM,
} from './types.ts';
import type { RecordItem, WeekRecord } from './record.ts';
import { addDays, shortDate, weekWord } from './dates.ts';
import { displayText } from './taskLine.ts';
import { noteRow, occurrenceKey } from './rows.ts';
import { compareText } from './order.ts';
import { openItems } from './upcoming.ts';
import { weekDay, within } from './week.ts';

type Week = { start: string; end: string };
/** A row with the date it is shown on, and its place in the file, for sorting and the day counts. */
interface Dated { iso: string; path: string; line: number; row: RecordRowVM }

const HOLDERS = new Set(['project', 'area', 'task']);

/**
 * A past week without a record, from what the notes say now. Done: what was finished that week, in any note still
 * outside the archive. Not done: what is still open and was due, planned or starting that week. Read-only.
 */
export function notesWeek(s: VaultSnapshot, today: string, head: Omit<WeekHeadVM, 'days'>): PastWeekVM {
  const w = { start: head.start, end: addDays(head.start, 6) };
  const done = byDate(doneRows(s, w));
  const open = byDate(notDoneRows(s, today, w));
  return {
    kind: 'past',
    ...head,
    days: Array.from({ length: 7 }, (_, i) => addDays(w.start, i))
      .map((iso) => weekDay(s, iso, today, { planned: 0, due: 0, done: done.filter((d) => d.iso === iso).length })),
    source: [{ text: 'From your notes' }],
    done: done.length,
    columns: [
      { title: 'Not done', empty: 'Nothing left open', rows: open.map((d) => d.row) },
      { title: 'Done', empty: 'Nothing done that week', rows: done.map((d) => d.row) },
    ],
  };
}

/**
 * Lines completed that week in any project, area or task note, task notes done that week, and each completed occurrence
 * of a repeating note that the week's Log sections date in it.
 */
function doneRows(s: VaultSnapshot, w: Week): Dated[] {
  const holders = s.notes.filter((n) => HOLDERS.has(n.type));
  const lines = holders.flatMap((n) => n.tasks.flatMap((t): Dated[] => {
    if (t.isPointer || t.state !== 'done' || !within(t.completion, w)) return [];
    return [dated(t.completion, n, t, 'done', [{ text: n.name }, { text: 'Done ' + weekWord(t.completion, w.start) }])];
  }));
  const notes = holders.flatMap((n): Dated[] => {
    if (n.type !== 'task' || n.status !== 'done' || !within(n.done, w)) return [];
    return [dated(n.done, n, undefined, 'done', [...parentOf(n), { text: 'Done ' + weekWord(n.done, w.start) }])];
  });
  const occurred = holders.flatMap((n): Dated[] => (n.occurrences ?? [])
    .filter((o) => within(o.on, w))
    .map((o) => dated(o.on, n, undefined, 'done', [...parentOf(n), { text: 'Done ' + weekWord(o.on, w.start) }], occurrenceKey(n.path, o.on, o.nth))));
  return [...lines, ...notes, ...occurred];
}

/**
 * Open items with a date in the week, once each, with the word that says why: Due (its due date), else Chase or
 * Planned (its planned day), else Any day (a week plan, dated by its start). Each word carries its `when`.
 */
function notDoneRows(s: VaultSnapshot, today: string, w: Week): Dated[] {
  return openItems(s).flatMap((item): Dated[] => {
    const { n, t } = item;
    const due = within(item.due, w) ? item.due : undefined;
    const planned = within(item.planned, w) ? item.planned : undefined;
    const starts = within(item.start, w) ? item.start : undefined;
    const iso = due ?? planned ?? starts;
    if (iso === undefined) return [];
    const word: MetaPart = due !== undefined ? { text: `Due ${weekWord(due, w.start)}`, when: 'due' }
      : planned !== undefined ? { text: `${item.chases ? 'Chase' : 'Planned'} ${weekWord(planned, w.start)}`, when: 'plan' }
      : { text: 'Any day', when: 'plan' };
    const parent = t ? [{ text: n.name }] : parentOf(n);
    return [dated(iso, n, t, t ? t.state : noteRow(n, today).state, [...parent, word])];
  });
}

function dated(iso: string, n: NoteInfo, t: TaskLine | undefined, state: TaskState, meta: MetaPart[], key = t ? `${t.path}#${t.line}` : n.path): Dated {
  const row: RecordRowVM = {
    key,
    title: t ? displayText(t.text) : n.name,
    state,
    path: n.path,
    meta,
    inbox: false,
  };
  return { iso, path: n.path, line: t?.line ?? 0, row };
}

/** A task note's project or area, when it has one. */
function parentOf(n: NoteInfo): MetaPart[] {
  const parent = n.parentName ?? n.area;
  return parent ? [{ text: parent }] : [];
}

/** By the date shown, then path, then line. */
function byDate(rows: Dated[]): Dated[] {
  return rows.sort((a, b) => compareText(a.iso, b.iso) || compareText(a.path, b.path) || a.line - b.line);
}

// ---------- A past week from its record (Task 8) ----------

/** A leading "2026-10-08 " or "2026-10-12 2104 " in a note's name, as one-off appointments and inbox notes have. */
const DATED_NAME = /^\d{4}-\d{2}-\d{2} (\d{4} )?/;

/**
 * A past week as its week plan's record holds it, in the record's own words: read-only. The strip shows
 * the record's appointments and a done count per day. A title opens the note it names, while that exists.
 */
export function recordWeek(s: VaultSnapshot, today: string, head: Omit<WeekHeadVM, 'days'>, record: WeekRecord): PastWeekVM {
  const word = (iso: string): string => weekWord(iso, head.start);
  const row = (key: string, item: RecordItem, state: TaskState, parts: MetaPart[] = []): RecordRowVM => ({
    key,
    title: item.title,
    state,
    path: recordNote(s, item)?.path,
    meta: [...(item.context ? [{ text: item.context }] : []), ...parts],
    inbox: false,
  });
  const notDone = record.notDone.map((item, i) =>
    row(`notDone#${i}`, item, item.dropped ? 'dropped' : 'todo', notDoneParts(item, word)));
  const inProgress = record.inProgress.map((item, i) => row(`inProgress#${i}`, item, 'doing'));
  const done = record.done.map((item, i) =>
    row(`done#${i}`, item, 'done', item.day ? [{ text: 'Done ' + word(item.day) }] : []));
  const backlog = record.backlog.map((item, i) => ({ ...row(`backlog#${i}`, item, 'todo'), inbox: item.context === 'Inbox' }));
  return {
    kind: 'past',
    ...head,
    days: Array.from({ length: 7 }, (_, i) => addDays(head.start, i)).map((iso) => ({
      ...weekDay(s, iso, today, { planned: 0, due: 0, done: record.done.filter((item) => item.day === iso).length }),
      // The record's appointments, as they were that week, not the notes' as they are now.
      events: record.appointments
        .flatMap((item, n) => (item.day === iso ? [recordEvent(s, item, n)] : []))
        .sort((a, b) => compareText(a.start, b.start)),
    })),
    source: recordSource(record),
    done: done.length,
    total: done.length + inProgress.length + notDone.length,   // the Backlog was never the week's work
    columns: [
      { title: 'Not done', empty: 'Nothing left open', rows: notDone },
      { title: 'In progress', empty: 'Nothing in progress', rows: inProgress },
      { title: 'Done', empty: 'Nothing done that week', rows: done },
    ],
    backlog,
  };
}

/** Why it wasn't done: dropped, else moved out of the week, else due (a deadline, red), else its day. */
function notDoneParts(item: RecordItem, word: (iso: string) => string): MetaPart[] {
  if (item.dropped) return [{ text: 'dropped ' + word(item.dropped) }];
  if (item.moved) return [{ text: 'moved → ' + word(item.moved) }];
  if (item.due) return [{ text: 'Due ' + word(item.due), when: 'due' }];
  return item.day ? [{ text: word(item.day) }] : [];
}

/** "Record · frozen Mon 12 Oct", or "Record · updated …" before the freeze, or just "Record". */
function recordSource(record: WeekRecord): MetaPart[] {
  if (record.frozen) return [{ text: 'Record' }, { text: 'frozen ' + shortDate(record.frozen) }];
  if (record.updated) return [{ text: 'Record' }, { text: 'updated ' + shortDate(record.updated) }];
  return [{ text: 'Record' }];
}

/** A record appointment as a strip event. Its path is '' when no note matches, and the strip shows plain text. */
function recordEvent(s: VaultSnapshot, item: RecordItem, n: number): EventVM {
  const note = recordNote(s, item);
  const [start = '', end] = (item.time ?? '').split('-');
  return { key: `record@${n}`, path: note?.path ?? '', title: item.title, start, end, where: note?.where };
}

/**
 * The note a record item opens: the one named like its title, else one named like it after a leading
 * date (and time), that of the item's own day first, else the one named like its context. Undefined when
 * there is none any more.
 */
function recordNote(s: VaultSnapshot, item: RecordItem): NoteInfo | undefined {
  const named = (name: string): NoteInfo | undefined => s.notes.find((n) => n.name === name);
  const dated = s.notes.filter((n) => n.name.replace(DATED_NAME, '') === item.title);
  const ofDay = dated.find((n) => item.day !== undefined && n.name.slice(0, 10) === item.day);
  return named(item.title)
    ?? ofDay ?? dated[0]
    ?? (item.context === undefined ? undefined : named(item.context));
}
