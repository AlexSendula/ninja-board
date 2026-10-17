import { MarkdownView, Notice, Platform, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type { TaskState } from '../model/types.ts';
import type { Actions, ListHandle, ListSpec } from '../ui/actions.ts';
import { parseTaskLine } from '../model/taskLine.ts';
import { datesUndoLabel, lineTitle, noteTitle, pointsUndoLabel, stateUndoLabel, tickUndoLabel } from '../model/undoLabel.ts';
import { showList } from './listModal.ts';
import { isStoryFile } from './snapshot.ts';
import { history, undoLast, type Write } from './undo.ts';
import { dueLine, dueNote, planLine, planNote, pointsNote, setLineState, setNoteState, setNoteStatus, toggleNoteStatus, toggleViaTasks } from './writes.ts';

/**
 * The Actions the views call, carried out with Obsidian's and the Tasks plugin's APIs. The views
 * fire them with `void`, so every async one catches its own errors: a failed write shows a Notice
 * and is logged, and never becomes an unhandled rejection. A write resolves to the target as it
 * was written, or to null when it failed or the vault refused it. Paging, arranging, the Schedule's view
 * and the day modal belong to the view that draws them, so `view` carries those out. Show all opens a list modal.
 *
 * Each write is one step of the session's undo history (see undo.ts), named for what Undo will do. A group of writes
 * (a drop, a planner edit) is one step.
 */
export function obsidianActions(app: App, view: Pick<Actions, 'showWeek' | 'arrange' | 'scheduleView' | 'waitingView' | 'showDay'>): Actions {
  const actions: Actions = {
    mac: Platform.isMacOS,
    toggle: async (target) => {
      // The branches are awaited inside the callback: a conditional between a Promise<LineTarget | null> and a Promise<void> is not one argument saved<T> can take.
      const from = stateOf(target);
      const label = tickUndoLabel(titleOf(target), from);
      await saved(() => history.act(label, async (journal) => {
        if (target.kind === 'line') await toggleViaTasks(app, target, undefined, journal);
        else await toggleNoteStatus(app, target.path, target.state, journal);
      }));
    },
    setState: (target, state) => saved(() => history.act(stateUndoLabel(titleOf(target), stateOf(target)), async (journal) => {
      if (target.kind === 'line') return setLineState(app, target, state, journal);
      if (!noteExists(app, target.path)) return null;
      // A repeating note's done completes its occurrence (setNoteState); a refused completion is no write.
      return (await setNoteState(app, target.path, noteStatus(state), journal)) ? { ...target, state } : null;
    })),
    setNoteStatus: async (path, status) => {
      await saved(() => history.act((writes) => statusLabel(path, writes), async (journal) => {
        await setNoteStatus(app, path, status, journal);
      }));
    },
    open: (path, line) => void guarded('Ninja Board couldn\'t open that note', () => openNote(app, path, line)),
    plan: (target, to) => saved(() => history.act(datesUndoLabel(titleOf(target)), async (journal) => {
      if (target.kind === 'line') return planLine(app, target, to, journal);
      if (!noteExists(app, target.path)) return null;
      await planNote(app, target.path, to, journal);
      return target;
    })),
    due: (target, date) => saved(() => history.act(datesUndoLabel(titleOf(target)), async (journal) => {
      if (target.kind === 'line') return dueLine(app, target, date, journal);
      if (!noteExists(app, target.path)) return null;
      await dueNote(app, target.path, date, journal);
      return target;
    })),
    points: (target, points) => saved(() => history.act(pointsUndoLabel(titleOf(target)), async (journal) => {
      // Stories only: a line has no points, and a note that is not a story (or is gone) is refused.
      if (target.kind !== 'note') return null;
      if (!isStoryFile(app, target.path)) return null;
      await pointsNote(app, target.path, points, journal);
      return target;
    })),
    group: (label, run) => history.group(label, run),
    undo: () => void undoLast(app),
    undoLabel: () => history.label(),
    arrange: (lists) => view.arrange(lists),
    scheduleView: (choice) => view.scheduleView(choice),
    waitingView: (choice) => view.waitingView(choice),
    showWeek: (start) => view.showWeek(start),
    showDay: (spec) => view.showDay(spec),
    showAll: (spec: ListSpec): ListHandle => showList(app, spec, actions),
  };
  return actions;
}

/** Runs `action`; if it throws, tells the user and logs the error instead of rejecting. */
async function guarded(message: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(error);
    new Notice(message);
  }
}

/** Runs `action`; if it throws, tells the user and logs the error, and resolves to null. */
async function saved<T>(action: () => Promise<T>): Promise<T | null> {
  try {
    return await action();
  } catch (error) {
    console.error(error);
    new Notice('Couldn\'t save that change');
    return null;
  }
}

/** Whether a task note is still in the vault. A write to a note that is gone is refused (null), not a silent success. */
function noteExists(app: App, path: string): boolean {
  return app.vault.getFileByPath(path) !== null;
}

/** A task note's status for a row state; a task note's word for todo is "open". */
function noteStatus(state: TaskState): string {
  return state === 'todo' ? 'open' : state;
}

/** The state a row or a card is in as it was read: a line's own, or the note's as drawn. */
function stateOf(target: { kind: 'line'; path: string; line: number; raw: string } | { kind: 'note'; state: TaskState }): TaskState {
  if (target.kind === 'note') return target.state;
  return parseTaskLine(target.raw, '', target.line)?.state ?? 'todo';
}

/** The name a target has in Undo's labels: the line's text, or the note's name. */
function titleOf(target: { kind: 'line'; path: string; line: number; raw: string } | { kind: 'note'; path: string }): string {
  return target.kind === 'line' ? lineTitle(target.raw, target.path, target.line) : noteTitle(target.path);
}

/** Undo's name for a note's status change: from the status the note had, as its write recorded it. */
function statusLabel(path: string, writes: readonly Write[]): string {
  const status = writes.find((w): w is Extract<Write, { kind: 'field' }> => w.kind === 'field' && w.key === 'status');
  const title = noteTitle(path);
  return status ? stateUndoLabel(title, typeof status.before === 'string' ? status.before : 'open') : `restore “${title}”`;
}

async function openNote(app: App, path: string, line?: number): Promise<void> {
  const file = app.vault.getFileByPath(normalizePath(path));   // a path the views build, as the Guide's links do
  if (!file) return;
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file, { active: true });
  if (line === undefined || !(leaf.view instanceof MarkdownView)) return;
  const pos = { line, ch: 0 };
  leaf.view.editor.setCursor(pos);
  leaf.view.editor.scrollIntoView({ from: pos, to: pos }, true);
}
