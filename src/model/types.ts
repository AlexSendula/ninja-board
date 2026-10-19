export type TaskState = 'todo' | 'doing' | 'waiting' | 'done' | 'dropped';

/** One checkbox line inside a note. */
export interface TaskLine {
  path: string;            // vault path of the note, e.g. "03 Projects/Website for Sam/Website for Sam.md"
  line: number;            // 0-based line number in the file
  raw: string;             // the full line exactly as in the file (used to verify before writing)
  symbol: string;          // the checkbox character
  state: TaskState;
  text: string;            // description: checkbox and Dataview fields removed, trimmed; wikilinks kept as [[...]]
  due?: string;            // ISO dates
  scheduled?: string;
  start?: string;          // [start:: …]: planned for that week, any day (the Monday)
  completion?: string;
  cancelled?: string;
  links: string[];         // wikilink targets (before any | or #), in order
  isPointer: boolean;      // the text is only one wikilink, e.g. "[[Choose hosting for Sam's site]]"
}

export type NoteType =
  | 'area' | 'project' | 'task' | 'appointment' | 'commitment' | 'inbox'
  | 'person' | 'people' | 'conversation' | 'week-plan' | 'other';

/** A completed occurrence of a repeating task note, as its Log line records it: the day it was done, the due date it closed, and the next one. */
export interface Occurrence { on: string; due: string; next: string; nth?: number }   // nth: its place among those dated `on`, from the top of the Log (1 when absent)

/** One markdown note outside 10 Archive/. */
export interface NoteInfo {
  path: string;
  name: string;            // basename without .md
  folder: string;          // parent folder path ('' at the root)
  type: NoteType;          // 'other' when frontmatter has an unknown or no type
  status?: string;         // project: active|paused|someday|done|dropped; task note: open|doing|waiting|someday|done|dropped
  area?: string;           // display name from "[[Friends]]" → "Friends"
  due?: string; scheduled?: string; done?: string; date?: string;   // ISO
  start?: string;          // frontmatter start, through toISO: planned for that week, any day
  created?: string;        // ISO, from frontmatter created: Someday lists the most recently added first
  repeat?: string;         // e.g. "every 6 months", "every tue"
  lead?: string;           // task note: how long before its deadline its lead window opens, as written ("2w", "1h30m")
  time?: string;           // "10:00-10:30" or "10:00"
  points?: number;        // task note: a story's points, 1, 2, 3, 5 or 8 (deviation 5); other values are none
  where?: string;
  chase?: string;          // task note, waiting: the day to chase (ISO)
  waitingOn?: string;      // task note, waiting: who, as shown ("[[Bram Ellery|Bram]]" → "Bram")
  received?: string;       // inbox: "YYYY-MM-DDTHH:MM"
  tasks: TaskLine[];       // all checkbox lines, in file order
  occurrences?: Occurrence[];   // a repeating task note: its completed occurrences, from the Log section (newest first)
  projectPath?: string;    // set on notes inside a project's folder (not on the project note itself)
  areaPath?: string;       // set on notes inside an area's folder (not on the area note itself)
  parentName?: string;     // name of that project or area
}

export interface VaultSnapshot { notes: NoteInfo[] }

/** Raw input for buildSnapshot, produced by test/sample.ts (Node) and obsidian/snapshot.ts (Obsidian). */
export interface RawNote { path: string; frontmatter: Record<string, unknown> | undefined; lines: string[] }

// ---------- view models ----------
export type Tone = 'overdue' | 'late' | 'strong';
export interface MetaPart { text: string; tone?: Tone; when?: 'plan' | 'due' }   // when: a plan part (meta colour) or a due part (red)

export type RowTarget =
  | { kind: 'line'; path: string; line: number; raw: string }
  | { kind: 'note'; path: string; state: TaskState };   // state: as drawn, so a toggle acts on what the user saw

/** A task's planning fields, as the planner card shows and edits them. */
export interface PlanDates { scheduled?: string; start?: string; due?: string }

export interface RowVM {
  key: string;             // "path#line" for lines, "path" for notes; stable across renders
  target: RowTarget;
  title: string;           // display text: wikilinks rendered as their alias or target
  state: TaskState;
  meta: MetaPart[];        // shown under the title, joined by " · "
  repeating: boolean;      // a repeating task note: its meta has the repeat on a line of its own
  occurrence?: true;       // a completed occurrence of a repeating note, in Done: the repeat mark, not tickable
  draggable: boolean;
  plan?: PlanDates;        // set: Brain may plan this row (the planner card, a day, a week); its dates, only the keys that are set
  ariaLabel: string;       // e.g. "Book a physio session, 3 days overdue"
  progress?: { done: number; total: number };   // a story as a row: a 16px ring lead and a "done/total" aside instead of the check
  points?: number;        // a story as a row: its points, drawn quietly under its ring
  lines?: RowVM[];         // a story as a row: its lines, file order, all of them, for its card (the card's own rows; not drawn as rows)
}

