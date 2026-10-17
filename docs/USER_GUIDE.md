# User guide

How to use Ninja Board day to day: the dashboard notes, each view, planning a week, the cards, and the exact edits Ninja Board makes to your notes. To install it, see the [README](../README.md). When something doesn't show, see [Troubleshooting](TROUBLESHOOTING.md).

- [The Tasks setup check](#the-tasks-setup-check)
- [Dashboard notes](#dashboard-notes)
- [The views](#the-views)
- [Working with the views](#working-with-the-views)
- [The cards](#the-cards)
- [Weeks](#weeks)
- [Busy days](#busy-days)
- [Long lists](#long-lists)
- [Arranging](#arranging)
- [Repeats](#repeats)
- [Task line format](#task-line-format)
- [Story points](#story-points)
- [Undo](#undo)
- [Dates Ninja Board writes](#dates-ninja-board-writes)

## The Tasks setup check

The Guide's **Setup** tile checks four things:

- Tasks is on.
- Its Task Format is Dataview.
- **Set done date on every completed task** is on.
- A custom status with symbol `w` and type `ON_HOLD` exists.

It does not read the status's name or its next status symbol, so check those yourself.

The tile reads the settings Tasks has saved (its `data.json`, through Tasks' `loadData()`) each time the Guide is drawn. Reopen the Guide after you change them.

- A Tasks install whose settings were never changed has nothing saved, so it runs on Tasks' defaults. The Format and Waiting lines show **To fix**. The done date line shows OK, since Tasks sets the done date by default.
- When the settings can't be read, the line says **Can't check**.

Ninja Board ticks task lines through Tasks, so done dates come from one engine (see [Dates Ninja Board writes](#dates-ninja-board-writes)). Without Tasks the views still render, but ticking a task line shows a Notice instead.

## Dashboard notes

`01 Dashboard/` holds one note per view, numbered so the file list shows them in order: `01 Today.md`, `02 Week.md`, `03 Projects.md`, `04 Backlog.md` and `05 Guide.md`. Each one is a `type: note` with a single `base` block. The [README](../README.md#add-the-dashboards) has the block and the view types.

- Bases' own toolbar stays above each view. Its filter chooses which notes Ninja Board shows. Ninja Board ignores Bases' grouping and sorting and uses its own order.
- The command **Ninja Board: Open Today** opens it from anywhere.
- The command **Ninja Board: Open guide** opens `05 Guide.md`. When that note is missing, a Notice says so. The Guide is also in Bases' view picker as Ninja Board · Guide.

## The views

| View type | In the Bases view picker | Shows |
|---|---|---|
| `ninja-board-today` | Ninja Board · Today | The date, with a ring and "N left". **Now:** tasks in doing. **Today:** tasks due today, or planned today or on an earlier day and still open, overdue tasks, and waiting tasks whose chase date has come. **Schedule:** today's appointments, as a timeline in a **Large** or **Compact** view; see [Busy days](#busy-days). **Done today:** collapsed, and hidden while nothing is done. |
| `ninja-board-week` | Ninja Board · Week | The week (ISO, Monday to Sunday), with a ring. A strip of the seven days, each with the appointments still to come and its planned and due task counts. A board with To do, Doing, Waiting and Done: stories are cards, with their task lines tickable on the card, and loose task lines are rows. **‹** and **›** page through the weeks, and **Coming up** lists the next three; see [Weeks](#weeks). |
| `ninja-board-projects` | Ninja Board · Projects | A board by status: Active, Paused, Someday and Done. Each card shows the area, the due date, a progress ring and the next open task. A Done card shows its finish date instead, with no ring or next task. Choosing Dropped on a project card takes it off the board. Done shows the 3 most recently finished projects and Someday the 5 most recently added, each with **Show all**; see [Long lists](#long-lists). |
| `ninja-board-backlog` | Ninja Board · Backlog & Waiting | **Backlog:** the inbox with each item's age, undated tasks grouped by project or area, and someday projects (the 5 most recently added, with **Show all**). **Waiting:** one tile per person you're waiting on, with their waiting tasks, the context and the earliest chase date. A chase date that has passed stands out. |
| `ninja-board-guide` | Ninja Board · Guide | What the marks mean, how to do things with a mouse, touch or keyboard, how to plan in six steps, what each view shows, the time words, who does what (you in Ninja Board, or the agent), and the [Tasks setup check](#the-tasks-setup-check). |

What each view reads:

- **Today** reads the tasks of projects, areas and task notes that are in play: not paused, someday, done or dropped, and not inside a paused, someday, done or dropped project.
- **Week** reads only active projects and areas, and the task notes in them. A task with no date is not on the board: it is in To plan or in Backlog's No date. A waiting task sits in Doing.
- A task line in an inbox item, a conversation or a plain note never shows on either view.
- Notes under `10 Archive/` never show on any view.

The note types and the fields each view reads are listed in [Database](DATABASE.md#note-types).

## Working with the views

Ticking, planning, opening and undo are in the [README's Use it list](../README.md#use-it). Moving and arranging need more detail:

- **Move:** on the Week and Projects boards, drag a row or a card to another column. A drop anywhere in the column counts.
  - A task line's row changes its checkbox, and a task note's row changes its `status`. A story or project card changes the note's `status`.
  - A task that can be planned can also be dragged onto a day of the strip, on this week or an upcoming week. On an upcoming week it can also go onto **Planned or due**, or back onto **To plan**. Days before today take no drop; see [Weeks](#weeks).
- **Arrange:** on the Week board's To do and Doing and the Projects board's Active, Paused and Someday, drag a card or row to a place in its column. A grey slot shows where it lands. Alt+↑ and Alt+↓ move the focused card or row one place. See [Arranging](#arranging).
  - Done columns keep their time order; dragging over one only tints it.

## The cards

Right-click a row or a card (long-press on touch, or the context-menu key or Shift+F10) to open its card.

- The planner card stays open while you pick, even when the row moves underneath it.
- A states, story or project card closes after a state pick, and the focus goes back to its row or card.
- Every card closes on Escape or a click outside.
- Keys:
  - Tab, → or ↓: next button.
  - Shift+Tab, ← or ↑: previous button.
  - Enter or Space: press it.
  - Escape: close the card and return to the row.

The kinds of card:

- **Planner card:** for a task line or a task note that can be planned. It shows the task's title, the week you're planning with its any-day button, and seven day chips for that week.
  - Click a day to make it the do day (`scheduled`).
  - Click that same day again to make it the due day (`due`, in red). It stops being the do day.
  - Click the red day again to make it the do day, and remove the deadline.
  - The do day and the due day differ by colour alone.
  - Beside the days are the other week (its button names that week, such as "Next week" or "This week") and **Later**, which swaps the days for a week scroller and **No date yet**. No date yet clears the plan.
  - A plan can remove a deadline it leaves behind; see [When planning removes a deadline](#when-planning-removes-a-deadline).
  - Under them are the five states, as marks. Pick done, dropped or waiting and the plan controls hide (their room stays, so the card keeps its size). Pick to do or doing and they come back.
- **States card:** a task row Ninja Board doesn't plan, such as a done or dropped line, or a waiting task line or note. It shows its title and its states.
- **Story card:** a story on a board or in a list. It shows its title and its task states, written as the note's `status`.
- **Project card:** a project card, or a Someday row. It shows its title and the five states: Active, Paused, Someday, Done and Dropped.
- **Repeating rows:** a repeating task note opens the planner card like any task note. A plan (a day, a week or no date) never removes its deadline, and Space ticks it, which completes one occurrence.

## Weeks

The Week view opens on this week, the live board. **‹** and **›** step to the weeks before and after, **This week** comes back, and a click on a **Coming up** week shows it.

On this week, Coming up always lists the next three weeks, each with its count: the open tasks due or planned that week, plus its one-off appointments. Weekly repeating appointments are left out. Other weeks don't show Coming up.

### An upcoming week

An upcoming week is a preview.

- Its strip shows the appointments and how many tasks are planned or due on each day.
- **Planned or due** lists those tasks: **Any day** first (the tasks planned for the whole week), then each day.
- Under a day's heading, a part dated that day reads "Due", "Chase" or "Planned". A part dated another day keeps its words, as in "Planned · Due Fri".
- Rows can be ticked, given a state and opened, as anywhere.

### Planning a week

**Plan this week** opens **To plan** beside Planned or due, and **Done planning** closes it. To plan also closes when you leave that week. It has three groups, each with a count:

- **Still open this week:** open tasks due, planned or starting by this week's Sunday, and not planned for a later week, in the board's order.
- **Due soon:** open tasks due in the four weeks after it and not yet planned, soonest first.
- **No date:** the undated tasks and open task notes from active projects and areas, grouped by project or area.

A group shows 5 rows, then **Show all N**. To plan leaves out waiting tasks, repeating task notes, tasks in someday or paused projects, and tasks already planned for another week.

To plan a task:

- Drag a row onto a day of the strip to plan it on that day.
- Drag it onto **Planned or due** to plan it for the week, any day.
- Drag it back onto **To plan** to leave it with no date yet.
- Or use the planner card, which does the same and also sets and removes deadlines.

Planned or due's plannable rows can be dragged only while To plan is open. Planning writes Tasks' own fields; see [Task line format](#task-line-format).

**What can be planned:** task lines that are to do or doing, and task notes that are open or doing, stories and repeating notes included. Waiting task lines and notes can't be planned in Ninja Board: a waiting line's `scheduled` is its chase date, and the agent sets those dates.

### A past week

A past week is read-only. Nothing on it can be ticked, dragged or planned, and titles open their note where it still exists.

- When its week plan, `08 Weeks/<year>/<YYYY-Www>.md`, holds a record (written by the agent), Ninja Board shows the week as it was at its turn: **Not done** (an item that left the week reads "moved → Thu 22 Oct"), **In progress** and **Done**, with **Backlog** folded under its count. A line above the board says, for example, "Record · frozen Mon 12 Oct" (or "Record · updated …" before the freeze). A record needs all five of its sections.
- Without a record, Ninja Board shows **From your notes**: what was finished that week, and what was due or planned then and is still open.

## Busy days

Today's **Schedule** and the Week strip stay readable on a day with many appointments.

- **An appointment's block** shows its title on the first line and its time and place on the second ("17:30–18:30 · Home"). A line that doesn't fit ends in an ellipsis. A block too short for two lines shows only its title; hover it for the rest.
- **Large** (the default) shows about 6 hours of the day and scrolls inside the tile, opening with now near the top.
  - A thin line marks now and moves every minute. A soft fade shows at an edge with more beyond it.
  - **Whole day** grows the tile to the full day in place, then reads **Fit**, which folds it back to now.
  - A timeline of 6 hours or less (with its hour of padding above and below the appointments) has nothing to scroll, so it has no Whole day.
- **Compact** squeezes the whole day into the same height, with no scrolling. A block too short for its text reads "title · start"; hover or focus it to see its time and place.
- **The switch** in the Schedule's label row names the view it goes to: "Compact" in Large, "Large" in Compact. Your choice is saved in the dashboard note's `base` block as `schedule: compact` (Large is the default), only when the base is shown in its own note. In an embed, a hover preview or a canvas, the switch works for the session, and a Notice says "Open the dashboard note itself to keep the Schedule view".
- **Below 560px** the Schedule is the plain list, and both buttons hide. It is also the plain list at any width when an appointment today has no start or no end: there is no timeline then, and no switch.
- **The Week strip** shows each day's appointments that haven't finished, at most 3:
  - An appointment has finished when its end has passed (its start, when it has no end). One with no time is not finished before the day is.
  - Days before today show none, and today hides the ones that have ended.
  - When a day has more, a quiet **+N more** (N counts every appointment not shown, the finished ones too), or **N earlier** when none are shown, opens that day's full view.
  - Ninja Board draws the strip again when the next appointment ends.
- **The full view** is a window titled, for example, "Wednesday 14 October · 5": the whole day's timeline with the finished appointments, a now-line on today, and a list instead of the timeline when the window is narrow. Escape or × closes it, and the focus goes back to the button.
- **The narrow strip** (the day buttons and the picked day's list) follows the same rules.
- **Other weeks.** An upcoming week shows each day's first 3 and **+N more**, since nothing has finished. A past week's record shows its appointments as they were.

## Long lists

Projects' **Done** shows the 3 most recently finished projects, and **Someday** (on Projects and in Backlog) the 5 most recently added. **Show all N** in the column's or tile's header opens the list modal: a title with the count, a search field that filters as you type, and the same cards in a grid.

- In the modal, press and hold an item to drag it out onto the board, where Projects' Done and Someday and To plan's groups accept it.
- Escape, or a drop outside a target, puts the item back and brings the modal back.
- Backlog's Someday modal has no drag: its cards change through their card.

## Arranging

How you arrange the Week and Projects boards is saved in `02 Week.md` and `03 Projects.md`, as an `arrange:` list per column under the view in the `base` block:

```yaml
views:
  - type: ninja-board-week
    name: Week
    arrange:
      todo: [Order cabinets, "Home › Clean the gutters"]
```

- **Columns.** Week has `todo` and `doing`. Projects has `active`, `paused` and `someday`. Done is never arranged.
- **Keys.** A card, or a row that is a task note, is listed by its note's name. A task line is listed as `<note name> › <text>`: its note's name, then the line's text as shown, without its fields, link brackets or tags.
- **Order.** Listed items come first, in that order, and the rest follow in the normal order. A key that's no longer on the board is ignored and dropped the next time you place an item in that column; a repeating row arranges within its own column only.
- **Saving.** A drop rewrites the list of the column it lands in, and the column it left only if you had arranged it, with the moved item taken out. Bases saves the whole `base` block each time, so your formatting and comments inside it are normalized.
- **Only in the note itself.** Bases can save only when the base is shown in its own note (Reading view or Live Preview) or in a `.base` file. In an embed (`![[Week]]`), a hover preview or a canvas, a move between columns still changes the task's state, but the arrangement isn't saved, and a Notice says "Open the dashboard note itself to arrange this board".
- **Layout only.** Nothing reads meaning into the order. The agent can edit the same lists.

The Schedule's view is saved the same way, as `schedule: compact` under the Today view (see [Busy days](#busy-days)).

## Repeats

**Repeating task notes** (frontmatter `repeat`) show as rows, like any task note, with the repeat on a line of its own.

- A tick, or a drop on Done, completes one occurrence. Ninja Board writes the next due date (see [Dates Ninja Board writes](#dates-ninja-board-writes)) and a line in its `## Log` section. The note stays open, and the occurrence shows as a Done row in the week it was done.
- A drop on any other column sets its state.
- It plans like any task note: its plan decides its week, and its deadline stays on the note and on its row. With no plan, it is in the week its next due date falls in.
- A repeat Ninja Board can't read, or a note with no due date, is refused with a Notice, and nothing is written. So is a repeat whose next date would pass 9999 or lie more than 100 years ahead.

**Task lines** don't repeat.

**Appointments** that repeat weekly (`every tue`, `every mon, thu`, `every mon-fri`) show on each of their days. Other repeats (`every 2 weeks`, `every month`) show only on the date the note holds.

## Task line format

Task lines use the Tasks plugin's Dataview format: a checkbox, then the text, then fields in square brackets.

| State | Checkbox | Example | Tasks status type |
|---|---|---|---|
| To do | `[ ]` | `- [ ] Send Sam the hosting options [due:: 2026-10-17]` | TODO |
| Doing | `[/]` | `- [/] Build the homepage header [scheduled:: 2026-10-13]` | IN_PROGRESS |
| Waiting | `[w]` | `- [w] Get photos from [[Sam Rivers]] [scheduled:: 2026-10-20]` | ON_HOLD (the custom status) |
| Done | `[x]` | `- [x] Pick design B with Sam [completion:: 2026-10-12]` | DONE |
| Dropped | `[-]` | `- [-] Try a page builder [cancelled:: 2026-10-11]` | CANCELLED |

### Dates

- `due` is the deadline.
- `scheduled` is the planned day. For a waiting task, `scheduled` is the chase date, and the text names who you're waiting on.
- `start` is a week plan: the task is planned for that week, any day, and its value is that week's Monday.

### What planning writes

- **Plan a task on a day** writes `[scheduled:: 2026-10-21]` on its line, replacing a `scheduled` it has and removing a `start`.
- **Plan a task for a week, any day** writes `[start:: 2026-10-19]`, that week's Monday, replacing a `start` and removing a `scheduled`.
- **Unplan a task (later, no date)** removes every `scheduled` and `start`.
- A task note gets `scheduled: 2026-10-21`, `start: 2026-10-19` or no such key in its frontmatter instead.

These are the edits listed in the implementation's [reference format](https://alexsendula.github.io/second-brain/implementation/#2-reference-format).

### When planning removes a deadline

Planning removes a `due` only when the plan leaves it behind. Otherwise a task due this week could not be moved out of it. Weeks run Monday to Sunday.

- A day or a week in a later week than the deadline's removes it, an overdue one included. For example, `- [ ] Renew passport [due:: 2026-10-15]` planned on 2026-10-21 becomes `- [ ] Renew passport [scheduled:: 2026-10-21]`, and a note's `due` key is deleted.
- No date yet removes a `due` on or before this week's Sunday (due this week, or overdue).
- A plan in the deadline's own week or earlier keeps it, and so does no date yet for a deadline further out.
- A repeating task note keeps its `due` whatever the plan.

### Deadlines

- **Set a deadline** writes `[due:: 2026-10-23]` (`due: 2026-10-23` in a note), replacing a `due` it has, and removes a `scheduled` on that same date.
- **Remove a deadline** removes the `due`. A repeating task note's `due` is never removed this way.
- The day chips on the planner card set or remove a deadline too.

### Other rules

- **Brackets:** parentheses work too, as in `(due:: 2026-10-17)`.
- **Pointer lines:** a line that holds only a link, such as `- [ ] [[Choose hosting for Sam's site]]`, points to a story. Ninja Board shows the story, not the line.
- **Odd input:** an unknown checkbox symbol counts as to do, and an invalid date is ignored.
- **The agent** is meant to make the same edits with its own `brain` commands, which are not in this repository: `brain plan <file>[:<line>] <date|YYYY-Www|none>` plans a task on a day or for a week, or unplans it, and `brain due <file>[:<line>] <date|none>` sets or removes a deadline.

## Story points

A story (a task note inside a project folder) can carry an estimate in story points: `points: 1`, `2`, `3`, `5` or `8` in its frontmatter. Stories without one have no estimate, and only stories carry points, never their tasks. Pick the estimate from the story's card, where the story can be planned.

The Week view shows the points planned for the week as a ring against the week's target, with a label such as `12/8+4 pts`: planned against the target, and the raised `+4` is the overflow past it. The target is `points_per_week` in `99 System/config.md`, or 8 when it isn't set.

## Undo

**Undo the last change** (a command, with no default hotkey) reverts the newest change. Cmd/Ctrl+Z in a view does the same; text fields and the editor keep their own undo. Undo leaves alone anything changed since, and says so. The Undo button at the top right of each page shows only when there is a step to undo; its space is kept, so the page does not jump when it appears.

## Dates Ninja Board writes

Ninja Board filters by dates and puts them into words, such as "Due Thu", "3 days overdue" and "Chase Thu". The only dates it writes are:

- today's, when an edit needs one (a line's cancelled date, or a note's `done`);
- the planned day, week or deadline you set;
- a repeating task note's next due date, when you complete an occurrence: one step from the due date, or from the day it was done, as the note's `repeat_from` says. This is the one date it sets on its own.

Everything else belongs elsewhere:

- **Task lines:** when you tick, Tasks writes the completion date, wherever you tick from.
- **Past weeks:** the agent's `brain week` writes a week's record and freezes it at the week's turn. Ninja Board only reads it.
- Carry-over and other repeats are the agent's job.

"Today" is the computer's local date, and weeks are ISO weeks, Monday to Sunday.
