import type { DayGroupVM, MetaPart, NoteInfo, RowVM, TaskLine, TaskState, UpcomingWeekVM, VaultSnapshot, WeekHeadVM } from './types.ts';
import { addDays, dayLabel } from './dates.ts';
import { countedDue, dateParts, lineRow, META_BREAK, noteRow, plannedDay, storyLines, storyRow } from './rows.ts';
import type { DatePart } from './rows.ts';
import { compareText } from './order.ts';
import {
  eligibleNotes, holdsLooseLines, isOpenLine, isOpenNote, isStory, lineDates, noteDates, openInWeek, storiesIn, storyInWeek,
  waitingOn, weekDay, within, withPoints,
} from './week.ts';
import { pointsOfWeek } from './points.ts';
import type { Dates, Week } from './week.ts';
import type { ToPlanVM } from './types.ts';
import { isoWeek } from './dates.ts';
import { buildWeek } from './week.ts';
import { buildBacklog } from './backlog.ts';

/** The group of the items with no day: a week plan, Any day. */
const ANY = 'any';

/** The line states To plan lists: to do and in progress. A waiting line is planned by its chase date, so it is left out. */
const LISTED_LINE = new Set<TaskState>(['todo', 'doing']);

/** The task note statuses To plan lists: open and in progress. A waiting note is planned by its chase date, so it is left out. */
const LISTED_NOTE = new Set(['open', 'doing']);

/** An open task that a week can list by its dates: a line of a project or area note, or a task note itself. */
export interface OpenItem {
  n: NoteInfo;
  t?: TaskLine;        // set: this line of n; unset: the task note n
  due?: string;
  planned?: string;    // a line's scheduled; a note's plannedDay (its chase while it waits)
  start?: string;      // a line's start; a note's start: planned for a week, any day
  lead?: string;       // a task note's lead time: its lead window opens this long before its due
  chases: boolean;     // planned is a chase date: a waiting line, or a waiting note without waiting lines of its own
}

/** The dates that put an item in a week, as the rule reads them (week.ts). */
function itemDates(item: OpenItem): Dates {
  return { due: item.due, planned: item.planned, start: item.start, lead: item.lead };
}

/** An item in its group of a week: a day (its ISO date), or Any day (group ANY). */
interface Placed { item: OpenItem; group: string }

/**
 * An upcoming week: its strip, what is planned or due, and To plan. A row the week shows is draggable
 * when Brain may plan it (its `plan` is set).
 */
export function upcomingWeek(s: VaultSnapshot, today: string, head: Omit<WeekHeadVM, 'days'>, target: number): UpcomingWeekVM {
  const vm = previewWeek(s, today, head);
  const byDay = vm.byDay.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, draggable: r.plan !== undefined })) }));
  // The points of the stories the week holds by the placement rule: nothing carries into a later week.
  const stories = storiesIn(eligibleNotes(s), weekOf(head.start), false);
  const points = pointsOfWeek(stories.map(({ n, done }) => ({ points: n.points, done })), target);
  return withPoints({ ...vm, byDay, toPlan: toPlanOf(s, today, head.start) }, points);
}

/** The strip and what is planned or due, before To plan: Task 6's upcomingWeek, unchanged apart from its name and return type. */
function previewWeek(s: VaultSnapshot, today: string, head: Omit<WeekHeadVM, 'days'>): Omit<UpcomingWeekVM, 'toPlan'> {
  const placed = placements(s, head.start);
  const w = weekOf(head.start);
  const open = openItems(s);
  const groups = new Map<string, RowVM[]>();
  for (const p of placed) groups.set(p.group, [...(groups.get(p.group) ?? []), placedRow(p, today)]);
  return {
    kind: 'upcoming',
    ...head,
    tally: { inWeek: placed.length, due: placed.filter(({ item }) => ownDeadline(item, w)).length },
    // A day's counts come from every open item on its day, not from the placements: an item can count on two days.
    days: Array.from({ length: 7 }, (_, i) => addDays(head.start, i)).map((iso) => weekDay(s, iso, today, {
      planned: open.filter((o) => o.planned === iso).length,
      due: open.filter((o) => o.due === iso).length,
      done: 0,
    })),
    planned: placed.length,
    byDay: [...groups].map(([group, rows]): DayGroupVM => (group === ANY
      ? { label: 'Any day', rows }
      : { iso: group, label: dayLabel(group), rows })),
  };
}

/**
 * Coming up's count for the week that starts on `start`: what is planned or due in it, Any day included and each
 * item once, plus its one-off appointments. Weekly repeating appointments are left out: they would add the same to
 * every week.
 */
export function weekCount(s: VaultSnapshot, today: string, start: string): number {
  const w = weekOf(start);
  const oneOff = s.notes.filter((n) => n.type === 'appointment' && !n.repeat && within(n.date, w));
  return placements(s, start).length + oneOff.length;
}

