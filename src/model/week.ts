import type {
  Arrangement, BoardItem, ComingUpVM, DayVM, MetaPart, NoteInfo, PointsVM, RowVM, StoryCardVM, TaskLine, TaskState, ThisWeekVM,
  PastWeekVM, RawNote, VaultSnapshot, WeekHeadVM, WeekVM,
} from './types.ts';
import { addDays, dayMonth, dueText, isoWeek, leadDays, longDate, weekdayLong } from './dates.ts';
import { displayText, FIRST_LINK } from './taskLine.ts';
import { countedDue, lineRow, noteRow, notePlan, occurrenceRow, plannedDay, storyLines } from './rows.ts';
import { occurrencesOn } from './appointments.ts';
import { upcomingWeek, weekCount } from './upcoming.ts';
import { notesWeek, recordWeek } from './past.ts';
import { parseWeekRecord } from './record.ts';
import { compareText, earliest, onOrBefore, UNDATED } from './order.ts';
import { arrange, arrangeByChase, lineKey } from './arrange.ts';
import { DEFAULT_TARGET, pointsOfWeek } from './points.ts';

type Column = 'todo' | 'doing' | 'waiting' | 'done';
/** A week: its Monday and its Sunday, ISO. */
export type Week = { start: string; end: string };
/** Sort key: overdue first (0), then date, then due before planned (0), then file order (path, line). */
type Key = [number, string, number, string, number];
interface Entry { column: Column; key: Key; item: BoardItem }
interface Loose { t: TaskLine; n: NoteInfo }
interface Story { n: NoteInfo; column: Column }

const OPEN_LINE = new Set<TaskState>(['todo', 'doing', 'waiting']);
const OPEN_NOTE = new Set(['open', 'doing', 'waiting']);

/** What the Week view passes besides the snapshot. */
export interface WeekInput {
  plan?: RawNote;          // the shown week's plan note, when it exists: only a past week reads it, for its record
  start?: string;          // any day of the week to show; the default is today's week
  arrange?: Arrangement;   // the view's arrange: lists; this week's To do and Doing follow theirs
  target?: number;        // points_per_week from the config: the week's points target (8 when absent)
}

export function buildWeek(s: VaultSnapshot, today: string, input: WeekInput = {}): WeekVM {
  // The week that holds input.start, today's by default: this week, a later one (a preview) or an earlier one.
  const now = isoWeek(today).start;
  const w = isoWeek(input.start ?? today);
  const head: Omit<WeekHeadVM, 'days'> = {
    label: 'WEEK ' + w.week,
    title: weekTitle(w),
    start: w.start,
    today,
    pager: { prev: addDays(w.start, -7), next: addDays(w.start, 7), ...(w.start === now ? {} : { thisWeek: now }) },
  };
  const target = input.target ?? DEFAULT_TARGET;
  if (w.start > now) return upcomingWeek(s, today, head, target);
  if (w.start < now) return pastWeek(s, today, head, input.plan, target);
  return thisWeek(s, today, input, head);
}

/** A past week: its week plan's record when the plan has one, else what the notes say now. */
function pastWeek(s: VaultSnapshot, today: string, head: Omit<WeekHeadVM, 'days'>, plan: RawNote | undefined, target: number): PastWeekVM {
  const record = plan && parseWeekRecord(plan);
  const vm = record ? recordWeek(s, today, head, record) : notesWeek(s, today, head);
  // The points a record holds are read-only; its target is the config's, as the week's is.
  return record?.points ? { ...vm, points: { ...record.points, target } } : vm;
}

