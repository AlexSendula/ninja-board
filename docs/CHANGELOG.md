# Changelog

All notable changes to Ninja Board are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project uses Semantic Versioning. Each release is tagged in git with its bare version number, such as `1.0.3`.

## [1.1.0] - 2026-10-19

Ninja Board 1.1.0 folds a story's task lines away on every week of the Week view. It also fixes a flicker when a story is folded or opened. Folded stories are still `collapsed:` in the Week view's config. `manifest.json`, `versions.json` and `package.json` say 1.1.0.

### Added
- **Folding on every week.** A story card on an upcoming week (Planned or due, To plan and its Show all list) and on a past week folds its lines away, as a story on this week's board does. One list of story names, `collapsed:`, serves every week and the list modal: a story folded on one week is folded on every week it appears.
- **Past-week story cards.** A story on a past week is a read-only card: its title opens its note where one exists, its own words show when the week lists it, and its lines are read-only rows under it, in the story's column. Loose lines stay rows. Each column counts its cards and rows, and the week's figures are the record's own.
- **Collapse all and Expand all in each week's place.** This week, the button is at the end of the Coming up row. On an upcoming week it is at the end of the Planned or due heading, and on a past week at the end of the Record or From your notes line. It folds every story that shows on its page, and reads Expand all once they are all folded.
- **The Show all list keeps the folds.** Its stories are drawn folded as the page has them, and a fold made in the list also folds the page behind it.

### Changed
- **Planning no longer folds or opens cards by itself.** Opening or closing Plan this week still shows and hides To plan, and it leaves every story card as the list says. Backlog keeps its own planner folding.

### Fixed
- **Folding no longer flickers.** A story's chevron, Collapse all and Expand all change the story cards on the Week view in place instead of redrawing the page.
- **A redraw that would show the same page is skipped.** When Obsidian saves a fold into the dashboard note, the board is not drawn again. A fold is recorded as the page shows it, not as the saved list.
- **What is under the pointer keeps its hover look through a redraw.** A card, or the chevron or button on it, that the pointer is on starts in its hover look, with the class `brain-hover-kept`, instead of fading into it. Every copy of the story under the pointer keeps it. The class goes when the pointer leaves the element, or two frames after the redraw if the pointer is not on it.
- **Two story cards with the same note name fold together.** The config holds one list of names, so a chevron folds or opens every card of that name on the Week view.

## [1.0.4] - 2026-10-18

Ninja Board 1.0.4 lets you fold a story's task lines away on this week's board. `manifest.json`, `versions.json` and `package.json` say 1.0.4.

### Added
- **Folding stories on the Week board.** A story card on this week's board starts with a chevron, which folds the card's task lines away and opens them again. The chevron shows when you point at the card or focus it from the keyboard, and always on a touch screen. Folded stories are saved in the dashboard note's base block, as `collapsed:`, so they are remembered across restarts. Folding is not an undo step. Where the config can't be saved (an embed, a hover or a canvas), the fold lasts for the session and a Notice says so; a failed save is reported in a Notice too.
- **Collapse all and Expand all.** The Coming up row ends with an icon button. It folds every story on the board, or expands them all once every one of them is folded. It is not shown when the board has no story.

## [1.0.3] - 2026-10-18

Ninja Board 1.0.3 changes only the documentation. `manifest.json`, `versions.json` and `package.json` say 1.0.3.

### Changed
- **Install from Obsidian's community plugins.** Ninja Board is listed there now. The README no longer points to BRAT or to a manual install, and Obsidian updates the plugin.
- **Second Brain Setup is the quickest way to a whole vault.** It sets up Tasks and the dashboards, and installs Ninja Board with you or for you.

## [1.0.2] - 2026-10-17

Ninja Board 1.0.2 clears the last warnings of Obsidian's community review. `manifest.json`, `versions.json` and `package.json` say 1.0.2.

### Fixed
- **Clears the last warnings of Obsidian's community review.** The views look the same.
- **Setting story points reads less.** It no longer reads the list of every file in the vault. It reads the note and the project notes in the nearest folder above it that has any.

### Changed
- **No moment dependency.** Dates come from the platform's `Date`, so no interface language changes their digits.

## [1.0.1] - 2026-10-17

Ninja Board 1.0.1 fixes the findings of Obsidian's community-plugin review and of our own pre-check. `manifest.json`, `versions.json` and `package.json` say 1.0.1.