export interface StoryCardVM {
  key: string; path: string; title: string;
  column: 'todo' | 'doing' | 'waiting' | 'done';
  meta: MetaPart[];        // e.g. [{text:'Waiting on Bram', tone:'strong'}, {text:'Renovate the kitchen'}, {text:'Due 24 Oct'}]
  done: number; total: number;   // story lines done / all non-dropped story lines
  rows: RowVM[];           // all story lines (done ones included), file order
  plan?: PlanDates;        // set: Brain may plan this story (the planner card, a drag onto a day, Planned or due, To plan)
  points?: number;         // the story's points, when it has them
}

/** A week's story points: planned (the points of its stories, open and done), done, and the target (points_per_week). */
export interface PointsVM { planned: number; done: number; target: number }

export interface ProjectCardVM {
  key: string; path: string; title: string;
  status: 'active' | 'paused' | 'someday' | 'done';
  meta: MetaPart[];        // area and due, only values that exist; done projects: area, then {text:'Done 2 Oct'}
  done: number; total: number;   // project lines (pointer lines excluded) + its stories' lines, dropped excluded
  next?: RowVM;            // first todo/doing line of the project note, else of its stories (file order)
  arrangeKey: string;      // the project note's name: its key in the view's arrange: lists
}

/** path: the appointment's note; '' when there is none (a week record's appointment no note matches), and the UI shows plain text. */
export interface EventVM { key: string; path: string; title: string; start: string; end?: string; where?: string }

export interface TodayVM {
  label: string;           // "TUESDAY"
  title: string;           // "13 October"
  left: number; doneToday: number;
  now: RowVM[];            // doing lines
  today: RowVM[];          // open (todo/waiting) lines due/planned today or overdue or chase due; task notes due/planned ≤ today
  schedule: EventVM[];     // today's appointments, by start time
  doneRows: RowVM[];       // lines completed today + notes done today
}

export interface DayVM {
  iso: string; weekdayShort: string; initial: string; dayNum: number;
  isToday: boolean; isPast: boolean;
  events: EventVM[];
  planned: number;         // open items planned that day: a line's scheduled, a note's plannedDay (a waiting note's chase)
  due: number;             // open items due that day
  done: number;      // a past week: items done that day; 0 otherwise
}

/** arrangeKey: a card or a task-note row, its note's name; a line row, `<note name> › <text as shown>` (lineKey). */
export type BoardItem =
  | { kind: 'row'; row: RowVM; arrangeKey: string }
  | { kind: 'card'; card: StoryCardVM; arrangeKey: string };

export interface PagerVM { prev: string; next: string; thisWeek?: string }   // Mondays (ISO); thisWeek only when another week is shown
export interface ComingUpVM { start: string; week: number; count: number }
/** A group of Planned or due: Any day (no iso) or a day. */
export interface DayGroupVM { iso?: string; label: string; rows: RowVM[] }   // label 'Any day' or 'Tue 20'

/** What every week shows: the head with its pager, and the strip. */
export interface WeekHeadVM {
  label: string;           // "WEEK 43"
  title: string;           // "19–25 October", or "28 Sep – 4 Oct" across two months
  start: string;           // the Monday (ISO)
  today: string;           // the day the view was drawn
  pager: PagerVM;
  days: DayVM[];           // Monday..Sunday
}

/** Today's week: the live board. */
export interface ThisWeekVM extends WeekHeadVM {
  kind: 'this';
  left: number; done: number;
  comingUp: ComingUpVM[];  // the next three weeks
  columns: { todo: BoardItem[]; doing: BoardItem[]; waiting: BoardItem[]; done: BoardItem[] };
  saved: Arrangement;      // the arrange: lists saved for To do, Doing and Waiting: a drop out of a column writes it only if it has one
  points?: PointsVM;       // the week's story points; undefined when no story in the week has points
}

/** To plan for an upcoming week: this week's open tasks, Due soon, and No date. */
export interface ToPlanVM {
  open: RowVM[];      // Still open this week
  dueSoon: RowVM[];   // Due soon
  noDate: GroupVM[];  // No date, grouped as Backlog's
  count: number;      // open + dueSoon + every noDate row
}