/** Today's week: the live board, its counts and days, and Coming up. */
function thisWeek(s: VaultSnapshot, today: string, input: WeekInput, head: Omit<WeekHeadVM, 'days'>): ThisWeekVM {
  const w = isoWeek(today);
  const notes = eligibleNotes(s);
  const loose = looseLines(notes, w);
  const areaNotes = areaTaskNotes(notes, w);
  const stories = boardStories(notes, w);
  // The counts use exactly what the board shows: these lines, and these notes' own dates.
  const lines = [...loose.map(({ t }) => t), ...stories.flatMap(({ n }) => n.tasks.filter((t) => !t.isPointer))];
  const dated = [...areaNotes, ...stories.map(({ n }) => n)];
  const occurred = occurredIn(notes, w);
  const columns = board(loose, areaNotes, stories, occurred, today, input.arrange?.waiting);
  const points = pointsOfWeek(stories.map(({ n, column }) => ({ points: n.points, done: column === 'done' })), input.target ?? DEFAULT_TARGET);
  return withPoints({
    kind: 'this',
    ...head,
    comingUp: comingUp(s, today, w.start),
    left: lines.filter(isOpenLine).length + areaNotes.filter(isOpenNote).length,
    done: lines.filter((t) => t.state === 'done' && within(t.completion, w)).length
      + areaNotes.filter((n) => n.status === 'done').length + occurred.length,
    days: Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(w.start, i);
      return weekDay(s, iso, today, { ...countsOn(lines, dated, iso), done: 0 });
    }),
    columns: {
      todo: arrange(columns.todo, input.arrange?.todo),
      doing: arrange(columns.doing, input.arrange?.doing),
      waiting: columns.waiting,   // already in its order: see board()
      done: columns.done,   // Done keeps its time order: it is never arranged
    },
    saved: {
      ...(input.arrange?.todo && { todo: input.arrange.todo }),
      ...(input.arrange?.doing && { doing: input.arrange.doing }),
      ...(input.arrange?.waiting && { waiting: input.arrange.waiting }),
    },
  }, points);
}

/** A week's view model with its points, when it has any: none keeps the key out of the model. */
export function withPoints<T extends object>(vm: T, points: PointsVM | undefined): T & { points?: PointsVM } {
  return points === undefined ? vm : { ...vm, points };
}

/**
 * Projects with one of the given statuses (active by default), areas, and task notes inside
 * such a project or an area. Backlog also asks for paused projects.
 */
export function eligibleNotes(s: VaultSnapshot, statuses: string[] = ['active']): NoteInfo[] {
  const live = new Set(
    s.notes.filter((n) => n.type === 'project' && n.status !== undefined && statuses.includes(n.status)).map((n) => n.path),
  );
  return s.notes.filter((n) => {
    if (n.type === 'project') return live.has(n.path);
    if (n.type === 'area') return true;
    if (n.type !== 'task') return false;
    return n.projectPath !== undefined ? live.has(n.projectPath) : n.areaPath !== undefined;
  });
}

/** "12–18 October", or "28 Sep – 4 Oct" across two months. */
function weekTitle(w: Week): string {
  if (w.start.slice(0, 7) === w.end.slice(0, 7)) return `${Number(w.start.slice(8))}–${longDate(w.end)}`;
  return `${dayMonth(w.start)} – ${dayMonth(w.end)}`;
}

/** The three weeks after this one, each with its count of what is planned or due in it. */
function comingUp(s: VaultSnapshot, today: string, start: string): ComingUpVM[] {
  return [1, 2, 3].map((n) => {
    const monday = addDays(start, 7 * n);
    return { start: monday, week: isoWeek(monday).week, count: weekCount(s, today, monday) };
  });
}

/** One day's counts on this week's board: Task 5's planned and due counts, as the object weekDay takes. */
function countsOn(lines: TaskLine[], dated: NoteInfo[], iso: string): { planned: number; due: number } {
  return { planned: plannedOn(lines, dated, iso), due: dueOn(lines, dated, iso) };
}

/** A day of any week's strip: its appointments, and the counts that kind of week gives it. */
export function weekDay(
  s: VaultSnapshot, iso: string, today: string, counts: { planned: number; due: number; done: number },
): DayVM {
  const weekday = weekdayLong(iso);
  return {
    iso,
    weekdayShort: weekday.slice(0, 3),
    initial: weekday.charAt(0),
    dayNum: Number(iso.slice(8)),
    isToday: iso === today,
    isPast: iso < today,
    events: occurrencesOn(s, iso),
    planned: counts.planned,
    due: counts.due,
    done: counts.done,
  };
}

/** Open items planned that day: a line's scheduled date (a waiting line's is its chase), a note's plannedDay. A week plan counts on no day. */
function plannedOn(lines: TaskLine[], dated: NoteInfo[], iso: string): number {
  return lines.filter((t) => isOpenLine(t) && t.scheduled === iso).length
    + dated.filter((n) => isOpenNote(n) && plannedDay(n) === iso).length;
}

/** Open items due that day: a line's or a note's deadline. */
function dueOn(lines: TaskLine[], dated: NoteInfo[], iso: string): number {
  return lines.filter((t) => isOpenLine(t) && t.due === iso).length
    + dated.filter((n) => isOpenNote(n) && countedDue(n) === iso).length;
}

