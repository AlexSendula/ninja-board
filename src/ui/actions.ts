import type { Arrangement, EventVM, GroupVM, PlanTo, ProjectCardVM, RowTarget, RowVM, ScheduleView, TaskState, WaitingView } from '../model/types.ts';
import type { Points } from '../model/points.ts';
import type { DropTarget } from './drag.ts';

export interface Actions {
  /** The app runs on macOS: the Undo shortcut is named ⌘Z there, and Ctrl+Z elsewhere. Obsidian's Platform.isMacOS, in the app. */
  readonly mac: boolean;
  toggle(target: RowTarget): Promise<void>;                     // click on the circle; Space
  /**
   * The state of a row. Resolves to the target as it now stands (a line: its new raw; a note: its new state), or
   * null when no target stands for the task: the vault refused the write, or Tasks answered with a recurrence
   * (two lines), so no single line is the task any more.
   */
  setState(target: RowTarget, state: TaskState): Promise<RowTarget | null>;
  setNoteStatus(path: string, status: string): Promise<void>;   // dragging cards; the card's states
  open(path: string, line?: number): void;                      // Enter, title click
  /** Plans a task on a day, for a week, or no date yet. A due the plan leaves behind (a plan in a later week than the due's own; no date yet takes one this week or overdue) is removed with it. Resolves like setState. */
  plan(target: RowTarget, to: PlanTo): Promise<RowTarget | null>;
  /** Sets (a date) or removes (null) a task's deadline. Resolves like setState. */
  due(target: RowTarget, date: string | null): Promise<RowTarget | null>;
  /** Sets (1, 2, 3, 5 or 8) or removes (null) a story's points: a frontmatter edit, stories only. Resolves like setState. */
  points(target: RowTarget, points: Points | null): Promise<RowTarget | null>;
  /** Saves these columns' lists in the view's arrange:; other columns are kept. */
  arrange(lists: Arrangement): void;
  /** Saves which form Today's Schedule takes in the view's `schedule:`. Where the config can't be saved the choice lasts for the session. */
  scheduleView(view: ScheduleView): void;
  /** Saves which view Waiting takes on the Week board in the view's `waiting:`. Where the config can't be saved the choice lasts for the session. */
  waitingView(view: WaitingView): void;
  /**
   * Folds (true) or opens (false) the lines of these stories in the Week view, on every week, by note name. Saved in the view's
   * `collapsed:`; it is not an undo step. Where the config can't be saved the fold lasts for the session.
   */
  foldStories(names: string[], folded: boolean): void;
  /** Week view: show the week starting on this Monday. */
  showWeek(start: string): void;
  /** Opens the day modal: one day's whole timeline. */
  showDay(spec: DaySpec): void;
  /** Opens the list modal with this list. */
  showAll(spec: ListSpec): ListHandle;
  /**
   * Runs `run` as one user action made of several writes: they are one undo step, named `label`. The writes made while
   * `run` runs, and while the promise it returns is pending, are the step's. Resolves when `run` has settled.
   */
  group(label: string, run: () => void | Promise<void>): Promise<void>;
  /** Undoes the newest Ninja Board step. Cmd/Ctrl+Z in a Ninja Board view does the same. */
  undo(): void;
  /** What the newest step is called, as the Undo button names it; undefined when there is nothing to undo. */
  undoLabel(): string | undefined;
}

/** The lists a list modal can hold: Projects' Done and Someday, Backlog's Someday, and To plan's three groups. */
export type ListKey = 'done' | 'someday' | 'open' | 'dueSoon' | 'noDate';
export type ListEntry =
  | { kind: 'card'; card: ProjectCardVM }   // a project card, as on the board
  | { kind: 'group'; group: GroupVM }       // a No date group: its name over its rows
  | { kind: 'row'; row: RowVM };            // one To plan row, in a tile of its own
export interface ListSpec {
  key: ListKey;
  title: string;           // 'Someday', 'Done', 'Still open this week', 'Due soon', 'No date'
  noun: string;            // the search field's aria-label is 'Search ' + noun
  count: number;           // cards, or rows
  entries: ListEntry[];
  drag: boolean;           // press and hold carries an item out onto the view
  zones: HTMLElement;      // the view's root: where a carried item may land, and where it is carried
  onDrop?: (item: HTMLElement, target: DropTarget) => void;
  /**
   * The Week view's list: set, the list's story cards fold as the view's story cards do, by these names (its `collapsed:` list), with the
   * chevron on hover. Absent (Backlog's), they fold behind an always-shown chevron, closed by default. It is the page's own set, kept
   * up to date as stories fold (on the page, or in the modal), so the modal draws the folds as they are now, each time it is opened.
   */
  collapsed?: Set<string>;
  opener?: HTMLElement;    // the Show all button that opened it, which takes the focus back when it closes
}
export interface ListHandle { update(spec: ListSpec): void; close(): void; isOpen(): boolean }

/** What the day modal shows: a day's full view, opened by the Week strip's +N more or N earlier. */
export interface DaySpec {
  title: string;        // "Wednesday 14 October · 5"
  events: EventVM[];    // every appointment of the day, the finished ones too
  now?: string;         // "HH:MM", on today only: the now-line's place
  opener: HTMLElement;  // the button that opened it, which takes the focus back
}