/**
 * Open lines of the loose-line notes (projects, areas, open task notes that are not stories), and the open task
 * notes (stories, area task notes, repeating ones). A story's own lines are tasks as much as a project's.
 */
export function openItems(s: VaultSnapshot): OpenItem[] {
  return eligibleNotes(s).flatMap((n): OpenItem[] => {
    if (n.type === 'task') {
      if (!isOpenNote(n)) return [];
      const chases = n.status === 'waiting' && !n.tasks.some((t) => t.state === 'waiting');
      const note: OpenItem = { n, due: countedDue(n), planned: plannedDay(n), start: n.start, lead: n.lead, chases };
      return [note, ...openLines(n)];
    }
    return openLines(n);
  });
}

/** A note's open checkbox lines, pointer lines apart. */
function openLines(n: NoteInfo): OpenItem[] {
  return n.tasks
    .filter((t) => !t.isPointer && isOpenLine(t))
    .map((t) => ({ n, t, due: t.due, planned: t.scheduled, start: t.start, chases: t.state === 'waiting' }));
}

/**
 * Every open item the week holds, once, by the rule (week.ts's openInWeek, without carry: a later week holds what is
 * planned or due in it, and a lead window that overlaps it). An item whose start falls in the week, and whose planned
 * day does not, goes to Any day; any other sits on the earliest of its due and planned days in the week, due winning a
 * tie; an item only its lead window puts here goes to Any day too. Groups in order: Any day, then the days; inside a
 * group, lines before notes, then path, then line.
 */
/** The Monday-to-Sunday span of the week that starts on `start`. */
function weekOf(start: string): Week {
  return { start, end: addDays(start, 6) };
}

/**
 * Whether a placed item counts as due in the week: its own deadline is in it. A line inside a story does not: the story
 * is the item that has a deadline, and its line's would count the same work twice.
 */
function ownDeadline({ n, t, due }: OpenItem, w: Week): boolean {
  return within(due, w) && !(t !== undefined && isStory(n));
}

function placements(s: VaultSnapshot, start: string): Placed[] {
  const w = weekOf(start);
  return openItems(s)
    .flatMap((item): Placed[] => {
      if (!openInWeek(itemDates(item), w, false)) return [];
      if (within(item.start, w) && !within(item.planned, w)) return [{ item, group: ANY }];
      const due = within(item.due, w) ? item.due : undefined;
      const planned = within(item.planned, w) ? item.planned : undefined;
      if (due !== undefined && (planned === undefined || due <= planned)) return [{ item, group: due }];
      return [{ item, group: planned ?? ANY }];
    })
    .sort((a, b) => compareText(groupKey(a.group), groupKey(b.group))
      || Number(a.item.t === undefined) - Number(b.item.t === undefined)
      || compareText(a.item.n.path, b.item.n.path)
      || (a.item.t?.line ?? 0) - (b.item.t?.line ?? 0));
}

/** Any day sorts before every date. */
function groupKey(group: string): string {
  return group === ANY ? '' : group;
}

/**
 * A placed row. A line: its note's name, then its date parts. A story (a task note in a project, not repeating): its
 * waiting person, its project, its date parts, and its progress over the lines that aren't dropped. Any other task
 * note: its parent, its date parts, and its second meta line when it repeats.
 */
function placedRow({ item, group }: Placed, today: string): RowVM {
  const { n, t } = item;
  const row = t ? lineRow(t, n, today) : noteRow(n, today);
  // A note's dates are the ones its planned day gives (plannedDay): a story's frontmatter chase, behind its own waiting lines, does not show.
  const dates = t ?? {
    due: n.due,
    start: n.start,
    chase: item.chases ? item.planned : undefined,
    scheduled: item.chases ? undefined : item.planned,
  };
  const parts = headed(dateParts(row.state, dates, today), { item, group });
  if (t) return { ...row, meta: [{ text: n.name }, ...parts] };
  if (isStory(n)) {
    const counted = n.tasks.filter((l) => l.state !== 'dropped');
    const meta: MetaPart[] = [];
    if (n.status === 'waiting') meta.push({ text: waitingOn(n), tone: 'strong' });
    if (n.parentName !== undefined) meta.push({ text: n.parentName });
    return {
      ...row,
      meta: [...meta, ...parts],
      progress: { done: counted.filter((l) => l.state === 'done').length, total: counted.length },
      lines: storyLines(n, today),
      ...(n.points !== undefined ? { points: n.points } : {}),
    };
  }
  const parent = n.parentName ?? n.area;
  const repeat = row.meta.findIndex((p) => p.text === META_BREAK);   // a repeating note's second meta line, from noteRow
  return {
    ...row,
    meta: [
      ...(parent ? [{ text: parent }] : []),
      ...parts,
      ...(repeat < 0 ? [] : row.meta.slice(repeat)),
    ],
  };
}