/** The loose-line notes' lines that are in this week: see lineInWeek. */
function looseLines(notes: NoteInfo[], w: Week): Loose[] {
  return notes
    .filter(holdsLooseLines)
    .flatMap((n) => n.tasks.filter((t) => !t.isPointer && lineInWeek(t, w)).map((t) => ({ t, n })));
}

/**
 * Task notes shown as rows: those outside projects, and repeating ones wherever they sit (a repeating note is never a
 * story). In this week by the rule (noteInWeek). Brain ticks these rows like any other, and they drag to any column.
 */
function areaTaskNotes(notes: NoteInfo[], w: Week): NoteInfo[] {
  return notes.filter((n) => n.type === 'task' && !isStory(n) && noteInWeek(n, w));
}

/** Every story of an active project, repeating notes apart (eligibleNotes already dropped the other projects' stories). */
function boardStories(notes: NoteInfo[], w: Week): Story[] {
  return notes.flatMap((n) => {
    if (n.type !== 'task' || !isStory(n)) return [];
    const column = storyColumn(n, w);
    return column ? [{ n, column }] : [];
  });
}

/**
 * A story's column on this week's board, or none when it is in no week. An open story is in the week by its own
 * dates, or when one of its open lines is: its lines show on its card, so a line planned this week brings its story
 * here. A done line does not: a story with no date of its own and no open dated line is in no week, whatever its
 * status (No date lists it). A done story is in the week it was done.
 */
function storyColumn(n: NoteInfo, w: Week): Column | undefined {
  if (n.status === 'done') return noteInWeek(n, w) ? 'done' : undefined;
  const column = OPEN_STORY_COLUMN[n.status ?? ''];
  if (column === undefined) return undefined;
  return storyInWeek(n, w) ? column : undefined;
}

/** An open story in this week: by its own dates, or by one of its open lines (its lines show on its card). Carried over included, unless `carried` is false. */
export function storyInWeek(n: NoteInfo, w: Week, carried = true): boolean {
  return noteInWeek(n, w, carried) || n.tasks.some((t) => isOpenLine(t) && lineInWeek(t, w, carried));
}

/**
 * The stories a week holds, each with whether it is done in that week: an open one in it (by storyInWeek), and a done one
 * done in it. `carried` is whether an item still open from an earlier week counts (this week does; a later week does not).
 */
export function storiesIn(notes: NoteInfo[], w: Week, carried: boolean): { n: NoteInfo; done: boolean }[] {
  return notes.filter(isStory).flatMap((n): { n: NoteInfo; done: boolean }[] => {
    if (n.status === 'done') return noteInWeek(n, w) ? [{ n, done: true }] : [];
    return OPEN_STORY_COLUMN[n.status ?? ''] !== undefined && storyInWeek(n, w, carried) ? [{ n, done: false }] : [];
  });
}

const OPEN_STORY_COLUMN: Record<string, Column | undefined> = { open: 'todo', doing: 'doing', waiting: 'waiting' };

/** The dates that can put an open item in a week. planned: its do day, or a waiting item's chase date. */
export interface Dates { due?: string; planned?: string; start?: string; lead?: string }

/** A line's dates: its deadline, its planned day (a waiting line's chase), its week plan. */
export function lineDates(t: TaskLine): Dates {
  return { due: t.due, planned: t.scheduled, start: t.start };
}

/** A task note's dates: as a line's, with the lead time, which only task notes carry. A repeating note's deadline counts only without a plan (countedDue). */
export function noteDates(n: NoteInfo): Dates {
  return { due: countedDue(n), planned: plannedDay(n), start: n.start, lead: n.lead };
}

/** No date of any kind. Such an open item is in no week; Backlog's No date lists it. */
export function undated(d: Dates): boolean {
  return d.due === undefined && d.planned === undefined && d.start === undefined;
}

/**
 * A story with no date to plan: none of its own, and no open line with one (a dated open line puts the story in its week,
 * through the line; the line is planned, so the story is not listed as undated). A done line is neither.
 */
export function undatedStory(n: NoteInfo): boolean {
  return undated(noteDates(n)) && !n.tasks.some((t) => !t.isPointer && isOpenLine(t) && !undated(lineDates(t)));
}

/**
 * THE RULE for an open item (to do, doing or waiting) and a week (weeks design, Part 1, section 2). It is in the week
 * when a date of its falls in it: its do date (planned, or start), its deadline (due), its lead window (from due minus
 * lead, up to due), or its chase (planned, while it waits). A repeating note counts by its plan when it has one, else by its due.
 * An open item dated before the week is still open, so it carries in (carried: this week, and To plan's Still open).
 * Without carry, for a later week previewed, only dates in the week count, and a lead window that overlaps it.
 */