### Fixed
- **Passes Obsidian's community review.** Styles go through classes and Obsidian's element helpers, the code uses the platform API and the path helper, and timers, element creation and sentence case follow the review's rules.
- **Cmd/Ctrl+Z works after ticking.** Focus stays in the view when the view redraws, so the undo key still reaches it.
- **The view no longer jumps on the first change.** The Undo button keeps its space from the start.
- **Works on older iPhones.** No code uses a lookbehind, which iOS before 16.4 does not have.
- **Views clean up when they unload.** A drag still in progress ends with its view.

### Changed
- **The undo command is named "Undo the last change".** Its id is unchanged.

### Added
- **A lint script.** `npm run lint` runs ESLint with Obsidian's review rules.
- **Releases built and attested by GitHub Actions.** Pushing a tag equal to the manifest's version runs the release workflow, which lints, tests and builds, and attests the three files Obsidian installs.

## [1.0.0] - 2026-10-16

Ninja Board 1.0.0, released on 16 October 2026, is the first release under the name Ninja Board. It holds the changes made after a check by hand of v0.2.0, the fixes from the whole-plugin review after it, and the repeating-note planning of 16 October 2026. `manifest.json`, `versions.json` and `package.json` say 1.0.0.

### Added
- **What a week holds (weeks design, Part 1).** An item is in a week when its do date, deadline, lead window, chase date or repeat falls in it, or when it was done that week. An open item carries over until it is done or replanned. A story with no date is in no week: Backlog and To plan list it under No date until it is planned.
- **Stories are plannable.** A story takes the planner card, as a task note does, and can be dropped on a day, on Planned or due, or back on To plan. To plan lists its stories as cards, folded behind a chevron while planning, and the chevron's target is the left 15% of the card.
- **Story points (weeks design, Part 2).** A story may carry `points`: 1, 2, 3, 5 or 8. Its planner card's Points row sets them, through `Actions.points`, which writes the note's frontmatter; no other kind of note takes them. The Week header shows a points ring against `points_per_week` in the config note (8 when absent), with an orange lap for the overflow and a raised "+N" past the target. Story cards show "N pts". A past week shows its record's `points_planned` and `points_done`, read-only, when the record has both. With no points in the week, nothing about points shows.
- **Repeating items take every state (weeks design, section 8).** A repeating task note has a tick and its five states (To do, Doing, Waiting, Done, Dropped), like any task note, and its repeat shows on a line of its own. A tick, or a drop on Done, completes this occurrence: the note moves to its next due date and stays open, and the occurrence is written at the top of its `## Log` section, as `- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2027-04-20.` The occurrence shows as a Done row in the week it was done, with no tick. Dropping a repeating note stops its repeat and writes no Log line. A repeat Ninja Board can't parse, or a note with no usable `due`, is refused with a Notice, and nothing is written. Undo takes a completion back while the note is as Ninja Board left it.
- **Undo.** One history for the Ninja Board pages, for the Obsidian session. Each change Ninja Board makes is one step: a tick, a state, a plan or deadline, a drag, a story's points, a project's status, a repeating note's completion, an arrangement or a switch. The Undo button sits at the top right of each page head and shows only when there is a step to undo. Cmd/Ctrl+Z does the same in a Ninja Board view, and the command "Undo the last Ninja Board change" has no default hotkey. Undo puts a step back only where the note is still as Ninja Board left it; otherwise the step is skipped with the Notice "Changed since: not undone".
- **Waiting on the Week board.** Waiting is a column of its own, the default, or, at 720px and up, a group under Doing behind a switch in its label row. Waiting starts in chase order and can be arranged by hand, a drop on it sets the item to waiting, and the view is saved as `waiting: group` in the dashboard note's `base` block.
- **Busy days.** Today's Schedule has a Large view, the default, and a Compact view. Large is a window of about six hours that scrolls and opens at now, with a now-line that moves every minute and a Whole day / Fit toggle. Compact fits the whole day into the same height. A switch in the Schedule's label row saves the choice as `schedule: compact` in the dashboard note's `base` block.
- **Day view.** The Week strip's "+N more" (or "N earlier") opens the day's full timeline in a window, with the finished appointments too.
- **The Guide's Setup checks the done date.** The Setup tile has a fourth line: Set done date on every completed task, in Tasks' settings. Without it a ticked line has no completion date, so the line reads **To fix** while it is off. A setting Tasks never saved has Tasks' default, on, and reads OK.

