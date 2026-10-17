import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { PlanTo, RowTarget, TaskState } from '../model/types.ts';
import type { Points } from '../model/points.ts';
import { parseTaskLine, withSymbol } from '../model/taskLine.ts';
import { applyNoteComplete, withLogEntry } from '../model/repeat.ts';
import {
  applyNoteDue, applyNotePlan, applyNotePoints, applyNoteStatus, isUsableToggle, lineWithDue, lineWithPlan, lineWithState,
  replaceLineIfUnchanged, tasksApi,
} from './edits.ts';
import { fieldWrites, type Write } from './undo.ts';

export type LineTarget = Extract<RowTarget, { kind: 'line' }>;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Today's local date, YYYY-MM-DD. Plain digits by construction: no locale can change them, so none reaches the notes. */
export function today(): string {
  const d = new Date();
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local time of day, HH:MM: what the views are drawn at (the Schedule's now-line, what has ended). Plain digits, as today(). */
export function now(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Ticks or unticks a line with the Tasks plugin, which adds or clears the dates and may add a
 * recurrence line. `from` is the line Tasks toggles; it defaults to the line as read.
 */
export async function toggleViaTasks(app: App, target: LineTarget, from: string = target.raw, journal: Write[] = []): Promise<LineTarget | null> {
  const api = tasksApi(app);
  if (!api) {
    new Notice('Tasks must be on to tick a task');
    return null;
  }
  const read = parseTaskLine(from, target.path, target.line);
  // Tasks has no status for a capital X (it would make an unknown todo), so it is given the x that means the same.
  const input = read?.symbol === 'X' ? withSymbol(from, 'x') : from;
  const completes = read?.state === 'todo' || read?.state === 'doing' || read?.state === 'waiting';
  // Tasks' answer replaces the user's line, so it is checked first: a wrong one would erase the task.
  const result: unknown = api.executeToggleTaskDoneCommand(input, target.path);
  if (!isUsableToggle(result, target.path, target.line) || !doesTick(result, target.path, target.line, completes)) {
    new Notice("Tasks gave an answer this plugin can't use");
    return null;
  }
  if (!(await writeLine(app, target, result, journal))) return null;
  // A recurrence (Tasks' two lines) has no single line to stand for it.
  return result.split(/\r?\n/).length === 1 ? { ...target, raw: result } : null;
}

/**
 * Whether Tasks' answer does what the tick was for: completing gives a done line (with or without its
 * completion date, which depends on Tasks' done-date setting), reopening gives no done line.
 */
function doesTick(result: string, path: string, line: number, completes: boolean): boolean {
  const tasks = result.split(/\r?\n/).map((l) => parseTaskLine(l, path, line));
  return completes
    ? tasks.some((t) => t?.state === 'done')
    : tasks.every((t) => t?.state !== 'done');
}

export async function setLineState(app: App, target: LineTarget, state: TaskState, journal: Write[] = []): Promise<LineTarget | null> {
  const current = parseTaskLine(target.raw, target.path, target.line)?.state ?? 'todo';
  if (state === current) return target;
  if (state !== 'done') {
    const raw = lineWithState(target.raw, state, today());
    return (await writeLine(app, target, raw, journal)) ? { ...target, raw } : null;
  }
  // Tasks toggles a dropped line back to todo, so it gets the line as todo to complete.
  return toggleViaTasks(app, target, current === 'dropped' ? lineWithState(target.raw, 'todo', today()) : target.raw, journal);
}

/** Sets a note's `status`. A done or dropped note gets a `done` date (an existing one is kept); any other status clears it. */
export async function setNoteStatus(app: App, path: string, status: string, journal: Write[] = []): Promise<void> {
  await editFrontmatter(app, path, (fm) => applyNoteStatus(fm, status, today()), journal);
}

/**
 * Sets a task note's state as a view writes it. A repeating note's done is this occurrence: the note moves to its next date
 * and the occurrence goes to its Log (applyNoteComplete, with the Log line written after the frontmatter). Any other state is a
 * status write. Resolves to whether it wrote: a repeat Brain can't parse is refused, and nothing changes.
 */
export async function setNoteState(app: App, path: string, status: string, journal: Write[] = []): Promise<boolean> {
  const file = app.vault.getFileByPath(path);
  if (!file) return false;
  const occurred: { entry?: string } = {};
  let refused = false;
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    const before = { ...fm };
    if (status === 'done' && typeof fm.repeat === 'string' && fm.repeat !== '') {
      occurred.entry = applyNoteComplete(fm, today());
      refused = occurred.entry === undefined;
    } else {
      applyNoteStatus(fm, status, today());
    }
    if (!refused) journal.push(...fieldWrites(path, before, fm));
  });
  if (refused) {
    new Notice("Can't complete this repeating note: its repeat or its due date isn't one this plugin knows");
    return false;
  }
  if (occurred.entry !== undefined) await logOccurrence(app, path, occurred.entry, journal);
  return true;
}

/** Writes an occurrence's Log line into the note's text (see withLogEntry), recorded in `journal` for Undo. */
async function logOccurrence(app: App, path: string, entry: string, journal: Write[]): Promise<void> {
  const file = app.vault.getFileByPath(path);
  if (!file) return;
  const written: { made?: boolean; tail?: string } = {};
  await app.vault.process(file, (data) => {
    const next = withLogEntry(data, entry);
    written.made = next.made;
    written.tail = next.tail;
    return next.text;
  });
  journal.push({ kind: 'log', path, entry, made: written.made === true, tail: written.tail ?? '' });
}

/** Ticks a task note: done unless it was drawn done, then open again. It acts on `shown`, not the file, so a second click on a stale row can't undo the first. */
export function toggleNoteStatus(app: App, path: string, shown: TaskState, journal: Write[] = []): Promise<boolean> {
  return setNoteState(app, path, shown === 'done' ? 'open' : 'done', journal);
}

/**
 * Edits a note's frontmatter, and records in `journal` each field the edit changed, from the frontmatter the edit was given.
 * A note that is gone is not written.
 */
async function editFrontmatter(app: App, path: string, edit: (fm: Record<string, unknown>) => void, journal: Write[]): Promise<void> {
  const file = app.vault.getFileByPath(path);
  if (!file) return;
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    const before = { ...fm };
    edit(fm);
    journal.push(...fieldWrites(path, before, fm));
  });
}

