// Backlog & Waiting: the inbox, undated to-dos, someday projects,
// and one tile per person you are waiting on.
import type {
  BacklogVM, GroupVM, InboxVM, NoteInfo, ProjectCardVM, RowVM, TaskLine, VaultSnapshot, WaitingVM,
} from './types.ts';
import { ageText, dayWord, weekdayLong } from './dates.ts';
import { displayText, FIRST_LINK } from './taskLine.ts';
import { lineRow, noteRow, plannedDay, storyRow } from './rows.ts';
import { buildProjects, SOMEDAY_LIMIT } from './projects.ts';
import { eligibleNotes, isOpenNote, isStory, noteDates, undated, undatedStory } from './week.ts';
import { compareText, earliest, UNDATED } from './order.ts';

// Inbox files are named "YYYY-MM-DD HHMM <short title>" (when they arrived); the view shows the title.
const INBOX_PREFIX = /^(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2}) /;
const INBOX_FOLDER = '02 Inbox';

interface Waited { context: string[]; chase?: string; row: RowVM }

export function buildBacklog(s: VaultSnapshot, today: string): BacklogVM {
  const board = buildProjects(s, today).columns;
  const cards = (status: ProjectCardVM['status']) => board.find((c) => c.status === status)?.cards ?? [];
  const inbox = buildInbox(s, today);
  const waiting = buildWaiting(s, today);
  // Tiles are sorted by chase, undated ones last, so the first tile holds the earliest chase.
  const next = waiting[0]?.chase;
  return {
    toSort: inbox.length,
    inbox,
    noDate: buildNoDate(s, cards('active'), today),
    someday: cards('someday'),
    somedayLimit: SOMEDAY_LIMIT,
    waitingOpen: waiting.reduce((sum, w) => sum + w.rows.length, 0),
    nextChase: next ? dayWord(next, today) : undefined,
    waiting,
  };
}

// The inbox: notes of the type, and every note in the inbox folder, which a hand-dropped note needs no format for.
function buildInbox(s: VaultSnapshot, today: string): InboxVM[] {
  return s.notes
    .filter((n) => n.type === 'inbox' || n.folder === INBOX_FOLDER)
    .map((n) => ({ n, at: arrived(n) }))
    .sort((a, b) => compareText(b.at, a.at))
    .map(({ n, at }) => ({
      key: n.path,
      path: n.path,
      title: n.name.replace(INBOX_PREFIX, ''),
      age: ageText(at, today),
    }));
}

/** When an inbox item arrived: its received time, else the date and time its name starts with, else its created date. */
function arrived(n: NoteInfo): string {
  if (n.received) return n.received;
  const named = INBOX_PREFIX.exec(n.name);
  if (named) return `${named[1]}T${named[2]}:${named[3]}`;
  return n.created ?? '';
}

// Active projects come in the Projects board's order (soonest due first), then areas by path. Each holds its own
// undated to-dos, then the open task notes in it (by path): its stories, and the others (see undatedNote).
// Paused and someday projects are left out.
function buildNoDate(s: VaultSnapshot, active: ProjectCardVM[], today: string): GroupVM[] {
  const byPath = new Map(s.notes.map((n) => [n.path, n]));
  const projects = active.flatMap((c) => byPath.get(c.path) ?? []);
  const areas = s.notes.filter((n) => n.type === 'area').sort((a, b) => compareText(a.path, b.path));
  const taskNotes = eligibleNotes(s)
    .filter((n) => n.type === 'task' && isOpenNote(n))
    .sort((a, b) => compareText(a.path, b.path));
  return [...projects, ...areas]
    .map((owner) => {
      const notes = taskNotes.filter((n) => (n.projectPath ?? n.areaPath) === owner.path);
      return {
        name: owner.name,
        path: owner.path,
        rows: [
          ...notes.filter(isStory).flatMap((n) => undatedNote(n, today)),   // a group's stories come before its tasks
          ...owner.tasks.filter(isUndatedTodo).map((t) => plainRow(t, owner, today)),
          ...notes.filter((n) => !isStory(n)).flatMap((n) => undatedNote(n, today)),
        ],
      };
    })
    .filter((g) => g.rows.length > 0);
}

