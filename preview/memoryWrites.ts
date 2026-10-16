import type { RawNote, RowTarget, TaskState } from '../src/model/types.ts';
import type { Actions } from '../src/ui/actions.ts';
import { parseTaskLine, withField, withSymbol } from '../src/model/taskLine.ts';
import { buildSnapshot } from '../src/model/snapshot.ts';
import { isStoryAt } from '../src/model/week.ts';
import { applyNoteDue, applyNotePlan, applyNotePoints, applyNoteStatus, lineWithDue, lineWithPlan, lineWithState } from '../src/obsidian/edits.ts';
import { applyNoteComplete, withLogEntry } from '../src/model/repeat.ts';

export type Writes = Pick<Actions, 'toggle' | 'setState' | 'setNoteStatus' | 'plan' | 'due' | 'points'>;
type LineTarget = Extract<RowTarget, { kind: 'line' }>;

// A task note says "open" where a task line says "todo".
const NOTE_STATUS: Record<TaskState, string> = {
  todo: 'open', doing: 'doing', waiting: 'waiting', done: 'done', dropped: 'dropped',
};

/**
 * The writing half of Actions, done in memory on the raw notes: a stand-in for the Tasks plugin
 * and Obsidian's file APIs. Each write ends with `changed()`, so the page rebuilds and re-renders.
 */
export function memoryWrites(notes: RawNote[], today: string, changed: () => void): Writes {
  function noteAt(path: string): RawNote {
    const note = notes.find((n) => n.path === path);
    if (!note) throw new Error(`No note at ${path}`);
    return note;
  }

  // As in the plugin: a line already in this state is left alone (its dates are not re-stamped).
  function writeLine(t: LineTarget, state: TaskState): LineTarget | null {
    const current = parseTaskLine(t.raw, t.path, t.line)?.state ?? 'todo';
    if (current === state) {
      changed();
      return t;
    }
    return editLine(t, lineIn(t.raw, state, today));
  }

  // The plugin's line write, in memory: written only while the line is still what was drawn. Resolves
  // to the target as written, or to null when it changed since it was drawn (the view still refreshes).
  function editLine(t: LineTarget, next: string): LineTarget | null {
    if (next === t.raw) return t;
    const note = noteAt(t.path);
    const written = note.lines[t.line] === t.raw;
    if (written) note.lines[t.line] = next;
    changed();
    return written ? { ...t, raw: next } : null;
  }

  // A copy, edited by the same function processFrontMatter runs in the plugin.
  function writeFrontmatter(path: string, edit: (fm: Record<string, unknown>) => void): void {
    const note = noteAt(path);
    const fm: Record<string, unknown> = { ...note.frontmatter };
    edit(fm);
    note.frontmatter = fm;
    changed();
  }

  // As in the plugin: a done or dropped note gets a `done` date (an existing one is kept); any other status clears it. A
  // repeating note's done is its occurrence (setNoteState in the plugin): the next date, and the Log line in its text.
  // Resolves to whether it wrote: a repeat Brain can't parse is refused.
  function writeStatus(path: string, status: string): boolean {
    const note = noteAt(path);
    if (status === 'done' && typeof note.frontmatter?.repeat === 'string' && note.frontmatter.repeat !== '') {
      const fm = { ...note.frontmatter };
      const entry = applyNoteComplete(fm, today);
      if (entry === undefined) return false;
      note.frontmatter = fm;
      note.lines = withLogEntry(note.lines.join('\n'), entry).text.split('\n');
      changed();
      return true;
    }
    writeFrontmatter(path, (fm) => applyNoteStatus(fm, status, today));
    return true;
  }

  return {
    async toggle(target) {
      if (target.kind === 'line') {
        // Tasks sends done to todo, and a dropped line back to todo too.
        const state = parseTaskLine(target.raw, target.path, target.line)?.state;
        writeLine(target, state === 'done' || state === 'dropped' ? 'todo' : 'done');
        return;
      }
      writeStatus(target.path, target.state === 'done' ? 'open' : 'done');   // from the row as drawn, as in the plugin
    },
    async setState(target, state) {
      if (target.kind === 'line') return writeLine(target, state);
      return writeStatus(target.path, NOTE_STATUS[state]) ? { ...target, state } : null;
    },
    async setNoteStatus(path, status) {
      writeStatus(path, status);
    },
    async plan(target, to) {
      if (target.kind === 'note') {
        writeFrontmatter(target.path, (fm) => applyNotePlan(fm, to, today));
        return target;
      }
      return editLine(target, lineWithPlan(target.raw, to, today));
    },
    async due(target, date) {
      if (target.kind === 'note') {
        writeFrontmatter(target.path, (fm) => applyNoteDue(fm, date));
        return target;
      }
      return editLine(target, lineWithDue(target.raw, date));
    },
    async points(target, points) {
      // Stories only, as the plugin's edit: a line has no points, and a note that is not a story is refused.
      if (target.kind !== 'note' || !isStoryAt(buildSnapshot(notes), target.path)) return null;
      writeFrontmatter(target.path, (fm) => applyNotePoints(fm, points));
      return target;
    },
  };
}

/** The line in a new state. Its completion and cancelled dates follow the state, as Tasks keeps them. */
function lineIn(raw: string, state: TaskState, today: string): string {
  if (state !== 'done') return lineWithState(raw, state, today);
  return withField(withSymbol(lineWithState(raw, 'todo', today), 'x'), 'completion', today);
}