/**
 * Writes `replacement` over the target line, but only while that line is still what was read. Resolves to whether it wrote.
 * A written line is recorded in `journal`; a two-line replacement (a Tasks recurrence) is recorded as one Undo cannot put back.
 */
async function writeLine(app: App, target: LineTarget, replacement: string, journal: Write[] = []): Promise<boolean> {
  const file = app.vault.getFileByPath(target.path);
  let written = false;
  if (file) {
    await app.vault.process(file, (data) => {
      const next = replaceLineIfUnchanged(data, target.line, target.raw, replacement);
      written = next !== null;
      return next ?? data;
    });
  }
  if (written) {
    journal.push(replacement.includes('\n')
      ? { kind: 'lost', path: target.path }
      : { kind: 'line', path: target.path, line: target.line, before: target.raw, after: replacement });
  }
  // No re-render needed here: whatever changed the line also changes the metadata cache,
  // and the view re-renders on that.
  if (!written) new Notice('That task changed — refreshed');
  return written;
}

/** Plans a task line for `to` (see lineWithPlan; a deadline it leaves behind goes): the target as written, or null when the vault refused it. */
export async function planLine(app: App, target: LineTarget, to: PlanTo, journal: Write[] = []): Promise<LineTarget | null> {
  return writeTarget(app, target, lineWithPlan(target.raw, to, today()), journal);
}

/** Sets or removes a task line's deadline (see lineWithDue): the target as written, or null when the vault refused it. */
export async function dueLine(app: App, target: LineTarget, date: string | null, journal: Write[] = []): Promise<LineTarget | null> {
  return writeTarget(app, target, lineWithDue(target.raw, date), journal);
}

/** Writes `next` over the target line: the target itself when `next` is the line already, else the target with `next` as its raw, or null when the vault refused it. */
async function writeTarget(app: App, target: LineTarget, next: string, journal: Write[]): Promise<LineTarget | null> {
  if (next === target.raw) return target;
  return (await writeLine(app, target, next, journal)) ? { ...target, raw: next } : null;
}

/** Plans a task note on `to` (frontmatter `scheduled` or `start`; a `due` it leaves behind is deleted). */
export async function planNote(app: App, path: string, to: PlanTo, journal: Write[] = []): Promise<void> {
  await editFrontmatter(app, path, (fm) => applyNotePlan(fm, to, today()), journal);
}

/** Sets or removes a task note's deadline (frontmatter `due`). */
export async function dueNote(app: App, path: string, date: string | null, journal: Write[] = []): Promise<void> {
  await editFrontmatter(app, path, (fm) => applyNoteDue(fm, date), journal);
}

/** Sets a story's points, or removes them (frontmatter `points`; see applyNotePoints). */
export async function pointsNote(app: App, path: string, points: Points | null, journal: Write[] = []): Promise<void> {
  await editFrontmatter(app, path, (fm) => applyNotePoints(fm, points), journal);
}