### Changed
- **Repeating task notes plan like task notes.** A repeating note takes the planner card. A plan decides its week, and its deadline counts only when it has no plan. A left click sets or clears its do day and keeps the deadline; a right-click on another day moves the deadline; the red chip can't be cleared. Done on the card completes the occurrence and closes the card.
- **The plugin is named Ninja Board** (named 2026-10-16; its working name was Brain). Its id is `ninja-board`, its five views are `ninja-board-today`, `ninja-board-week`, `ninja-board-projects`, `ninja-board-backlog` and `ninja-board-guide`, and its commands, Notices and Guide say Ninja Board. The internal names (`BRAIN_VAULT`, `BrainView`, the `.brain-view` styles) and the `brain` tools keep their spelling.
- **The Week header's tasks figure reads done out of all**, "2/16", with a checklist icon, in place of "N left". Today keeps "N left".
- **The planning header shows two counts,** planned (checklist icon: everything in Planned or due) and due (red flag: how many of those have their own deadline in the week), in place of "N planned or due". A deadline on a line inside a story does not count. Its tooltip and label read "N in the week, M due", as the author corrected them on 2026-10-16.
- **Ticking a repeating note is Ninja Board's.** The row no longer reads "done via the agent", and the repeat card is gone: a repeating row opens its planner card while it is open or doing, else its states card, and Space ticks it.
- **Stories in lists are cards.** In To plan's groups and the list modal a story is a card with its progress ring and count; in Backlog's No date it is a folded card with its peek.
- **The sample vault** gives its stories points, and week 41's record holds 7 planned and 6 done.
- **Dashboard notes hide their Properties and the Bases toolbar.** Only in a note that shows a Ninja Board view, since Ninja Board's views have their own sorting and grouping. Source mode still shows the base block's code to edit.
- **The Schedule is no longer fitted to the day.** It used to draw the day's events on one timeline sized to fit them. Large now scrolls, and a timeline of 6 hours or less shows no Whole day. Event blocks show the title on the first line and the time and place on the second, each ending in an ellipsis.
- **The Week strip shows what is still to come.** Each day shows its appointments that have not finished, at most three. Days before today show none, and today hides the ones that have ended. The strip is drawn again when the next appointment ends.
- **Dashboard notes are numbered:** `01 Today.md`, `02 Week.md`, `03 Projects.md`, `04 Backlog.md` and `05 Guide.md`. Before, they had no numbers. The commands and the code look for the new names.
- **Cards close after a pick.** The states, story and project cards close after a state pick, and focus goes back to the item. The planner card still stays open.
- **Planning removes a deadline it leaves behind.** A day or week plan in a later ISO week than the task's `due` removes the `due`. A plan to no date yet removes a `due` on or before this week's Sunday. A plan in the deadline's own week, or an earlier one, keeps it. The rule applies to task lines, task notes and the planner card, and its cases are in `test/edit-cases.json`. A repeating task note keeps its `due` whatever the plan.
- **Undated task notes are planned and listed.** An open task note in an area is listed under its area in No date (Backlog and To plan). Its open lines show as loose rows on the Week board, in its counts and in upcoming weeks. A task note inside a project is still a story.
- **Inbox notes dropped in by hand count.** A note in `02 Inbox` is an inbox item whatever its type, aged by its `received` time, else the date and time in its name, else `created`.
- **Wikilinks in task lines are read in linear time.** `[[A [[B]]` now reads `B`.
- **Today keeps a missed plan.** A task planned on an earlier day and still open stays on Today, and counts in "N left", until it is done or replanned. Its meta names the day: "Planned yesterday", then the date ("Planned 9 Oct"). This was decided on 2026-10-15. The rule was already in the code, and a new test pins the day label.
- **The `brain` tools' line numbers and state words (decided 2026-10-15).** In `state`, `plan` and `due`, `<line>` is 1-based, as editors show it, and the tools convert it for Ninja Board's 0-based index. `state` takes Ninja Board's words for a task line: `todo`, `doing`, `waiting`, `done` or `dropped`. A task note keeps its status values. The `brain` tools live in each vault and are not in this repository yet; the implementation spec is what they follow.
- **Dragging scrolls the view.** A lifted card or row near the top or bottom of its view scrolls the view, a frame at a time, and the drag follows the content. A lifted item also stays under the pointer when the view scrolls by a wheel or trackpad.
- **Right-click a day to set the deadline.** In the planner card, a right-click on a day sets the deadline there and keeps the do day. On the red day it removes the deadline, and on the do day it makes the plan the deadline, as a second click does. Left clicks keep their do, due, do cycle, and the Guide's Planning tile lists the step.
- **Waiting is one column in both views, and Group view is its layout.** From 720px Group view puts Waiting under Doing in three columns; below 720px the board is Column view and the switch is hidden. The nested group is gone from the markup and the plugin, and `npm test` runs 849 tests.
- **Tests.** The suite has 849 tests. An Obsidian stub lets the write path and the view run under Node, and a guard fails any assertion that compares a DOM node.
- **Tests.** `npm test` runs 1074 tests, all passing, up from 1005.
- **The manifest names the author.** `manifest.json` names AlexSendula as its author, with an `authorUrl`.

