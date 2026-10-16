// The names Undo gives a step, and what a step is titled by. Pure, so the plugin and the preview name a step the same way.
import { displayText, parseTaskLine } from './taskLine.ts';

/** A status as a name: open is To do, the rest are capitalised ('active' is Active). */
export function statusName(status: string): string {
  if (status === 'open' || status === 'todo') return 'To do';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * What Undo calls a tick or an untick of a check, as the mockup names it: undoing a tick reads "untick", undoing an
 * untick reads "tick". `before` is the state the check found the task in.
 */
export function tickUndoLabel(title: string, before: string): string {
  return before === 'done' ? `tick “${title}”` : `untick “${title}”`;
}

/**
 * What Undo calls any other state change (a planner pick, a drop, a project's status): undo puts the state back, so the
 * name says the state it had. `before` is that state.
 */
export function stateUndoLabel(title: string, before: string): string {
  return `set “${title}” back to ${statusName(before)}`;
}

/** Undo of a plan or a deadline. */
export function datesUndoLabel(title: string): string {
  return `restore the dates of “${title}”`;
}

/** Undo of a story's points. */
export function pointsUndoLabel(title: string): string {
  return `restore the points of “${title}”`;
}

/** A task line's title as the page shows it: its text, without fields, tags or link brackets. */
export function lineTitle(raw: string, path: string, line: number): string {
  const task = parseTaskLine(raw, path, line);
  return task ? displayText(task.text) : raw;
}

/** A note's title: its file name without the folder and the .md. */
export function noteTitle(path: string): string {
  return (path.split('/').at(-1) ?? path).replace(/\.md$/, '');
}