/**
 * A placed row's date parts under its group's heading. A part dated the group's day reads just its word: "Due", or
 * "Chase" when it is the item's chase, else "Planned". Under Any day the week plan reads "Planned". Every other part
 * keeps its own words ("Planned · Due Fri").
 */
function headed(parts: DatePart[], { item, group }: Placed): MetaPart[] {
  return parts.map(({ iso, part }): MetaPart => {
    if (part.when === 'due' && iso === group) return { text: 'Due', when: 'due' };
    const onGroup = group === ANY ? iso === item.start : iso === group;
    if (part.when === 'plan' && onGroup) {
      return { text: item.chases && iso === item.planned ? 'Chase' : 'Planned', when: 'plan' };
    }
    return part;
  });
}

/** A task To plan may list: its key, its place in the file, the dates the rule reads, and its row. */
interface Candidate {
  key: string; path: string; line: number;
  dates: Dates;
  carried: boolean;   // in this week's board by the rule, carried over included (a story: by its own dates or an open line)
  row: RowVM;
}

/** To plan for the shown upcoming week `start`: Still open this week, Due soon, and No date (Backlog's). */
function toPlanOf(s: VaultSnapshot, today: string, start: string): ToPlanVM {
  const thisWeek = isoWeek(today);
  const shownSunday = addDays(start, 6);
  const tasks = candidates(s, today);
  const open = stillOpen(s, today, tasks.filter((c) => isStillOpen(c, thisWeek)));
  // Due soon is the rest: an item already in Still open (a lead window that opened this week) is listed there only.
  const dueSoon = tasks
    .filter((c) => !isStillOpen(c, thisWeek) && c.dates.planned === undefined && c.dates.start === undefined
      && c.dates.due !== undefined && c.dates.due > shownSunday && c.dates.due <= addDays(shownSunday, 28))
    .sort((a, b) => compareText(a.dates.due ?? '', b.dates.due ?? '') || compareText(a.path, b.path) || a.line - b.line)
    .map((c) => c.row);
  const noDate = buildBacklog(s, today).noDate.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, draggable: true })) }));
  const count = open.length + dueSoon.length + noDate.reduce((sum, g) => sum + g.rows.length, 0);
  return { open, dueSoon, noDate, count };
}

/** Still open this week: carried into it by the board's rule, and not planned for a week after this one. */
function isStillOpen(c: Candidate, thisWeek: Week): boolean {
  const later = (iso: string | undefined) => iso !== undefined && iso > thisWeek.end;
  return c.carried && !later(c.dates.planned) && !later(c.dates.start);
}

/**
 * The tasks To plan may list: the to-do and doing lines of active project and area notes and of open task notes, and
 * the open or doing task notes that do not repeat. Stories are task notes inside a project, and plan like any other.
 * Waiting, done and dropped ones are left out. A story is carried into this week as it is on the board: by its own dates or an open line.
 */
function candidates(s: VaultSnapshot, today: string): Candidate[] {
  const thisWeek = isoWeek(today);
  const notes = eligibleNotes(s);
  const lines = notes
    .filter(holdsLooseLines)
    .flatMap((n) => n.tasks
      .filter((t) => !t.isPointer && LISTED_LINE.has(t.state))
      .map((t): Candidate => ({
        key: `${t.path}#${t.line}`, path: t.path, line: t.line,
        dates: lineDates(t),
        carried: openInWeek(lineDates(t), thisWeek, true),
        row: lineRow(t, n, today, { meta: 'parent', draggable: true }),
      })));
  const taskNotes = notes
    .filter((n) => n.type === 'task' && !n.repeat && LISTED_NOTE.has(n.status ?? 'open'))
    .map((n): Candidate => ({
      key: n.path, path: n.path, line: 0,
      dates: noteDates(n),
      carried: isStory(n) ? storyInWeek(n, thisWeek) : openInWeek(noteDates(n), thisWeek, true),
      row: { ...(isStory(n) ? storyRow(n, today) : noteRow(n, today)), draggable: true },
    }));
  return [...lines, ...taskNotes];
}

/** This week's To do order first (the board, unarranged), then the rest by path and line. */
function stillOpen(s: VaultSnapshot, today: string, open: Candidate[]): RowVM[] {
  const board = buildWeek(s, today);
  const order = board.kind === 'this'
    ? board.columns.todo.map((item) => (item.kind === 'row' ? item.row.key : item.card.key))   // a story's key is its path
    : [];
  const onBoard = open
    .filter((c) => order.includes(c.key))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const off = open
    .filter((c) => !order.includes(c.key))
    .sort((a, b) => compareText(a.path, b.path) || a.line - b.line);
  return [...onBoard, ...off].map((c) => c.row);
}
