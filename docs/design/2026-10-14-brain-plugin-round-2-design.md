# Ninja Board: round 2 design (guide, arranging, weeks, long lists)

The second round of the Ninja Board plugin, after a first look at v0.1.0 in Obsidian. It builds on `2026-10-13-brain-plugin-design.md` (the plugin) and the [implementation spec](https://alexsendula.github.io/second-brain/implementation/) (the implementation it belongs to). Nothing here changes the [system design](https://alexsendula.github.io/second-brain/system-design/).

| | |
|---|---|
| Status | 2026-10-15. Built (v0.2.0); see section 10. Busy days (section 4a) added the same day, after a check by hand in Obsidian. Waiting on the Week board (section 4b) was added on 2026-10-15 and is built too; see section 10. |
| Visual design | The mockup ([design/mockup.html](../../design/mockup.html)), with the round-2 states added |

## 1. What was asked for, and what was decided

| Ask (shortened) | Decided |
|---|---|
| "I miss the state sheet … rename and redesign so it helps a user get up to speed or remember things." | A fifth view, **Guide**, with its own dashboard note and a command. (A ? button in every view's head was tried and dropped: "Remove the ? button. It's not needed. Keep the guide page.") |
| "When dragging cards, the drop area is only over what is already there. It should extend to the full column." | Every board column takes a drop along its full height. |
| "I want to put a card at the top or in between, and move them around." A position means **just arrangement**, not priority. | Cards and rows can be arranged on the **Week and Projects boards**. The arrangement is saved in the dashboard note, not in task notes. Today and Backlog keep their automatic order. |
| "A view where I can see previous weeks and upcoming weeks." Past weeks: **both** what got done and what didn't; "at the end of the week I snapshot that week … what got done, what was in progress, what was in backlog, what wasn't done." | **Paging plus Coming up** on the Week view. A past week shows its **frozen record**, taken automatically at the week's turn, as a read-only board. An upcoming week shows a preview. |
| Planning by dragging onto a day: "interested … but make sure it does not affect the snapshots … I mostly plan next week with an agent in the chat." After the mockup: "what if I don't want to tie it to a specific day, or work on it over multiple days … it should work with Tasks", "an option to move this to next week or later", "how do I switch between preview and planning?" | Planning is in, all through Tasks fields: on a day (`scheduled`), or for a week, any day (`start` = that Monday). A `due` the plan leaves behind goes with it (section 4, decided 2026-10-15); otherwise a deadline is set or removed only from the planner card's red chip. Upcoming weeks get a clear **Plan this week** button that opens **To plan** (leftovers, due soon, no date). Right-clicking a task opens a **planner card** (option B of three sketches was picked): the week being planned, any day, with its days right there, then **This week / Next week** and **Later** (a week scroller and **No date yet** for "later, but not yet when"), and the states as a row of marks at the bottom. The week record never loses an item that moved out of the week. |
| "On the projects page … won't Done fill up quickly? Same worry for Someday in Backlog." Then: "what if we have 30 items? … a pop-up (modal) … a grid view with all these items … a searchbar … drag it to the right area … or right-click to move it." | Done shows the 3 most recently finished, Someday the 5 most recently added; **Show all** opens a modal with search and a card grid, where a card can be opened, moved through its menu, or dragged out onto the board. Archiving at the weekly review keeps Done short anyway. |
| After the mockup: "Coming up … what if we have items 10 weeks in advance … won't that crowd that section?" Then: "let's make that section just the upcoming next 3 weeks and that's it." | Coming up shows the next 3 weeks, always, each with its count. Further weeks are reached by paging. |
| After the mockup: the repeating "Dentist checkup" can't be moved around. | A repeating row can be arranged within its column (layout only); its state and dates stay the agent's. |
| Third review: "when dragging … it's empty when it moves somewhere else. Maybe put in a grey boxed outline there." "Still cannot drag from the modal to outside." "Put the show all button on the top of that card." "Remove the text 'Drag onto a day…'." | The landing spot is a grey outlined **slot** the size of the item. Every list modal can be dragged out of (press and hold). **Show all** sits in the tile's or column's header. To plan has no hint line. |
| Waiting should be its own place on the Week page, so a waiting item stays in the week and can be moved back from there. The switch should show "not just the icon or close by, but over the entire waiting section/area". | Two views behind a switch saved as `waiting:` in the Week note: a Waiting column (the default), and Group view, which lays Waiting out under Doing at 720px and up. The switch shows only while the pointer is over the whole Waiting section. Section 4b, built (see section 10). |

Unchanged rules: Ninja Board keeps no data of its own, does no date math, and every edit it makes the agent can make with the same result (parity).

## 2. Guide

- **A view** `ninja-board-guide`, named "Ninja Board · Guide" in the Bases view picker (icon `book-open`), with a dashboard note `01 Dashboard/05 Guide.md` like the other four. The command **Ninja Board: Open guide** opens that note.
- No button in the other views: the guide is reached through its dashboard note, the view picker, or the command. If the command finds no `01 Dashboard/05 Guide.md`, a Notice says so.
- **Content**, top to bottom, each a tile on the guide page:
  1. **Marks.** Every mark drawn with the real components: to do, doing, waiting, done, dropped, repeating ("done via the agent"), an overdue date, a passed chase date, a story card with its ring. One short line each.
  2. **Doing things.** Tick, plan or set a state, move, arrange, open. Each with mouse, touch and keyboard (click / Space; right-click / long-press / context-menu key or Shift+F10, which opens the planner card; drag / drag; drag within a column / Alt+↑ and Alt+↓; click a title / Enter).
  3. **Planning.** The planner card in six short steps: right-click a task (the card stays open while you pick); "This week, any day" (the whole week, no particular day); pick a day (the do day); pick it again (due that day instead, in red; once more makes it the do day again); Next week and Later (another week, or No date yet: back to the backlog; a deadline in a week it leaves goes too); Plan this week (on an upcoming week, drag from To plan onto a day, or onto Planned or due for any day). Narrow: one step a row; wider: two, then three a row.
  4. **The views.** One line per view on what it shows (Week: the days, the board and Coming up; ‹ › for past weeks and weeks to plan).
  5. **Time words.** Today, overdue, this week, due, planned, chase, moved, with the words the views use ("Due Thu", "3 days overdue", "Chase Thu", "moved → Thu 15 Oct").
  6. **Who does what.** In Ninja Board: tick, set a state, plan a day or a week, set a deadline, move, arrange, open. With the agent: creating and planning, repeats, archiving, week records, anything that needs date math. Under both: "The agent can also do everything Ninja Board does, with the same result."
  7. **Setup.** A check, read from the Tasks plugin's saved settings each time the Guide is drawn: Tasks installed and on; Task Format is Dataview; Set done date on every completed task is on (`setDoneDate`; a setting Tasks never saved has its default, on); a custom status `w` of type ON_HOLD exists. Each line shows ✓ or what to change. When Tasks' settings can't be read, the line says "Can't check" instead of a ✗.
- The guide's text lives in the plugin code. It reads nothing from notes except the setup check.

## 3. Dragging and arranging (Week and Projects boards)

- **Full-height columns.** Each column of a board is a drop zone from its label to the bottom of the board; the board's columns stretch to the tallest. Dropping on empty space below the last card counts.
- **Where it lands.** While dragging, the items make room at the landing spot (above the first item, between two items, or below the last), and that room is drawn as a **slot**: a grey outlined box with rounded corners, the height of the dragged item, no fill. The item's old place closes up. In a Done column (Week's Done, Projects' Done), which stays in time order, the whole column tints instead and no slot shows.
- **What a drop does.**
  - Into another column: the state changes as in v0.1.0 (a row's checkbox, a card's `status`). A repeating task note's row can be arranged within its column, but never moved to another column or planned: its state and dates are the agent's.
  - At a position (same or other column, not Done): the arrangement is saved. Week's Waiting is arranged the same way (section 4b).
  - The keyboard does the same: **Alt+↑ / Alt+↓** move the focused card or row within its column, except in Done, which keeps its order.
- **Where the arrangement is saved.** In the dashboard note's `base` block, through the Bases view config (`BasesViewConfig.set`), as one list per column:
  ```yaml
  views:
    - type: ninja-board-week
      name: Week
      arrange:
        todo: [Order cabinets, "Home › Clean the gutters"]
        doing: ["Choose hosting for Sam's site"]
  ```
  - A card's key is its note's name; a row's key is `<note name> › <line text>` (the text as shown, without its fields).
  - Listed items come first, in the listed order; items not listed follow in the normal order. A key no longer on the board is ignored, and dropped on the next save. Week's Waiting differs: an item not listed goes in by its chase date (section 4b).
  - Saving rewrites only the dropped column's list in full, as shown, because the item was placed there. On a move between columns the source column is written only if it had been arranged (a saved list), and then only as that list without the moved item; a column never arranged stays automatic. Nothing is written to task notes for an arrangement.
  - If the list is lost or broken, the board falls back to the normal order. Arrangement is layout only: nothing else (Today, Projects' Next, the agent) reads meaning into it.
  - Projects keeps one list per status column except Done: `active`, `paused`, `someday`.
- **Parity.** The agent can edit the same `arrange:` lists in `01 Dashboard/02 Week.md` and `03 Projects.md`. It's layout, so it adds no rule to the Edits table; the implementation spec notes where it lives.

## 4. Weeks: paging and Coming up

- **Paging.** The Week head gets **‹** and **›** around the week label, and a **This week** button when another week is shown. The view always opens on this week; the shown week isn't saved.
- **Coming up.** Under this week's strip, the next 3 weeks, always: `Week 43 · 5`, `Week 44 · 1`, `Week 45 · 0` (a week with nothing shows its 0, muted). The number counts open tasks due, planned (on a day or for the week) or starting that week, plus its one-off appointments (weekly repeating appointments are left out: they'd add the same to every week). A click shows that week. Only on this week; weeks further out are reached by paging.
- **This week:** the live board, as in v0.1.0, plus arranging and planning (below). A task planned for the week (any day) shows in To do with "This week" in its meta. Waiting on this board (its own column, or a group inside Doing) is designed in section 4b.
- **An upcoming week (preview):**
  - The strip: one-off appointments on their dates, weekly repeating appointments (`every <weekdays>`) on their days, each repeating task note on its next date (its `due`). Other repeats (every n weeks, monthly) only show on the date the note holds: working out later dates is the agent's job.
  - Below it, **Planned or due**: open tasks (lines and task notes) due or planned that week. First **Any day** (planned for the week: `start` in that week, no `scheduled` in it), then each day with its tasks. Rows can be ticked, given a state and opened, as anywhere; there's no board.
  - A clear **Plan this week** button opens the **To plan** tile beside Planned or due ("Done planning" closes it). It's an accent-filled button with a calendar icon in the week's head, beside the title, never tucked away by the figure; with To plan open, the button turns quiet. To plan closes when you leave that week (paging, This week, or another view): coming back to an upcoming week always shows the preview, with To plan closed. To plan has no hint line.
- **Planning (chosen).**
  - **Three ways to plan, all Tasks fields:**
    - **On a day:** drop a row on a day of the strip, or pick the day in the planner card: `scheduled` becomes that date, and a `start` is removed.
    - **For the week, any day:** drop a row on the Planned or due tile itself, or pick the "any day" button in the planner card: `start` becomes that week's Monday, and a `scheduled` is removed. `start` is Tasks' "work on it from" date: the whole week, no particular day. While a row is dragged over Planned or due (and not over a day of the strip), the tile tints and its **Any day** group opens a landing slot labelled "Any day in week 43", so it's clear the drop means the week, not a day.
    - **No date yet:** drag a row back onto To plan, or pick "No date yet" under Later in the planner card: every `scheduled` and `start` is removed, so the task is back in the backlog (To plan's and Backlog's No date) until it's planned. This is the answer to "later, but not yet when". A `due` on or before this week's Sunday (due this week, or overdue) goes with the plan, because it would keep the task in this week; a `due` further out stays.
    - **A `due` the plan leaves behind goes with it** (decided 2026-10-15). A day or a week in a later ISO week than the deadline's removes the `due` (a line's field or a note's frontmatter key); the same week or an earlier one keeps it (due Thu, planned Sat: kept). Otherwise a task due this week could not be moved out of it. Planning never ties a day and a week together, and a new plan replaces any old one: a day plan clears `start`, a week plan clears `scheduled`, wherever they were.
  - **The planner card (chosen: option B).** Right-click, long-press or the context-menu key on a task row (lines and task notes, on Today, Week and Backlog) opens Ninja Board's own **planner card** at the row, a small popover in Obsidian's menu style (Obsidian's menu can only hold plain text items). Big, direct targets first:
    - The task's title.
    - A primary button for **the week you're planning, any day**: on an upcoming week "Week 43, any day"; everywhere else "This week, any day". Under it, that week's seven **day chips** (weekday letter over the date; past days disabled, today marked). The task's **do day** (its planned day, `scheduled`) shows in the normal selected style (accent); its **due day** (`due`) shows **red** (red tint, red text). No icons.
    - **Choosing do or due (chosen design): the card stays open, and clicks on a day alternate.** The first click on a day makes it the **do day** (an earlier do day, or a week plan, moves there); clicking that same day again makes it the **due day** instead (and it stops being the do day); clicking it again makes it the do day again, and so on. So "do Tue, due Fri" is: Fri, Fri, then Tue. There is no separate deadline line or remove button (the text and the unset button were removed): the red chip is the deadline, and clicking it makes it the do day again, which removes the deadline (No date yet then clears that plan too). Every click is written at once, so the row moves in the view underneath while the card stays.
    - Two buttons side by side: the **other week** and **Later**. **One card, updated in place** (one card, with its buttons updated); nothing swaps to another screen:
      - **The other week** is "This week" on an upcoming week, "Next week" everywhere else. Clicking it switches the any-day button and the day chips to that week, and the button now names the week you came from ("Week 43", or "This week"), so it flips back.
      - **Later** swaps only the day row for a **week scroller** (‹ three week chips ›, "Wk 45 · 2 Nov", starting with the first week not already offered) and a **No date yet** button (back to the backlog: it clears the plan, and a deadline this week or overdue with it; a later deadline stays); the any-day button hides. Later stays pressed; clicking the week button returns to that week.
      - **The card never changes size** between these states: the week row and the Later row take the same height, so nothing below jumps.
    - A separator, then the **state row** (chosen: option A of four): the five states as Ninja Board's own marks in one row, each labelled under its mark (To do, Doing, Waiting, Done, Dropped), the current one highlighted. Always visible, one click, no submenu.
    - The card stays open after a pick (a day, a week, the any-day button, a state); it closes on Escape or a click outside. Keyboard: Tab and arrow keys move between the targets, Enter picks, Escape closes.
    - Repeating task notes get a small card with their title and one line, "Repeats every 6 months · the agent updates this one", and no buttons (their state and dates are the agent's). Story cards and projects get the **project card** (below).
  - **The project card.** Right-click on a project card (the Projects board, Done, Someday, Backlog's Someday tile, and those lists' modals) or a story card opens the same kind of card: the title, a separator, then the five states as a row of marks, each labelled: for a project **Active** (play), **Paused** (pause), **Someday** (cloud), **Done** (circle-check), **Dropped** (circle-minus); for a story the task states (To do, Doing, Waiting, Done, Dropped, with the board's marks). The current one is highlighted. Picking a state changes it and closes the card, and the focus goes back to the item (the planner card is the only card that stays open after a pick). It replaces the old plain menu everywhere. The card is wide enough that every label sits inside its cell and its highlight with room to spare (no label touches the highlight's edge).
  - **Planned vs due, everywhere (chosen: option A).** A planned day (`scheduled`) and a deadline (`due`) always look different, by colour alone (the flag was removed: red for due, the default colour for do): "Planned Tue" in the normal meta colour, "Due Fri" in red, in row metas and the planner card's chips; no icons. The strip's day counts split as "2 planned · 1 due" (the due part red). Ninja Board sets both through the planner card (do and due days alternate on repeated clicks); parity: the Edits rows "Set a deadline" and "Remove a deadline", which the agent makes with `brain due <file>[:<line>] <date|none>`.
  - **What To plan offers**, in this order, each a group with a count:
    1. **Still open this week:** open tasks due, planned or starting in the current week (or overdue), not yet planned for the shown week.
    2. **Due soon:** due in the next 4 weeks, not planned yet.
    3. **No date:** undated tasks and open task notes from active projects and areas, grouped by project or area, as in Backlog's No date.
    Left out: waiting tasks (someone else's move), tasks already doing, repeating task notes (the agent's), stories (task notes inside a project), tasks in someday or paused projects, and tasks already planned for another week. *Superseded:* stories are listed, and carried-over doing items are in Still open (the 2026-10-15 weeks and story points design, section 2). A group with more than 5 items shows 5, with **Show all N** in the group's header, which opens the list modal (section 6).
  - **What can be planned:** task lines and non-repeating task notes. Repeating task notes and story cards can't be planned in Ninja Board. *Superseded for stories:* the 2026-10-15 weeks and story points design, section 2 (`2026-10-15-brain-weeks-and-story-points-design.md`), makes stories plannable like task notes. *Superseded for repeating notes:* the 2026-10-15 weeks and story points design, section 8 (`2026-10-15-brain-weeks-and-story-points-design.md`), makes a repeating task note plannable like a task note, with its deadline kept.
  - **Parity:** the Edits rows "Plan a task on a day", "Plan a task for a week" and "Unplan a task (later, no date)", which the agent makes with `brain plan <file>[:<line>] <date|YYYY-Www|none>`. A task moved out of a week stays in that week's record as moved (section 5).
- **A past week (record):**
  - Ninja Board reads the week plan `08 Weeks/<year>/<YYYY-Www>.md` when that week is shown. If it has the record sections (section 5), the week shows as a **read-only board**: **Not done** (with "moved → Thu 22 Oct" where an item left the week), **In progress**, **Done**, and **Backlog** folded under its count. The strip shows the record's appointments and a done count per day. A line above the board says "Record · frozen Mon 19 Oct" (or "updated …" when not frozen yet).
  - Without a record (no week plan, or one from before round 2): "From your notes". Done lists what was finished that week (a line's completion date or a note's `done` in the week, for what's still outside the archive) and Not done lists open tasks that were due or planned that week. Same read-only board, without In progress and Backlog.
  - Nothing in a past week can be ticked or dragged; titles open their note where it still exists.
- **Week plan reading.** Week plan notes have no task lines, so the snapshot skips them; the Week view reads the one it needs with `cachedRead` when that week is shown.

## 4a. Busy days: Today's Schedule and the Week strip

Chosen on 2026-10-15 from five working options, which are not published. These rules are binding.

- **The event block's text** (every timeline: the Schedule, and the day view below).
  - Line one is the title; line two is the time and place on one line, "17:30–18:30 · Home".
  - Each line ends in an ellipsis instead of being cut in half.
  - A block too short for two lines shows its title only. In Compact it shows "title · start".
- **Today's Schedule has two views and a switch.**
  - **Large (the default):** about 6 hours of timeline (288px at 48px an hour), scrolling inside the tile. It opens scrolled so that now is near the top, with a thin now-line and soft fades at the edges that have more beyond them. **Whole day**, in the label row, grows the tile to the day's full height in place and then reads **Fit**, which folds it back, scrolled to now.
  - **Compact:** the whole day squeezed into the same 288px, with no scrolling and no Whole day. A short block shows "title · start", and hover or focus shows its full time and place.
  - **The switch** is a quiet button in the label row that toggles Large and Compact. Its label names the view it switches to ("Compact" in Large, "Large" in Compact).
  - **Saving the choice.** It's layout, so it's saved in the dashboard note's `base` block through the view config, like `arrange`: `schedule: compact` (absent or anything else: large). Where the config can't be saved (an embed, a hover popover, a canvas), the switch still works for the session and Ninja Board shows the same kind of Notice as arranging does.
  - Below 560px the tile stays the plain agenda list, and both buttons hide.
  - **The now-line** moves with the clock: its position updates every minute, without a full re-render.
- **The Week strip shows what is still to come, and the day's full view.**
  - **A wide day column's chips** are that day's appointments that haven't finished, at most 3. *Finished*: with an end time, the end has passed; with only a start, the start has passed; with no time, the day is over. Days before today show none; today hides the ones that have ended.
  - **The extra button.** When a day has appointments it doesn't show (finished ones, or beyond the 3), a quiet button opens that day's full view. It reads **+N more** when chips are shown, where N counts every appointment not shown, finished ones too; and **N earlier** when none are shown but the day had appointments (Monday, when it's Thursday).
  - **The full view** is a modal (Obsidian's `Modal`): "Wednesday 14 October · 5". It shows the whole day's timeline, finished ones included, with the now-line on today, and the agenda list when narrow. Escape and × close it, and the focus returns to the button.
  - **The narrow strip** (the day buttons and the picked day's agenda) follows the same rules: up to 3 still to come, then +N more or N earlier, opening the same modal.
  - **When an appointment ends,** the strip updates: Ninja Board schedules one re-render at the next end time (the next start, for one with no end), not a per-minute loop.
  - **Unchanged:** the strip's counts ("2 planned · 1 due"), the drop targets and the day buttons.
  - **Other weeks.** An upcoming week shows its first 3 per day plus +N more (nothing has finished). A past week, the record, keeps showing its appointments as before: it's a record, so nothing is hidden there.
- **Now is injected.** The model stays clock-free. The UI gets now as `HH:MM` through the draw context, the way `today` arrives: `BrainView` passes its clock, the preview a fixed 11:10, tests their own. Comparisons are on `HH:MM` strings and minutes.

## 4b. Waiting on the Week board

Chosen on 2026-10-15 from two options: a Waiting column (A) and a Waiting group inside Doing (B). Both are kept behind a switch. These rules are binding. A ruling of the same day changed how the two views are drawn: Waiting is always its own column, and Group view is a layout of the board, not a second copy of Waiting.

- **Why.** A waiting item sits in Doing with the dashed waiting mark, so it can't be dragged back to Doing. *Superseded:* Waiting is its own column in both views now (a ruling of 2026-10-15, section 10); the Doing placement described here is the first build's. Moving it back means using the state card or going to Backlog & Waiting. Waiting becomes its own place on the Week page: an item can wait, stay in the week, and be moved back from there.
- **Two views.** Waiting is always its own column, in both views: its items, its label row and its drop zone are the same. Only the board's layout changes, and the CSS draws it.
  - **Column (the default).** Four columns: To do | Doing | Waiting | Done.
    - Waiting is a plain column, with the same surface and label row as the others. It has no dashed or dotted border.
    - Its label row reads "WAITING N", in the same style as the other column labels.
    - A waiting row's meta reads as waiting rows read today, its context and its chase ("Website for Sam · Chase Fri"); a story card's also names who, "Waiting on Bram". (Corrected when built: rows never named who.)
  - **Group, at 720px and up.** Three columns: To do | Doing over Waiting | Done. To do and Done run the full height; Doing sits on top of the middle column, and Waiting is under it.
    - Waiting is the group: a hairline on its top edge, no difference of surface, and its label row reads "Waiting on · N" in Ninja Board's group-label style. It has no dashed border and no box around it.
    - Its list takes the rest of the middle column's height, so it stays a drop area.
    - Its waiting rows follow. Their meta drops "Waiting on", since the label says it: "Bram · Chase Tue".
  - **Both labels.** Waiting's label row holds the column's label ("Waiting N") and the group's ("Waiting on · N"), and the CSS shows one: the column's in Column view, the group's in Group view. The meta's "Waiting on" words are hidden in Group view.
- **Counts.** Doing's count is its own doing items only. Waiting's count is in its column label (Column view) or its group label (Group view).
- **Empty.** An empty Waiting shows the empty line "Nothing waiting", as the other columns' empty lines do. In Group view its label reads "Waiting on · 0", as the column reads "Waiting 0", and it stays a drop target: the group keeps its label and its drop area when it is empty.
- **What Waiting holds.** Items in state waiting:
  - task lines `[w]`;
  - task notes with status `waiting`;
  - story cards with status `waiting`.
  The board's existing rules still decide what is on the board at all: a waiting row when its chase date (its `scheduled`, or a note's planned day) or its due is on or before the week's end, and a story card by its status, as every story of an active project is. Nothing new joins the board.
- **Order.** Waiting starts in chase order: the earliest chase first, an overdue chase (orange, "Chase yesterday", as a passed chase is everywhere) at the top, and items without a chase last. It is arranged by hand like To do and Doing (section 3): a drop at a place, or Alt+↑ / Alt+↓, saves its order in `arrange:` (a `waiting` list), and the slot follows the pointer. An item that arrives without a place (the state card, planning it into this week) goes in by its chase date. This was asked for after trying the mockup (2026-10-15).
  - Doing's saved `arrange:` list may still name a waiting item's key. That key is ignored while the item is waiting.
  - When the item comes back to Doing, it is placed by Doing's existing rules.
- **The switch.** A quiet icon button at the end of Waiting's label row, in both views.
  - Column view's button shows a rows icon, and its label and tooltip are "Show Waiting inside Doing".
  - Group view's button shows a columns icon, and its label and tooltip are "Show Waiting as its own column".
  - The icons are Obsidian's Lucide icons through Ninja Board's existing icon helper: `rows-3` and `columns-3`, or the nearest icons Ninja Board already uses. In the mockup they are drawn like the mockup's other icons.
  - **When it shows.** Only while the pointer is over the whole Waiting column, in either view. Not just the icon or things close by. Otherwise it is fully hidden.
    - **Timing.** It fades in (0.4s) only after the pointer has rested over the section for 1.5s, so passing over it shows nothing, and fades out 0.8s after the pointer leaves. Keyboard focus shows it at once.
    - It also shows while keyboard focus is inside the section (`:has(:focus-visible)`), so a keyboard user can reach it; a mouse click on it doesn't keep it showing once the pointer leaves. It stays in the tab order.
    - Where there is no hover (`@media (hover: none)`), it always shows.
  - **Below 720px** the switch is not drawn at all (`display: none`), so it is out of the tab order. The board has one view there, Column view.
  - **Saving the choice.** It is layout, so it is saved in the Week dashboard note's `base` block through the view config, like `schedule: compact` and `arrange`: `waiting: group` (absent or anything else means column). Where the config can't be saved (an embed, a hover popover, a canvas), the switch still works for the session, and Ninja Board shows the same Notice as for the Schedule switch. Below 720px the saved choice is kept but not drawn: the board is Column view, and Group view comes back at 720px and up.
- **Dragging.**
  - **Both views.** Waiting is a drop zone like the other columns. A row or story card dropped on it gets state waiting: a task line's checkbox becomes `[w]`; a task note or story gets status `waiting`. A waiting item dragged to To do, Doing or Done gets that state.
    - Waiting shows the slot at the pointer and saves the order, as To do and Doing do.
    - A drop on its own column is no drop.
  - **Group view.** A pointer over Waiting is a waiting drop, and a pointer over Doing's rows is a doing drop with Doing's places: its own rows only, so Waiting's rows are not counted.
  - **Repeating rows** never change column, as now.
- **Unchanged.** The planning view (Planned or due, To plan), past weeks (the record), Backlog & Waiting's per-person tiles, Today, the state card, and the strip stay as they are.
- **Narrow widths.** Below 720px the Week board is always Column view, whatever is saved: one column below 560px, two from 560px, as the Projects board, and four from 880px. Group view is three-up from 720px; below it the saved choice is kept but not drawn, and the board takes Column view's layout.

## 5. The week record (implementation spec change, built by the agent's `brain week`)

The week plan's generated overview gains a record, so a past week can be shown as it was. In `2026-10-13-second-brain-implementation.md`, "Week plan":
- Every refresh writes, inside the overview markers, five sections in this order: `### Appointments`, `### Done`, `### In progress`, `### Not done`, `### Backlog`.
- Each item is a plain list item, never a checkbox (so it's never a live task): `- <title> · <context>`, then fields in square brackets where they apply: `[day:: YYYY-MM-DD]`, `[time:: HH:MM]`, `[due:: YYYY-MM-DD]`, `[moved:: YYYY-MM-DD]`, `[dropped:: YYYY-MM-DD]`. Example: `- Clean the gutters · Home [day:: 2026-10-15] [moved:: 2026-10-22]`.
- **Nothing gets lost.** An item that was ever listed in the week and later leaves it stays in Not done: with `[moved:: <new date>]` when its date moved out of the week, or `[dropped:: <date>]` when it was dropped. This holds whoever moved it: the agent, an edit in a note, or Ninja Board.
- **The freeze** (first catch-up of a new week) refreshes the last plan one final time, so the record holds the state at the week's turn: what was done that week, what was still in progress, what was left undone, and the backlog then (inbox items and undated tasks).
- Ninja Board only reads these sections; it never writes a week plan.

## 6. Long lists

- **Projects' Done** shows the 3 most recently finished projects (by `done`); **Someday**, both Backlog's tile and Projects' column, shows the 5 most recently added (by `created`). **Show all 12** sits in the tile's or column's header (at the right of its label and count) and opens the list modal.
- **The list modal** (an Obsidian `Modal`; full screen on a phone):
  - A title with the count ("Someday · 12"), a **search field** that filters as you type (on the title, the area or project, and the meta), and the items as a **grid of the same cards** the board uses, in the same order (newest first). Nothing found: "No match for …".
  - **Click** a card's title: the modal closes and its note opens. **Right-click** (long-press on touch, the context-menu key): the project card (section 4: Active, Paused, Someday, Done, Dropped as a row of marks), or the planner card for To plan's tasks; picking one changes it, and the card leaves the grid if it no longer belongs there.
  - **Press and hold, then drag** (in the modals whose view has somewhere to drop: Projects' Done and Someday, and To plan's groups): the modal fades away, and the item itself stays under the pointer, lifted, while the drag carries on over the board with the usual column tint and landing slot; dropping works as on the board, including To plan's items onto a day of the strip or onto Planned or due. Escape or a drop outside a target cancels it and the modal comes back. Backlog's Someday modal has no drag (Backlog has no columns to drop on): its cards move through their menu.
  - **Keyboard:** Tab through the cards, Enter opens, the context-menu key or Shift+F10 opens the menu, Escape closes the modal.
- The same modal serves To plan's long groups (section 4).

## 7. Carried over from the v0.1.0 review
- Backlog's waiting tile for a note without `chase` uses its `scheduled` (as Today and Week already do).
- The plugin design spec's line about Bases' toolbar "for filtering and grouping" follows the README: Ninja Board uses Bases' filter, not its grouping or sorting.
- A held Enter on a row's check button acts once, like Space.
- A waiting line inside a dropped story doesn't show in Waiting.

## 8. Building and checking
- **Model** (`src/model/`, pure, Node tests): the arrangement merge (`arrange(items, keys)`), the week for any Monday, the preview, Coming up counts, the record parser (from the note's lines), the vault fallback for past weeks, and the Done/Someday trimming.
- **UI** (`src/ui/`, linkedom tests): the guide page, the landing slot and full-height columns, Alt+↑/↓, the week paging head and Coming up line, the Plan this week button and To plan, the planner card, the read-only record board, Show all and the list modal with drag-out.
- **Obsidian** (`src/obsidian/`): register `ninja-board-guide`, the command, `config.set` for arrangements, reading a week plan on demand, the Tasks setup check.
- **Preview and mockup:** the preview gains the guide, paging, a sample week record (`08 Weeks/2026/2026-W41.md` in the sample vault) and in-memory arrangements; the mockup gets the round-2 states, and the preview is checked against them in the note context, as in v0.1.0.
- **Sample vault:** `01 Dashboard/05 Guide.md`, a frozen `2026-W41` record, and enough items to show Show all.

## 9. Not in this round
Priority or ranking; arranging in Today or Backlog; computing repeats beyond the date a note holds; writing week plans from Ninja Board; dragging between weeks.

## 10. As built
Rulings made while building v0.2.0, where this spec left a choice and a reader would notice it, one line each:
- **A new plan replaces any plan.** A day plan removes every `start`, a week plan removes every `scheduled`, and no date yet removes both. A leftover plan in another week would leave a task with two plans.
- **Which rows get which card.** A plannable row gets the planner card: a task line in state todo or doing, or a task note that is open or doing, neither repeating nor a story. A waiting line gets the states card, as a waiting task note does: its chase date (`scheduled`) stays the agent's or the note's, so it can't drop on a day, a week or To plan either. A repeating row gets the repeat card, a story the story card, any other task row the states card, and a project card or a Someday row the project card.
- **The planner card's weeks.** The card plans the upcoming week shown in the Week view, else this week. Its other-week button switches between the week it plans and one other (next week from this week; this week from an upcoming week), and Later's scroller starts at the earliest Monday after this week that is neither the shown week nor the other week, so Week 44's card starts at Week 43, and a this-week or Week 43 card starts at Week 44.
- **The planner card follows the state.** Picking done, dropped or waiting takes the plan controls away (the any-day button, the day row or Later's scroller and No date yet, and the two buttons) and picking to do or doing brings them back. They stay in the layout, invisible and disabled, so the card never changes size.
- **To plan's groups.** Still open this week: due, planned or starting by this week's Sunday and not planned for a later week, in this week's board order. Due soon: no plan, due in the four weeks after the shown week. No date: Backlog's No date. Each group shows 5 rows, then Show all.
- **What a drop plans.** A day of the strip takes a plannable row, on this week or an upcoming week; Planned or due takes one as a week plan; To plan takes a row from Planned or due back to no date yet. Cards, story rows and repeating rows never drop on a day.
- **Planned or due drags only while To plan is open.** Its plannable rows can be dragged only while To plan is open. The open state holds across re-renders of the same week, and resets when another week, another view or a new view is shown.
- **The list modal's entries.** A project card as on the board; a No date group as a tile over its rows; a Still open or Due soon row as a tile of its own. Search filters what each tile shows, and an item that no longer belongs leaves the grid when the view re-renders.
- **Today's dates.** On Today, a plan or a done date that is today goes without saying, but a deadline that is today stays ("Due today", in red).
- **Card keyboard.** Tab, → and ↓ move to the next enabled button, Shift+Tab, ← and ↑ to the previous one, wrapping; Enter and Space press a button; Escape closes the card and focuses the row again. The mockup's ↑ and ↓ by geometry are not built.
- **Sample data versus the mockup.** The sample follows these rules, so the preview's Week 43 differs from the mockup's hand-drawn data: To plan's Still open this week lists 6 rows, not 4; To plan has 15 items, not 14; No date has 7, not 8; and Backlog's No date has 7, not 3.
- **A `due` the plan leaves behind is removed (decided 2026-10-15).** After a check by hand of v0.2.0: a task due this week, planned for next week, a Later week or No date yet, stayed in this week because its `due` kept it there. A day or week plan in a later ISO week than the deadline's now removes the `due`; the same week or earlier keeps it; No date yet removes a `due` on or before the current week's Sunday and keeps a later one. Lines and task notes alike, one rule in `planDropsDue`, with `today` passed in; the cases are in `test/edit-cases.json`.
- **Busy days (decided 2026-10-15).** After a check by hand, five options were weighed and one was chosen: Today's Schedule gets a Large and a Compact view with a switch saved as `schedule:` in the dashboard note's `base` block, and the Week strip shows only the appointments still to come, with +N more or N earlier opening the day in a modal (section 4a).
- **Ruling (2026-10-15): a timeline of 6 hours or less shows no Whole day,** since there's nothing to grow. The timeline is the day's events with an hour above and below them, so appointments spanning about 4 hours or less fit. An untimed or unended appointment today makes the Schedule the plain list, with no switch and no Whole day.
- **Today keeps a task planned on an earlier day (decided 2026-10-15).** A task due or planned on any earlier day and still open stays on Today and counts in "N left", until it is done or replanned (`lineIsDue` and `noteIsDue` in `src/model/today.ts`; pinned by `src/model/today.test.ts`). Its meta names the day the way the views word past days: "Planned yesterday", else the date ("Planned 9 Oct"). A weekday name is used only for the next six days, so an older plan never reads as a weekday that could be next week's. System 3.4 still says a task is on Today when its "deadline or planned day is today". The system spec is unchanged; a change to 3.4 would need the author's approval and a line in its section 7, and it is not made here.
- **A repeating task note keeps its `due` whatever the plan.** Planning never removes the `due` of a repeating task note (`applyNotePlan`; pinned by `edit-cases.json` for a week plan and for no date yet). Ninja Board's planner card does not offer repeating notes; the agent's `brain plan` can plan them.
- **Waiting on the Week board (section 4b, built 2026-10-15).** Rulings made while building it: an item not in Waiting's saved order goes in before the first listed item chased later, not at the end; Doing's places count only Doing's own rows, so Alt+↓ on Doing's last row does not enter the group; a repeating row in the group arranges within the group only; choosing a view redraws at once. The switch carries `data-key="waiting-switch"`, which the mockup's lacks, so the focus comes back to it after a re-render. The preview's sample vault has one waiting item on Week 42 where the mockup draws three, and no overdue chase: adding them would change 31 unrelated tests. A row dragged by the link in its meta now drops where it is held: the zone is found past the dragged item in the plugin and the mockup.
- **Waiting is one column in both views (a ruling of 2026-10-15).** The first build drew Group view's Waiting as a nested group inside Doing. It is now the same column in both views: the board's CSS places it under Doing at 720px and up, and below 720px the board is Column view whatever is saved, with the switch not drawn. The nested group is gone from the mockup and the plugin.
- **Group view is a layout of the Waiting column (a ruling of 2026-10-15).** Waiting is one column in both views, so Group view is CSS only. At 720px and up the Week board is a three-column grid: To do and Done run the full height, Doing sits over Waiting in the middle column, and Waiting (a hairline, and the label "Waiting on · N") takes the rest of the height, with a zero row gap so it sits right under Doing's last row. Below 720px the board is Column view by the Projects rule (one column below 560px, two from 560px), whatever is saved, and the switch is hidden (`display: none`). `test/styles.test.ts` pins the grid, the zero gap and the 560px rule.