### Fixed
- A row dragged by the link in its meta drops where it is held: the drop zone is found past the dragged item.
- The any-day button on the planner card now writes whenever the week plan would drop the `due`. Before, a task due in an earlier week kept it.
- The Schedule keeps its scroll position across a redraw of the same day. A window's resize observer is released once its tile is replaced.
- The Schedule's scroll fades reach the window's edge, so no cut text shows above or below.
- A line marked `[X]` can be reopened. Tasks is given the `[x]` it understands.
- A tick whose answer from Tasks does not do what the tick was for is refused, and nothing is written. A completing tick needs a done line; a reopening tick needs none.
- A date field written as a wikilink (`[due:: [[2026-10-17]]]`) is edited whole, with no stray `]]` left behind.
- One unreadable note no longer blanks every view. It shows no tasks, and the other notes still show theirs.
- Today and the current time use ASCII digits, whatever the Obsidian locale.
- Paging, arranging and changing the Schedule view draw at once, even under quick repeated input.
- Overlapping appointments share the Schedule's width, side by side, instead of lying on top of each other.
- A touch carry out of a modal no longer scrolls the page under the finger.
- Escape cancels a drag on a board. In a carry out of a modal, Escape cancels the carry and keeps the modal open.
- The list modal's search field takes the focus only on desktop, and closing the modal returns the focus to Show all.
- The list and day modals lay their content out as a flex column, so the grid scrolls beneath the search field.
- A lifted card no longer starts 4px off its place: its margin is cleared before its place is read. It showed on touch, where nothing moves the card until the finger does.
- The planner card closes when the focus moves outside it (after a tab switch, for example), instead of floating.
- **Keyless controls keep their focus across a redraw.** Whole day, Plan this week, a fold toggle, a Week strip day and Show all dropped the focus to the page when a background redraw came while one of them had it. Each now keeps it.
- **Long bracket and whitespace runs are read in linear time.** Field values, wikilink targets and whitespace runs in task lines and appointment times no longer take quadratic time, so a long line of unclosed brackets does not slow every render and edit. Malformed input only changes: a bare `[` or `(` inside a field value, or a `[[` with a `[` before its `]]`, no longer belongs to the value or link. Well-formed lines read as before.

### Upgrade notes
- **Stories with no date leave the Week board.** Until one is planned it is listed under No date, in Backlog and in To plan. Nothing in the notes is changed or moved.
- **Repeating task notes need no migration.** A completion writes its Log line into the note's body, under `## Log`. The notes keep their `repeat`, `repeat_from` and `if_missed` keys as they are.
- **Story points need no migration.** A vault that uses no points sees no change. To change the weekly target from 8, add `points_per_week: <number>` to `99 System/config.md`.
- **Rename the dashboard notes in an existing vault.** Rename `Today.md`, `Week.md`, `Projects.md`, `Backlog.md` and `Guide.md` inside `01 Dashboard/` to `01 Today.md`, `02 Week.md`, `03 Projects.md`, `04 Backlog.md` and `05 Guide.md`. Ninja Board's "Open Today" and "Open guide" commands look only for the new names, and a missing note shows a Notice. Then set Settings → Files and links → Default file to open to `01 Dashboard/01 Today`. There is no migration step. Arrangements and the Schedule choice are saved in the notes themselves, so they move with the rename.
- **Rename the view types in an existing vault.** Each dashboard note's `base` block names its view by type: `ninja-board-today`, `ninja-board-week`, `ninja-board-projects`, `ninja-board-backlog` or `ninja-board-guide`, in place of `brain-` and the same name. Change each `type:` line, and move the plugin folder from `.obsidian/plugins/brain/` to `.obsidian/plugins/ninja-board/`, since Obsidian names the folder after the plugin id.
- The sample vault, and so the sandbox that `npm run sandbox -- --yes` builds, already uses the new names.

