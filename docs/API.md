# Plugin API reference

> Last updated: 19 October 2026 (Ninja Board v1.1.0)

Ninja Board has no network API. Its public surface is:

- the view types and commands it registers with Obsidian;
- the dashboard note format, and the view config keys it reads and writes;
- the `Actions` interface its views call;
- the edit contract it shares with the agent.

Architecture: [ARCHITECTURE.md](ARCHITECTURE.md).

## Registered views

Registered in [`src/main.ts`](../src/main.ts) (`VIEWS`, line 10). If the Bases core plugin is off, Ninja Board shows the Notice "Bases is off. Turn it on, then reload this plugin."

| View type | Name in the Bases view picker | Icon | Dashboard note (sample) | Shows |
|---|---|---|---|---|
| `ninja-board-today` | Ninja Board · Today | `sun` | `01 Dashboard/01 Today.md` (the start page) | The date, what is in doing, today's tasks and the Schedule. |
| `ninja-board-week` | Ninja Board · Week | `calendar-range` | `01 Dashboard/02 Week.md` | This week's strip and board, Coming up, and past and upcoming weeks. |
| `ninja-board-projects` | Ninja Board · Projects | `kanban` | `01 Dashboard/03 Projects.md` | Projects by status: Active, Paused, Someday and Done. |
| `ninja-board-backlog` | Ninja Board · Backlog & Waiting | `inbox` | `01 Dashboard/04 Backlog.md` | The inbox, undated tasks, someday projects, and waiting tasks by person. |
| `ninja-board-guide` | Ninja Board · Guide | `book-open` | `01 Dashboard/05 Guide.md` | The marks, how to work in Ninja Board, and a live check of the Tasks setup. |

