import type { Arrangement, MetaPart, NoteInfo, ProjectCardVM, ProjectsVM, TaskLine, VaultSnapshot } from './types.ts';
import { doneText, dueText } from './dates.ts';
import { lineRow } from './rows.ts';
import { compareText, UNDATED } from './order.ts';
import { arrange } from './arrange.ts';

type Status = ProjectCardVM['status'];

/** Someday shows the 5 most recently added, on Projects and on Backlog; the rest wait behind Show all. */
export const SOMEDAY_LIMIT = 5;
/** Done shows the 3 most recently finished; the rest wait behind Show all. */
export const DONE_LIMIT = 3;

type Order = (a: NoteInfo, b: NoteInfo) => number;

// Each column in its own order: Active and Paused soonest due first, Someday by created, Done by done.
const COLUMNS: { status: Status; title: string; limit?: number; order: Order }[] = [
  { status: 'active', title: 'Active', order: bySoonestDue },
  { status: 'paused', title: 'Paused', order: bySoonestDue },
  { status: 'someday', title: 'Someday', limit: SOMEDAY_LIMIT, order: newestFirst('created') },
  { status: 'done', title: 'Done', limit: DONE_LIMIT, order: newestFirst('done') },
];

/**
 * `arrangement`: the view's arrange: lists. Each column is sorted in its own order; then Active, Paused and
 * Someday follow their lists, and Done keeps its order. Every card stays: the UI trims to `limit` after both.
 */
export function buildProjects(s: VaultSnapshot, today: string, arrangement: Arrangement = {}): ProjectsVM {
  const projects = s.notes.filter((n) => n.type === 'project');
  const columns = COLUMNS.map(({ order, ...col }) => {
    const { status } = col;
    // A dropped project, or one with a status Brain doesn't know, matches no column and is left out.
    const cards = projects.filter((n) => n.status === status).sort(order).map((n) => projectCard(n, status, s, today));
    return { ...col, cards: status === 'done' ? cards : arrange(cards, arrangement[status]) };
  });
  return {
    active: columns.find((c) => c.status === 'active')?.cards.length ?? 0,
    total: columns.reduce((sum, c) => sum + c.cards.length, 0),
    columns,
    saved: {
      ...(arrangement.active && { active: arrangement.active }),
      ...(arrangement.paused && { paused: arrangement.paused }),
      ...(arrangement.someday && { someday: arrangement.someday }),
    },
  };
}

// The most recent first, by the given date; undated last ('' sorts below every date), then by name.
function newestFirst(field: 'created' | 'done'): Order {
  return (a, b) => compareText(b[field] ?? '', a[field] ?? '') || a.name.localeCompare(b.name);
}

// Soonest deadline first, as in the mockup; undated projects after, then by name.
function bySoonestDue(a: NoteInfo, b: NoteInfo): number {
  return compareText(a.due ?? UNDATED, b.due ?? UNDATED) || a.name.localeCompare(b.name);
}

function projectCard(n: NoteInfo, status: Status, s: VaultSnapshot, today: string): ProjectCardVM {
  const lines = projectLines(n, s);
  const counted = lines.filter(({ t }) => t.state !== 'dropped');
  // A done project's card has no next line, as in the mockup.
  const next = status === 'done' ? undefined : lines.find(({ t }) => t.state === 'todo' || t.state === 'doing');
  return {
    key: n.path,
    path: n.path,
    title: n.name,
    status,
    meta: cardMeta(n, status, today),
    done: counted.filter(({ t }) => t.state === 'done').length,
    total: counted.length,
    next: next && lineRow(next.t, next.note, today, { meta: 'none', draggable: false }),
    arrangeKey: n.name,
  };
}

// The project's own lines in file order, without the pointers to its stories,
// then its stories' lines, dropped stories left out. Each line keeps its note, which lineRow needs.
function projectLines(n: NoteInfo, s: VaultSnapshot): { t: TaskLine; note: NoteInfo }[] {
  const own = n.tasks.filter((t) => !t.isPointer).map((t) => ({ t, note: n }));
  const stories = s.notes.filter((m) => m.type === 'task' && m.projectPath === n.path && m.status !== 'dropped');
  return [...own, ...stories.flatMap((story) => story.tasks.map((t) => ({ t, note: story })))];
}

function cardMeta(n: NoteInfo, status: Status, today: string): MetaPart[] {
  const meta: MetaPart[] = n.area ? [{ text: n.area }] : [];
  if (status === 'done') {
    if (n.done) meta.push({ text: doneText(n.done, today) });
  } else if (n.due) {
    meta.push(dueText(n.due, today));
  }
  return meta;
}