## [0.2.0] - 15 October 2026

Round 2 of the plugin, built after the first look at v0.1.0. Design: [round 2 spec](design/2026-10-14-brain-plugin-round-2-design.md).

### Added
- **Guide view** (`brain-guide`, "Brain · Guide") with its dashboard note `05 Guide.md` and the command "Open guide". The Guide holds the marks, how-tos by mouse, touch and keyboard, the planner card in six steps, the views, the time words, who does what, and a live Setup check that reads Tasks' saved settings.
- **Arranging** on the Week board (To do, Doing) and the Projects board (Active, Paused, Someday). Every column takes a drop along its full height, a grey slot shows where the item will land, and Alt+↑ and Alt+↓ move the focused item. The order is saved as `arrange:` lists in the dashboard note.
- **Week paging and Coming up.** ‹ and › page through weeks, This week comes back, and Coming up lists the next three weeks with their counts.
- **Upcoming weeks** show a preview: the strip's appointments, and Planned or due by day, with Any day first. **Plan this week** opens To plan, with three groups: Still open this week, Due soon and No date.
- **Past weeks** as a read-only board. Brain reads the week's record from `08 Weeks/<year>/<YYYY-Www>.md` when there is one, and otherwise works from the notes.
- **Planning and deadlines** through Tasks' fields: a day (`scheduled`), a week at any day (`start`), or no date yet. Deadlines (`due`) can be set and removed. Rows can be dropped on the strip, on Planned or due, and on To plan.
- **Cards** replace Obsidian's menu: the planner card, the states card, the story card, the project card and the repeat card.
- **Long lists.** Projects' Done shows the three most recent projects, and Someday the five most recent. Show all opens a list modal with a search field, and items can be dragged out of it onto the board.

### Changed
- **A new plan replaces any plan.** A day plan clears `start`, a week plan clears `scheduled`, and no date yet clears both. [round 2 spec, section 10]
- **Done and Someday list the newest first.**

### Fixed
- Found during the build, before the hand check:
  - a re-render during a carry no longer strands the list modal;
  - a move between columns no longer freezes the column it left;
  - a waiting line is not plannable;
  - the planner card's plan controls follow the state;
  - the leftover deadline line is gone from the planner card;
  - past days take no drop, and a carried card is not counted twice;
  - when Tasks has not loaded yet at launch, the Guide's Setup check says "Can't check" rather than a wrong "off";
  - the week plan's path is pinned for the ISO year, and the specs and README match the final behaviour.
- Carried over from the v0.1.0 review: a waiting tile for a note without `chase` uses its `scheduled`, and a waiting line inside a dropped story no longer shows in Waiting.

## [0.1.0] - 14 October 2026

The first build: four views over Bases, with edits that match the agent's. Design: [plugin design spec](design/2026-10-13-brain-plugin-design.md).

### Added
- **Four Bases views**, registered with `registerBasesView`: Today, Week, Projects and Backlog & Waiting.
- **Tick, set a state, move and open.** A tick goes through Tasks. A state is a checkbox change. A card's move changes the note's `status`. Enter opens the note. Writes are guarded: a line is changed only if it still reads as Brain read it.
- **Task lines in the Tasks Dataview format**, with the custom `w` (Waiting) status, ISO dates and weeks, task and note rows, appointments, and weekly repeats.
- **Dashboard notes** in `01 Dashboard/` (`Today.md`, `Week.md`, `Projects.md` and `Backlog.md`). Today can be the start page, and the command "Open Today" opens it.
- **Shared edit examples** in `test/edit-cases.json`, so the agent and Brain make the same edits.
- **Preview and sandbox.** A browser preview on the sample vault (`npm run preview`), and an install script for the sandbox vault (`npm run sandbox`).

### Fixed
- After the v0.1.0 record was made (14 October 2026, 11:41), the build kept going on the same version:
  - Today moves to the new day at midnight, and renders are debounced and stop after unload;
  - a held key acts once, and a tick acts on the row as drawn;
  - repeating notes stay rows, and waiting and doing task notes show;
  - Tasks' answer is checked before a write, and dropped notes get a done date.