The user-facing description of each view is in the [plugin README](../README.md#the-views).

## Commands

Registered in [`src/main.ts`](../src/main.ts).

| Command id | Name in code | Shown in the palette | Does | If the note is missing |
|---|---|---|---|---|
| `open-today` | Open today | Ninja Board: Open today | Opens `01 Dashboard/01 Today.md` in the current tab. | Notice: "Ninja Board can't find 01 Dashboard/01 Today.md" |
| `open-guide` | Open guide | Ninja Board: Open guide | Opens `01 Dashboard/05 Guide.md` in the current tab ([`src/obsidian/guide.ts`](../src/obsidian/guide.ts)). | Notice: "Ninja Board can't find 01 Dashboard/05 Guide.md" |
| `undo` | Undo the last change | Ninja Board: Undo the last change | Undoes the newest Ninja Board step, as the Undo button does. No default hotkey; Cmd/Ctrl+Z in a Ninja Board view does the same ([`src/obsidian/undo.ts`](../src/obsidian/undo.ts)). | Nothing to undo: nothing happens. |

## Dashboard note format

Each view has one note in `01 Dashboard/`. The note's frontmatter is `type: note` (the sample notes also have `created`). Its body is one `base` block. This is the Today note:

````markdown
```base
filters:
  and:
    - '!file.inFolder("10 Archive")'
    - 'file.ext == "md"'
views:
  - type: ninja-board-today
    name: Today
```
````

The other notes differ only in `type` and `name`.

- **Filters** are Bases' own. They choose which notes the view receives. Ninja Board never shows notes under `10 Archive/`, whatever the filter says ([`snapshotFromFiles`](../src/obsidian/snapshot.ts)).
- **Grouping and sorting** from Bases are ignored. Ninja Board keeps its own order.
- **Saving.** Bases writes the whole `base` block each time it saves a view config value. Formatting and comments inside the block are normalised. A save works only when the note is open itself, in Reading view or Live Preview, or in a `.base` file. In an embed, a hover or a canvas, Ninja Board shows a Notice and does not save.

## View config keys

Ninja Board reads these from the view's entry in the `base` block (`this.config.get`), and writes them back with `config.set` ([`view.ts`](../src/obsidian/view.ts)).

| Key | On view | Values | Default | Notes |
|---|---|---|---|---|
| `arrange` | `ninja-board-week`, `ninja-board-projects` | A map from column to a list of keys. Week: `todo`, `doing`, `waiting`. Projects: `active`, `paused`, `someday`. | None: the normal order | A card's key, or a task-note row's, is its note's name. A task-line row's key is `<note name> › <text as shown>`, with U+203A and a space either side ([`lineKey`](../src/model/arrange.ts)). Listed items come first, in that order. Unknown keys are ignored. Done is never arranged. Anything broken reads as no arrangement ([`readArrangement`](../src/model/arrange.ts)). |
| `schedule` | `ninja-board-today` | `compact`, or anything else for large | `large` | Set by the Schedule's switch. Other values read as large ([`readScheduleView`](../src/model/arrange.ts)). |
| `waiting` | `ninja-board-week` | `group`, or anything else for the column view | `column` | Set by the Waiting switch. Other values read as the column ([`waitingViewOf`](../src/model/arrange.ts)). |
| `collapsed` | `ninja-board-week` | A list of story names: the stories folded in the Week view, on every week, each by its note's name. Anything that is not a list reads as none. | None: no story is folded | Set by a story's chevron, and by Collapse all or Expand all, through `foldStories`. Within the list, a number reads as text, anything else is dropped, and a name is listed once ([`readCollapsed`](../src/model/arrange.ts)). Never pruned: a name stays after its story leaves the week, so the story is still folded when it comes back. Where the config can't be written (an embed, a hover or a canvas), the fold lasts for the session, and a Notice says so. |

```yaml
views:
  - type: ninja-board-week
    name: Week
    arrange:
      todo: [Order cabinets, "Home › Clean the gutters"]
      doing: ["Choose hosting for Sam's site"]
    collapsed: [Order cabinets]
```

```yaml
views:
  - type: ninja-board-today
    name: Today
    schedule: compact
```

## The config note

Ninja Board reads the vault's config note, `99 System/config.md`, for one value: `points_per_week`, the week's points target. It is a number above zero, and the default is 8 when the note, the key or the value is missing. Ninja Board reads it from the note's frontmatter in the metadata cache, and a change to the note redraws the views ([`readPointsTarget`](../src/obsidian/snapshot.ts), `CONFIG_PATH`).

## The Actions interface

Source: [`src/ui/actions.ts`](../src/ui/actions.ts). The views call these and nothing else in the outside world.

- In Obsidian, [`obsidianActions`](../src/obsidian/actions.ts) implements them. `showWeek`, `arrange`, `scheduleView`, `waitingView`, `foldStories` and `showDay` come from the view.
- In the browser preview, [`memoryWrites.ts`](../preview/memoryWrites.ts) implements the write methods in memory.

| Method | Arguments | Returns | What it does |
|---|---|---|---|
| `toggle` | `target: RowTarget` | `Promise<void>` | Ticks or unticks a row. A line goes through Tasks. A note becomes `done`, or `open` if it was done. A repeating note's `done` completes its occurrence (see [Repeating task notes](#repeating-task-notes)). |
| `setState` | `target`, `state: TaskState` | `Promise<RowTarget \| null>` | Sets a row's state. A line gets its checkbox; dropped also gets `[cancelled:: today]`; done goes through Tasks. A note's `status` is set (todo becomes `open`), except that a repeating note's `done` completes its occurrence (see [Repeating task notes](#repeating-task-notes)). |
| `setNoteStatus` | `path`, `status` | `Promise<void>` | Sets a note's `status` (cards on the boards, and the states card). |
| `open` | `path`, `line?` | `void` | Opens a note. With a line, puts the cursor there, in a Markdown view. |
| `plan` | `target`, `to: PlanTo` | `Promise<RowTarget \| null>` | Plans a row on a day, for a week, or to no date yet. A deadline the plan leaves behind goes too (see the [edit contract](#edit-contract-shared-with-the-agent)). |
| `due` | `target`, `date: string \| null` | `Promise<RowTarget \| null>` | Sets a deadline to a date, or removes it with `null`. |
| `arrange` | `lists: Arrangement` | `void` | Saves the given columns' lists in the view's `arrange:`. Other columns are kept. |
| `scheduleView` | `view: ScheduleView` | `void` | Saves `schedule:` on the Today view. |
| `waitingView` | `view: WaitingView` | `void` | Saves `waiting:` on the Week view. |
| `foldStories` | `names: string[]`, `folded: boolean` | `void` | Folds (`true`) or opens (`false`) the lines of these stories in the Week view, on every week, by note name. Saved in the view's `collapsed:`, and not an undo step. Where the config can't hold it, the fold lasts for the session. |
| `showWeek` | `start: string` | `void` | Week view: shows the week starting on this Monday. Session only; the view opens on this week again. |
| `showDay` | `spec: DaySpec` | `void` | Opens the day modal: one day's full timeline. |
| `showAll` | `spec: ListSpec` | `ListHandle` | Opens the list modal, for Show all. |
| `points` | `target: RowTarget`, `points: Points \| null` | `Promise<RowTarget \| null>` | Sets a story's `points` to 1, 2, 3, 5 or 8, or removes it with `null`. Stories only: a line, an area task note, a repeating note or a note that is gone is refused, and nothing is written. Resolves like `setState`. |
| `group` | `label: string`, `run: () => void \| Promise<void>` | `Promise<void>` | Runs `run` as one user action, named `label`. The writes it makes, and any it makes while the promise it returns is pending, are one undo step. |
| `undo` | none | `void` | Undoes the newest Ninja Board step. Cmd/Ctrl+Z in a Ninja Board view does the same. |
| `undoLabel` | none | `string \| undefined` | What the newest step is called, as the Undo button names it; `undefined` when there is nothing to undo. |

A `Promise` resolves to the target as it now stands. It resolves to `null` when no target stands for the task: the vault refused the write, or Tasks answered a recurrence with two lines, so no single line is the task any more ([`ui/actions.ts`](../src/ui/actions.ts), lines 9 to 13).

### Repeating task notes

A task note with a `repeat` key is a repeating note. Its states are written as for any note, except done and dropped.

- **Complete** (`setState` to `done`, or a tick on a note that is not done). Ninja Board takes one next-date step from the `due` being completed, or from the day it is done when `repeat_from` is `done`. The note is written open with that `due`, and `scheduled`, `start`, `waiting_on`, `chase` and `done` are removed. The occurrence goes to the top of the note's `## Log` section as `- <day done> Done: the occurrence due <due>. Next due <next>.`; a note with no `## Log` section gets one at its end. The whole completion is one undo step. Undo takes the Log line out again, but only while the note is as Ninja Board left it ([`applyNoteComplete`](../src/model/repeat.ts), [`setNoteState`](../src/obsidian/writes.ts)).
- **Drop** (`setState` to `dropped`). The note is `dropped`, and `done` is set to today, kept if already set. Its `repeat` and `due` stay, and no Log line is written.
- **Refused.** A `repeat` that does not parse, or a note with no `due` that is a date, is refused. The Notice "Can't complete this repeating note: its repeat or its due date isn't one this plugin knows" shows, nothing is written, and `setState` resolves to `null`.
- **Other states** (to do, doing, waiting) are a plain `status` write. No occurrence is recorded.

The repeats Ninja Board reads are `every <n> day`, `week`, `month` or `year` (with an optional `s`), and `every <weekdays>`, such as `every tue` or `every mon, wed, fri` or `every mon-fri`. `repeat_from` is `due` (the default) or `done`. `if_missed` is `carry` (the default, the missed date stays due) or `lapse` (the missed date is skipped).

### Shapes

- **`RowTarget`** ([`types.ts`](../src/model/types.ts)): `{ kind: 'line', path, line, raw }`, where `line` is the 0-based line number and `raw` is the line as read. Or `{ kind: 'note', path, state }`, where `state` is the state as drawn, so a toggle acts on what the user saw.
- **`TaskState`**: `todo`, `doing`, `waiting`, `done`, `dropped`. A line's checkbox is ` `, `/`, `w`, `x` and `-`. A task note's `status` is `open`, `doing`, `waiting`, `done` or `dropped`. The implementation spec also lists `someday` for task notes.
- **`PlanTo`**: `{ day: 'YYYY-MM-DD' }` for a day. `{ week: 'YYYY-MM-DD' }` for a week, with that week's Monday. `null` for no date yet.
- **`Points`** ([`points.ts`](../src/model/points.ts)): `1`, `2`, `3`, `5` or `8`. Only these are points; anything else reads as none.
- **`Arrangement`**: `Partial<Record<'todo' | 'doing' | 'active' | 'paused' | 'someday', string[]>>`.
- **`ScheduleView`**: `'large'` or `'compact'`.
- **`ListSpec`**: `key` (`'done'`, `'someday'`, `'open'`, `'dueSoon'` or `'noDate'`), `title`, `noun`, `count`, `entries`, `drag`, `zones`, and optional `onDrop`, `collapsed` and `opener` (the Show all button, which takes the focus back when the modal closes). `collapsed` is the Week view's folded story names, as a set: the list's story cards fold by it on every week, and a fold made in the list also folds the page behind it. Lists without it (Backlog's) fold their story cards behind an always-shown chevron, closed by default, opened for the session only and never saved.
- **`DaySpec`**: `title`, `events`, an optional `now` (`"HH:MM"`, today only), and the `opener` element that takes the focus back.

## Failure behaviour

A failed write never rejects. Each async action catches its own error, shows a Notice, and resolves to `null`, or to nothing for the `void` ones ([`saved`](../src/obsidian/actions.ts), line 90).

| Situation | Notice |
|---|---|
| The write threw | "Ninja Board couldn't save that change" |
| The line changed since it was drawn | "That task changed — refreshed". The write is refused, and the view redraws from the vault. |
| Tasks is missing, so a tick cannot go through it | "Tasks must be on to tick a task" |
| Tasks returned something Ninja Board can't use, or an answer that does not do what the tick was for | "Tasks gave an answer this plugin can't use". Nothing is written. |
| The note is gone, for a write | No write, and `null` is returned. No Notice. |
| The note is gone, for opening | Nothing happens. No Notice. |
| A repeating note's completion is refused | "Can't complete this repeating note: its repeat or its due date isn't one this plugin knows". Nothing is written, and `setState` resolves to `null`. |
| An arrangement, in an embed, a hover or a canvas | "Open the dashboard note itself to arrange this board". Nothing is saved. |
| The Schedule's form, in an embed, a hover or a canvas | "Open the dashboard note itself to keep the Schedule view". The choice lasts for the session. |
| A fold, in an embed, a hover or a canvas | "Open the dashboard note itself to keep stories folded". The fold lasts for the session. Shown once per view. |
| A fold's save throws | "Couldn't save the folded stories". The fold lasts for the session. Shown once per view. |
| Opening a note throws | "Ninja Board couldn't open that note" |

## Edit contract shared with the agent

Ninja Board and the agent are meant to make the same edits, so the same action gives the same result on either side. Only Ninja Board's side is tested in this repository so far. The rules are in the [Edits table of the implementation spec](https://alexsendula.github.io/second-brain/implementation/). The planning rules are also in [round 2, section 4](design/2026-10-14-brain-plugin-round-2-design.md). The summary below is what the code does now.

### Planning and deadlines

Planning and deadlines are Tasks' own fields, `[scheduled::]`, `[start::]` and `[due::]`. A task note uses the frontmatter keys `scheduled`, `start` and `due`. Dates are `YYYY-MM-DD`.

- **Plan on a day** (`{ day }`): sets `scheduled` and removes `start`. A line keeps its other fields, and a round-bracket field stays round-bracketed ([`lineWithPlan`](../src/obsidian/edits.ts), line 116).
- **Plan for a week** (`{ week }`, the Monday): sets `start` and removes `scheduled`.
- **No date yet** (`null`): removes `scheduled` and `start`.
- **A deadline the plan leaves behind goes too**, by [`planDropsDue`](../src/model/plan.ts) (line 12):
  - a day or week in a later ISO week than the deadline's removes `due`;
  - a plan in the deadline's own week, or an earlier one, keeps it;
  - no date yet removes a `due` on or before this week's Sunday. A deadline further out stays.
  - A repeating task note keeps its `due` whatever the plan. This is in `edit-cases.json` (`notePlans`) and in the Edits table of the implementation spec.
- **Set a deadline** (a date): sets `[due::]` (or `due:`), replacing any `due`. A `scheduled` on that same date is removed.
- **Remove a deadline** (`null`): removes `due`. A repeating task note's `due` is never removed this way ([`applyNoteDue`](../src/model/plan.ts), line 51).

Other rules that the edits share:

- **States of a line.** The checkbox changes. Reopening removes the completion and cancelled dates. Dropping adds `[cancelled:: <today>]`. Done is written by Tasks, which adds `[completion::]` ([`lineWithState`](../src/obsidian/edits.ts), line 83).
- **Status of a note or project.** `status` is set. `done` is stamped with today when the status is `done` or `dropped`, and kept if it is already there. Any other status removes `done` ([`applyNoteStatus`](../src/obsidian/edits.ts), line 92).
- **Dates.** Ninja Board writes only dates it was given, plus today's date when an edit needs one (a completion, a cancelled date, or a `done`).

### Story points

A story's `points` is one of 1, 2, 3, 5 or 8 in its frontmatter. Setting a value replaces any value there was; `null` removes the key. Nothing else in the note changes ([`applyNotePoints`](../src/model/points.ts)). Only stories take points: a task note in a project's folder that does not repeat. The `notePoints` section of `edit-cases.json` pins the results.

### Shared examples: `test/edit-cases.json`

[`test/edit-cases.json`](../test/edit-cases.json) holds the examples both sides must pass. Its `today` is `2026-10-14`. [`edit-cases.test.ts`](../src/obsidian/edit-cases.test.ts) runs each section against the pure functions in [`edits.ts`](../src/obsidian/edits.ts) and [`src/model/plan.ts`](../src/model/plan.ts).

| Section | Cases | Pins |
|---|---|---|
| `lines` | 12 | Line states, through `lineWithState`. One case, "complete a task", is made by Tasks (`"by": "tasks"`). Ninja Board's test reads back the line Tasks wrote (done, its completion date and its deadline), and `brain complete` must write the same shape. |
| `notes` | 11 | Status changes of task notes and projects, through `applyNoteStatus`, including a repeating note's drop. |
| `plans` | 43 | Line plans, and the deadline rules, through `lineWithPlan`. A case may set its own `today`. |
| `notePlans` | 37 | Note plans, through `applyNotePlan`. A repeating note keeps its `due` whatever the plan. |
| `dues` | 9 | Line deadlines, through `lineWithDue`. |
| `noteDues` | 4 | Note deadlines, through `applyNoteDue`. |
| `notePoints` | 9 | Story points: set, replace and remove, through `applyNotePoints`. |
| `noteCompletes` | 13 | Completing a repeating task note: the next due date, the frontmatter that goes, and the Log line, through `applyNoteComplete` and `withLogEntry`. A case with `refused` changes nothing. |

The points cases stand for `brain points`, the planning cases for `brain plan` and `brain due`, and the `noteCompletes` cases for `brain complete`, which must make the same edits ([`edit-cases.test.ts`](../src/obsidian/edit-cases.test.ts), line 46).

### The agent's commands

As the [implementation spec defines them](https://alexsendula.github.io/second-brain/implementation/) (section 1, "Agent tools"):

| Command | Does | Same as in Ninja Board |
|---|---|---|
| `brain state <file>[:<line>] <state>` | Sets a line's or a note's state. A repeating task note goes through `brain complete`. | `Actions.setState` |
| `brain plan <file>[:<line>] <date\|YYYY-Www\|none>` | Plans a task on a day, for a week, or to no date yet. | `Actions.plan`, with the same deadline rules |
| `brain due <file>[:<line>] <date\|none>` | Sets or removes a deadline. | `Actions.due` |
| `brain points <file> <1\|2\|3\|5\|8\|none>` | Sets or removes a story's points. A note, so no line. | `Actions.points` |
| `brain complete <file> [--date <date>]` | Completes a task, and writes a completed line in Tasks' shape. Repeating task notes get their next date here, and their Log line, as Ninja Board writes it (`noteCompletes`). | The shape Tasks writes, pinned by the `"by": "tasks"` case |
| `brain week [<week>]` | Builds or refreshes a week plan. Its record is what Ninja Board reads for a past week. | Ninja Board reads the record. It never writes one. |

These commands are not in this repository. The spec defines them, and they will run from the vault's `.agents/skills/brain/scripts/brain` once installed.

Settled on 2026-10-15, and written into the implementation spec's Subcommands line:

- `:<line>` in `brain state`, `plan` and `due` is 1-based, as editors show it. Ninja Board's own index (`TaskLine.line`) is 0-based, and the CLI converts.
- `brain state` takes Ninja Board's words for a task line: `todo`, `doing`, `waiting`, `done` or `dropped`. A task note keeps its status values: `open`, `doing`, `waiting`, `someday`, `done` or `dropped`.

## Related documentation

- [Architecture](ARCHITECTURE.md): the layers, the data flow, and the decisions behind them.
- [Plugin README](../README.md): the user's guide, and the dashboard notes.
- [Implementation spec](https://alexsendula.github.io/second-brain/implementation/): the agent side and the Edits table.
- [Plugin design](design/2026-10-13-brain-plugin-design.md) and [round 2 design](design/2026-10-14-brain-plugin-round-2-design.md).