/**
 * An open task note with no date of its own, as a row. A story is one row, with its progress: its lines are on its
 * card, and its meta says No date (the weeks design, section 4). Any other: an undated open one (not repeating: a
 * repeating note is in its week by its plan or its deadline) is a row, then its undated lines, each with the note's
 * name. A repeating note shows only its lines.
 */
function undatedNote(n: NoteInfo, today: string): RowVM[] {
  if (isStory(n)) return undatedStory(n) ? [{ ...storyRow(n, today), meta: [{ text: 'No date' }] }] : [];
  const own = n.status === 'open' && !n.repeat && undated(noteDates(n)) ? [{ ...noteRow(n, today), meta: [] }] : [];
  const lines = n.tasks.filter(isUndatedTodo).map((t) => lineRow(t, n, today, { meta: 'parent', draggable: false }));
  return [...own, ...lines];
}

function isUndatedTodo(t: TaskLine): boolean {
  return t.state === 'todo' && !t.isPointer && !t.due && !t.scheduled && !t.start;
}

// No date under Backlog rows: undated rows have none, and a waiting tile's calendar page shows the chase.
function plainRow(t: TaskLine, note: NoteInfo, today: string): RowVM {
  return { ...lineRow(t, note, today, { meta: 'none', draggable: false }), meta: [] };
}

function buildWaiting(s: VaultSnapshot, today: string): WaitingVM[] {
  const byPerson = new Map<string, Waited[]>();
  // The notes the Week board reads, plus paused projects and their stories:
  // you can wait on someone while a project rests.
  const add = (person: string, item: Waited) => byPerson.set(person, [...(byPerson.get(person) ?? []), item]);
  for (const n of eligibleNotes(s, ['active', 'paused'])) {
    // A dropped task note (a story or an area's) waits on no one: its waiting lines and the note stay out of Waiting.
    if (n.type === 'task' && n.status === 'dropped') continue;
    const waiting = n.tasks.filter((t) => t.state === 'waiting');
    for (const t of waiting) add(personOf(t, n), { context: contextOf(n), chase: t.scheduled, row: plainRow(t, n, today) });
    // A waiting task note is a row too, unless its own waiting lines say who and when: they stand for it.
    // It is chased on its chase date, else its planned day (plannedDay), as Today and Week read it.
    if (n.type === 'task' && n.status === 'waiting' && waiting.length === 0) {
      add(n.waitingOn ?? n.name, { context: contextOf(n), chase: plannedDay(n), row: { ...noteRow(n, today), meta: [] } });
    }
  }
  return [...byPerson].map(([person, items]) => waitingTile(person, items, today)).sort(byChase);
}

// The line's first link as shown (its alias, else its target); a line without a link names its note.
function personOf(t: TaskLine, n: NoteInfo): string {
  const link = FIRST_LINK.exec(t.text);
  return link ? displayText(link[0]) : n.name;
}

// A story names its project too; any other note names only itself.
function contextOf(n: NoteInfo): string[] {
  return n.type === 'task' && n.projectPath && n.parentName ? [n.name, n.parentName] : [n.name];
}

// One tile per person: the earliest chase of their lines, and every context once.
function waitingTile(person: string, items: Waited[], today: string): WaitingVM {
  const first = items.reduce((c, i) => earliest(c, i.chase), UNDATED);
  const chase = first === UNDATED ? '' : first;
  return {
    key: person,
    person,
    context: [...new Set(items.flatMap((i) => i.context))],
    chase,
    calWeekday: chase ? weekdayLong(chase).slice(0, 3).toUpperCase() : '',
    calDay: chase ? Number(chase.slice(8, 10)) : 0,
    late: chase !== '' && chase < today,
    rows: items.map((i) => i.row),
  };
}

function byChase(a: WaitingVM, b: WaitingVM): number {
  return compareText(a.chase || UNDATED, b.chase || UNDATED);
}