export function openInWeek(d: Dates, w: Week, carried: boolean): boolean {
  const lead = leadWindow(d);
  if (carried) return [d.due, d.planned, d.start, lead?.from].some((iso) => onOrBefore(iso, w.end));
  const inside = [d.due, d.planned, d.start].some((iso) => within(iso, w));
  return inside || (lead !== undefined && lead.from <= w.end && lead.to >= w.start);
}

/** A task note's lead window: from `from` (its due minus its lead time) up to `to` (its due). Undefined without both. */
function leadWindow(d: Dates): { from: string; to: string } | undefined {
  if (d.due === undefined || d.lead === undefined) return undefined;
  const days = leadDays(d.lead);
  return days === undefined ? undefined : { from: addDays(d.due, -days), to: d.due };
}

/** A line in this week: open by the rule (carried over included, unless `carried` is false), or done in it. */
export function lineInWeek(t: TaskLine, w: Week, carried = true): boolean {
  return isOpenLine(t) ? openInWeek(lineDates(t), w, carried) : t.state === 'done' && within(t.completion, w);
}

/** A task note in this week: open by the rule (carried over included, unless `carried` is false), or done in it. */
export function noteInWeek(n: NoteInfo, w: Week, carried = true): boolean {
  return isOpenNote(n) ? openInWeek(noteDates(n), w, carried) : n.status === 'done' && within(n.done, w);
}

/** Each state's column: Waiting has its own, as the Week board's Waiting column does. */
function columnOf(state: TaskState): Column {
  return state === 'done' ? 'done' : state === 'doing' ? 'doing' : state === 'waiting' ? 'waiting' : 'todo';
}

/**
 * Each column: rows first, then cards, each group by sort key. Waiting is the exception: its rows and cards share one
 * chase order, so the earliest chase leads whichever kind of item it is, and its saved order (`waitingKeys`) applies over it.
 */
function board(
  loose: Loose[], areaNotes: NoteInfo[], stories: Story[], occurred: Occurred[], today: string, waitingKeys: readonly string[] | undefined,
): ThisWeekVM['columns'] {
  const rows: Entry[] = [
    ...loose.map(({ t, n }): Entry => {
      const column = columnOf(t.state);
      return {
        column,
        key: keyIn(column, { due: t.due, planned: t.scheduled, done: t.completion }, today, t.path, t.line),
        item: {
          kind: 'row',
          row: lineRow(t, n, today, { meta: 'parent', draggable: true }),
          arrangeKey: lineKey(n.name, t.text),
        },
      };
    }),
    ...areaNotes.map((n): Entry => {
      const row = { ...noteRow(n, today), draggable: true };   // every board row drags, a repeating one too: a drop on another column changes its state
      const column = columnOf(row.state);
      return {
        column,
        key: keyIn(column, { due: countedDue(n), planned: plannedDay(n), done: n.done }, today, n.path, 0),
        item: { kind: 'row', row, arrangeKey: n.name },
      };
    }),
  ];
  // A completed occurrence of a repeating note is a Done row, sorted by the day it was done like a done item.
  rows.push(...occurred.map(({ n, on, nth }): Entry => ({
    column: 'done',
    key: doneKey(on, n.path, 0),
    item: { kind: 'row', row: occurrenceRow(n, on, today, nth), arrangeKey: n.name },
  })));
  const cards = stories.map(({ n, column }): Entry => ({
    column,
    key: keyIn(column, { due: n.due, planned: plannedDay(n), done: n.done }, today, n.path, 0),
    item: { kind: 'card', card: storyCard(n, column, today), arrangeKey: n.name },
  }));
  const columns: ThisWeekVM['columns'] = { todo: [], doing: [], waiting: [], done: [] };
  const isWaiting = (e: Entry) => e.column === 'waiting';
  for (const e of [...sortByKey(rows.filter((r) => !isWaiting(r))), ...sortByKey(cards.filter((c) => !isWaiting(c)))]) columns[e.column].push(e.item);
  const waiting = sortByKey([...rows, ...cards].filter(isWaiting))
    .map((e) => ({ arrangeKey: e.item.arrangeKey, chase: e.key[1], item: e.item }));   // a waiting entry's key leads with its chase
  columns.waiting = arrangeByChase(waiting, waitingKeys, (w) => w.chase).map((w) => w.item);
  return columns;
}