/** A later week, as a preview: what is planned or due, by day, and To plan. */
export interface UpcomingWeekVM extends WeekHeadVM {
  kind: 'upcoming';
  planned: number;          // rows in byDay: the Planned or due count
  /** The header's two counts: inWeek is everything in Planned or due (`planned`); due is how many of those have their own deadline in the week. */
  tally: { inWeek: number; due: number };
  byDay: DayGroupVM[];      // Any day first when it has rows, then the days with rows, in date order
  toPlan: ToPlanVM;         // To plan: Still open this week, Due soon, No date
  points?: PointsVM;        // the week's story points, as this week's board counts them; undefined when no story has points
}

/** One item of a past week's read-only board. */
export interface RecordRowVM {
  key: string;              // unique on the board: "path#line" or "path" from notes; "<section>#<n>" from a record
  title: string;
  state: TaskState;         // the mark it is drawn with
  path?: string;            // the note the title opens; undefined: plain text
  meta: MetaPart[];
  inbox: boolean;           // a record's inbox item: a dot, no mark
  lines?: RecordRowVM[];    // a story's card: its lines, as the record or the notes list them (read-only rows, the story's name left out of their meta); a plain row has none
}
export interface PastColumnVM { title: string; empty: string; rows: RecordRowVM[] }

/** An earlier week: its record, or what the notes say now. Read-only. */
export interface PastWeekVM extends WeekHeadVM {
  kind: 'past';
  source: MetaPart[];       // the line under the strip: [Record, frozen Mon 12 Oct] or [From your notes]
  done: number;
  total?: number;           // a record only: done + in progress + not done (the ring)
  columns: PastColumnVM[];  // record: Not done, In progress, Done; from notes: Not done, Done
  backlog?: RecordRowVM[];  // a record only: its Backlog
  points?: PointsVM;       // a record only, when it holds points_planned and points_done
}

export type WeekVM = ThisWeekVM | UpcomingWeekVM | PastWeekVM;

export interface ProjectsVM {
  active: number; total: number;
  /** limit: Someday 5, Done 3; the cards after it wait behind Show all. Active and Paused have none: they show every card. */
  columns: { status: 'active' | 'paused' | 'someday' | 'done'; title: string; cards: ProjectCardVM[]; limit?: number }[];
  saved: Arrangement;      // the arrange: lists saved for Active, Paused and Someday: a drop out of a column writes it only if it has one
}

export interface InboxVM { key: string; path: string; title: string; age: string }
export interface GroupVM { name: string; path: string; rows: RowVM[] }
export interface WaitingVM {
  key: string; person: string; context: string[];
  chase: string;           // ISO
  calWeekday: string;      // "THU"
  calDay: number;          // 15
  late: boolean;           // chase < today
  rows: RowVM[];
}
export interface BacklogVM {
  toSort: number;
  inbox: InboxVM[]; noDate: GroupVM[]; someday: ProjectCardVM[];
  somedayLimit: number;    // 5: the someday rows after it wait behind Show all
  waitingOpen: number; nextChase?: string;   // nextChase as wording ("Thu")
  waiting: WaitingVM[];
}

// ---------- arranging and planning ----------
export type ArrangeColumn = 'todo' | 'doing' | 'waiting' | 'active' | 'paused' | 'someday';
/** The `arrange:` map of a dashboard note's view: one list of item keys per column, in the order shown. */
export type Arrangement = Partial<Record<ArrangeColumn, string[]>>;

/** Which form Today's Schedule tile takes. Layout, saved in the dashboard note's base block as `schedule:`. */
export type ScheduleView = 'large' | 'compact';
/** Where Waiting shows on the Week board: its own column (the default), or a group at the bottom of Doing. Layout, saved as `waiting:`. */
export type WaitingView = 'column' | 'group';
/** Where a plan puts a task: on a day (`scheduled`), for a week, any day (`start` = that Monday), or no date yet (null). */
export type PlanTo = { day: string } | { week: string } | null;

// ---------- the Guide's setup check ----------
/** What Brain could read of the Tasks plugin: `on` is undefined when it can't tell, `settings` is undefined when they can't be read (null: never saved). */
export interface TasksSetup { on?: boolean; settings?: unknown }
export type SetupState = 'ok' | 'fix' | 'unknown';   // fix: something to change; unknown: Brain can't tell
export interface SetupLineVM {
  key: 'tasks' | 'format' | 'doneDate' | 'waiting';
  state: SetupState;
  text: MetaPart[];        // ok and unknown: what Brain needs; fix: what to change. Strong parts are the values to set
  where?: string;          // fix and unknown: the setting to look at, "Tasks settings, Task Statuses"
}
export interface GuideVM { setup: SetupLineVM[] }