/** A completed occurrence of a repeating note dated in the week: the note it belongs to, the day it was done, and its nth that day. */
interface Occurred { n: NoteInfo; on: string; nth: number }

/** The completed occurrences dated in the week, from the notes' Log sections. */
function occurredIn(notes: NoteInfo[], w: Week): Occurred[] {
  return notes.flatMap((n) => (n.occurrences ?? []).filter((o) => within(o.on, w)).map((o): Occurred => ({ n, on: o.on, nth: o.nth ?? 1 })));
}

function storyCard(n: NoteInfo, column: Column, today: string): StoryCardVM {
  const counted = n.tasks.filter((t) => t.state !== 'dropped');
  const plan = notePlan(n);
  return {
    key: n.path,
    path: n.path,
    title: n.name,
    column,
    meta: storyMeta(n, today),
    done: counted.filter((t) => t.state === 'done').length,
    total: counted.length,
    rows: storyLines(n, today),
    ...(plan ? { plan } : {}),
    ...(n.points !== undefined ? { points: n.points } : {}),
  };
}

function storyMeta(n: NoteInfo, today: string): MetaPart[] {
  const meta: MetaPart[] = [];
  if (n.status === 'waiting') meta.push({ text: waitingOn(n), tone: 'strong' });
  if (n.parentName !== undefined) meta.push({ text: n.parentName });
  if (n.due !== undefined && n.status !== 'done') meta.push(dueText(n.due, today));
  return meta;
}

/** "Waiting on Bram": the story's `waiting_on`, else the first link of its first waiting line, by its alias or name. */
export function waitingOn(n: NoteInfo): string {
  if (n.waitingOn) return 'Waiting on ' + n.waitingOn;
  const text = n.tasks.find((t) => t.state === 'waiting')?.text ?? '';
  const link = FIRST_LINK.exec(text);
  return link ? 'Waiting on ' + displayText(link[0]) : 'Waiting';
}

/** An item's sort key in its column: Waiting by its chase, Done by when it was done, the rest by due, then planned. */
function keyIn(
  column: Column, d: { due?: string; planned?: string; done?: string }, today: string, path: string, line: number,
): Key {
  if (column === 'waiting') return chaseKey(d.planned, path, line);
  if (column === 'done') return doneKey(d.done, path, line);
  return openKey(d.due, d.planned, today, path, line);
}

/** Waiting's order: the earliest chase first, so an overdue one leads on its date alone; no chase goes last. */
function chaseKey(chase: string | undefined, path: string, line: number): Key {
  return [0, chase ?? UNDATED, 0, path, line];
}

function openKey(due: string | undefined, scheduled: string | undefined, today: string, path: string, line: number): Key {
  const date = earliest(due, scheduled);
  return [due !== undefined && due < today ? 0 : 1, date, date === due ? 0 : 1, path, line];
}

function doneKey(done: string | undefined, path: string, line: number): Key {
  return [1, done ?? UNDATED, 0, path, line];
}

function sortByKey(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => compareKeys(a.key, b.key));
}

function compareKeys(a: Key, b: Key): number {
  return a[0] - b[0] || compareText(a[1], b[1]) || a[2] - b[2] || compareText(a[3], b[3]) || a[4] - b[4];
}

/** A story: a task note in a project, not repeating. Its lines sit on its card; a repeating note is a row, like any other. */
export function isStory(n: NoteInfo): boolean {
  return n.projectPath !== undefined && !n.repeat;
}

/** Whether the note at `path` is a story in this snapshot. Only stories take points (deviation 5): not an area's task note. */
export function isStoryAt(s: VaultSnapshot, path: string): boolean {
  return s.notes.some((n) => n.path === path && n.type === 'task' && isStory(n));
}

/**
 * The notes whose checkbox lines are loose rows: projects and areas, and open task notes that are not stories
 * (a task note's lines count as an area's do; Today and Waiting already read them).
 */
export function holdsLooseLines(n: NoteInfo): boolean {
  if (n.type === 'project' || n.type === 'area') return true;
  return n.type === 'task' && !isStory(n) && isOpenNote(n);
}

export function isOpenLine(t: TaskLine): boolean {
  return OPEN_LINE.has(t.state);
}

export function isOpenNote(n: NoteInfo): boolean {
  return OPEN_NOTE.has(n.status ?? '');
}

export function within(iso: string | undefined, w: Week): iso is string {
  return iso !== undefined && iso >= w.start && iso <= w.end;
}
