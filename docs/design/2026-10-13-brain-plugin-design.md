# Ninja Board: Obsidian plugin design

The human side of the second brain: an Obsidian plugin that shows the vault the way a well-made app would. It is part of the implementation of the second brain ([implementation spec](https://alexsendula.github.io/second-brain/implementation/), "Reader and views") and its own sub-project.

| | |
|---|---|
| Status | v0.2.0, built 2026-10-15: round 2 (`2026-10-14-brain-plugin-round-2-design.md`). v0.1.0 built 2026-10-14. |
| Visual design | [design/mockup.html](../../design/mockup.html) (the mockup; its `#brain-css` block becomes the plugin's styles.css) |
| Research | [Obsidian plugins](https://alexsendula.github.io/second-brain/research/2026-10-13-obsidian-plugins/) |

## 1. Goal and rules
- **Goal.** Show your life at a glance and let you move through it: see today and the week, tick tasks, start one, move a story or project, open the note behind anything. It should feel practical, calm, simple and beautiful: blocks with balance, not a document.
- **What it does.** Ninja Board shows notes and makes simple edits:
  - tick or untick a task;
  - set a task's state;
  - move a card, which changes a note's `status`;
  - plan a task on a day, which sets its `scheduled` (round 2);
  - plan a task for a week, any day, which sets its `start` to that week's Monday (round 2);
  - take a task back to no date yet, which removes its `scheduled` and `start` (round 2);
  - set a task's deadline, or remove it, which sets or removes its `due` (round 2);
  - arrange the Week and Projects boards, saved in the dashboard note (round 2);
  - open a note.

  Creating stays with the agent or with typing in notes, and so does most planning.
- **It keeps no data of its own.** It reads the notes and writes changes straight back, so a view can never drift from the vault.
- **The agent can do everything Ninja Board can, with the same result.** Ninja Board is a view for you; the agent does most of the work. Every edit Ninja Board makes is one of the fixed edit rules in the implementation spec (reference format, "Edits"), and the agent makes the same edits with `brain` commands. Both are tested against one shared file of edit examples, `test/edit-cases.json`.
- **No date math of its own beyond filtering.** Repeats, carry over and lapse, and done dates on ticking belong to the Tasks plugin (task lines) and the `brain` tools (notes). Repeating task notes show "done via the agent" and can't be ticked in Ninja Board.
- **Builds on Bases.** Bases selects the notes (its filter); Ninja Board draws them in its own order. Everything else stays Obsidian's own.

## 2. How it fits together
- **Custom Bases views.** Ninja Board registers its view types with `registerBasesView` (Obsidian 1.10 and later):

  | View type | View |
  |---|---|
  | `ninja-board-today` | Today |
  | `ninja-board-week` | Week board |
  | `ninja-board-projects` | Projects board |
  | `ninja-board-backlog` | Backlog & Waiting |
  | `ninja-board-guide` | Guide |

  Each one gets the notes Bases selected, already filtered, and renders them in its own order.
- **Dashboard files.** `01 Dashboard/` holds one note per view. Each note embeds a ` ```base ` block that uses the matching Ninja Board view type and a sensible filter (for example everything outside `10 Archive`). The Today note is the start page (Obsidian's "Default file to open"). Each note carries `cssclasses: ninja-board`, which makes it a board page (§9). Bases' own toolbar is hidden on a dashboard note (§9): the block's filter chooses which notes Ninja Board shows; Ninja Board doesn't use Bases' grouping or sorting and keeps its own order. The Week and Projects notes' blocks also hold the boards' arrangement (`arrange:`, round 2), and the Today note's block holds the Schedule's view (`schedule:`, round 2).
- **Reading:**
  - notes' frontmatter from `metadataCache`;
  - task lines from the cache's list items (`task` character and line number), with each line's text from `vault.cachedRead`;
  - task lines parsed in the Tasks plugin's Dataview format (section 3).

  Views re-render when Bases reports new data and when the metadata cache changes.
- **Writing:**
  - **Tick or untick:** the Tasks plugin's own `apiV1.executeToggleTaskDoneCommand(line, path)` produces the new line, or two lines for a recurring task. Ninja Board writes it with `vault.process`, after checking the line is still what it read; if not, it re-reads and does nothing. There is one completion engine, wherever you tick from.
  - **Set a state:** Ninja Board replaces the checkbox character (`[/]`, `[w]`, `[ ]`, `[-]`). Done goes through Tasks, so the completion date is added; for dropped, Ninja Board writes the cancelled date itself.
  - **Move a card:** `fileManager.processFrontMatter` sets the note's `status`.
  - Every write is one small edit to one note.
- **Interaction:**
  - **Tick:** click the circle.
  - **Cards:** right-click, or long-press on touch, opens a card at the row, Ninja Board's own (not Obsidian's `Menu`): the planner card for a task that can be planned, otherwise the states card with To do, Doing, Waiting, Done and Dropped. Story, project and repeat cards cover the other rows (round 2).
  - **Drag:** pointer-event drag between columns, so it also works on touch.
  - **Keyboard:** Enter opens the note, Space ticks, and the context-menu key or Shift+F10 opens the card.
- **Theme.** Only Obsidian's CSS variables, so it fits the user's theme in light and dark. Every class is prefixed `brain-`. The plugin's CSS is the `#brain-css` block of the final mockup.
- **Phone.** No Node or Electron APIs, so the plugin also runs in Obsidian's phone app (`isDesktopOnly: false`).

## 3. Task lines (Tasks plugin, Dataview format)

| State | Line | Tasks status type |
|---|---|---|
| To do | `- [ ] Send Sam the hosting options [due:: 2026-10-17]` | TODO |
| Doing | `- [/] Build the homepage header [scheduled:: 2026-10-13]` | IN_PROGRESS |
| Waiting | `- [w] Get photos from [[Sam Rivers]] [scheduled:: 2026-10-20]` (the scheduled date is the chase date) | ON_HOLD (a custom status added in Tasks' settings: symbol `w`, name Waiting, next status `x`) |
| Done | `- [x] Pick design B with Sam [completion:: 2026-10-12]` | DONE |
| Dropped | `- [-] Try a page builder [cancelled:: 2026-10-11]` | CANCELLED |

- **Dates:** `due` is the deadline and `scheduled` is the planned day; for waiting, `scheduled` is the chase date.
- **Repeats** stay on task notes, as the system says.
- **Someday** stays a state of task notes and projects.
- **Lines with a link only** (`- [ ] [[Choose hosting for Sam's site]]`) point to a story. Ninja Board shows the story itself and doesn't list such a line as a separate task.

## 4. The views (v1)
Visual design and exact markup: the final mockup. In short:
1. **Today:**
   - header: the date, with a ring and "N left";
   - Now: tasks in doing;
   - Today: due today, or planned today or on an earlier day and still open, overdue and chase due;
   - Schedule: the day's timeline of its events (Large, scrolling, or Compact), or a list when narrow or when an appointment has no start or no end;
   - Done today: collapsed, and hidden at 0.
2. **Week:**
   - header: the week's dates, with a ring and "N left";
   - a week strip of seven days with appointments and task counts;
   - a board with To do, Doing and Done. Stories are cards with their task lines tickable on the card. Loose task lines are draggable rows, and so are a task note's own open lines unless it is a story.
3. **Projects:**
   - a board by status (Active, Paused, Someday, Done);
   - cards show the area, due date, a progress ring and the next open task. Dragging a card changes the status.
4. **Backlog & Waiting:**
   - Backlog: the inbox with ages, undated tasks and task notes grouped by project or area, and someday projects;
   - Waiting: one tile per person you're waiting on, with their waiting tasks, the context and the earliest chase date. A passed chase is emphasized.
5. **Guide** (round 2):
   - the marks, how to do things by mouse, touch and keyboard, how to plan with the planner card, the views, the time words, and who does what (Ninja Board or the agent);
   - a check of the Tasks setup, read from Tasks' saved settings each time the Guide is drawn;
   - reached from its dashboard note, from the view picker, or by the command Ninja Board: Open guide.

**Round 2** (v0.2.0; the design, and the rulings made while building it, are in `2026-10-14-brain-plugin-round-2-design.md`):
- **Arranging.** Board columns take a drop along their full height. On the Week board's To do and Doing and the Projects board's Active, Paused and Someday, a drop at a place (shown by a landing slot) or Alt+↑ / Alt+↓ arranges the column. The order is saved as `arrange:` lists in the dashboard note's `base` block, through Bases' view config. Done keeps its time order.
- **Weeks.** ‹ and › page through weeks, This week comes back, and Coming up shows the next three weeks with their counts. An upcoming week is a preview: Planned or due by day, and a To plan list that Plan this week opens. A past week is a read-only board: from its week plan's record (Not done, In progress, Done, and Backlog folded), or, without one, from the notes (Not done, Done).
- **Planning and deadlines.** A row is planned on a day (`scheduled`) by a drop on a day of the strip or in the planner card; for a week, any day (`start`) by a drop on Planned or due or the card's any-day button; or to no date yet by a drop on To plan or No date yet in the card. Planning writes `scheduled` or `start`, and a new plan replaces the old one. It removes a `due` only when the plan leaves it behind: a day or week in a later ISO week than the deadline's, or no date yet while the deadline is this week or overdue. The planner card also sets and removes a deadline (`due`) with its red day chip.
- **Cards.** Right-click, long-press or the context-menu key opens a card in place of Obsidian's menu: the planner card (a task), the states card, the story card, the project card, and the repeat card (a repeating row, with no buttons).
- **Long lists.** Projects' Done shows the 3 most recently finished, and Someday (on Projects and in Backlog) the 5 most recently added, each with Show all. Show all opens the list modal, with a search field, a grid of the same cards, and drag-out onto the board where the column accepts it.
- **Busy days.** Today's Schedule has a Large view (about 6 hours that scroll, with Whole day and Fit) and a Compact view (the whole day, no scrolling), switched by a button saved as `schedule:` in the dashboard note. The Week strip shows the appointments still to come, at most 3 a day, with **+N more** or **N earlier** opening the day's full view in a modal. See the round 2 design, section 4a.

**Time words** follow the system's definitions (system 3.4): today, overdue, this week (ISO week, Monday to Sunday), chase due. Today also keeps a task planned on an earlier day until it is done, which 3.4 does not say; it was decided on 2026-10-15, and the implementation spec records it as deviation 4. Ninja Board's unit tests check the time words inline (`dates.test.ts`, `src/model/today.test.ts`). A shared set of cases for the `brain` tools is planned, not built.

## 5. Code and build
- **Where:** the repository root: TypeScript, bundled with esbuild into `main.js`, `manifest.json` and `styles.css`. Node is only needed to build; vaults receive the built files.
- **Structure:** one module per concern:
  - parsing task lines;
  - time words;
  - reading a note's tasks;
  - writes;
  - one renderer per view;
  - shared components (task row, card, ring, week strip, cards (popover), drag).
- **Tests:**
  - unit tests with Node's built-in test runner for parsing, time words and counts;
  - a preview page that runs the real renderers on the sample data, so the design can be checked in a browser in light and dark at every width;
  - a final check in the sandbox vault in Obsidian.
- **Install:**
  - during development, the built plugin is copied into the sandbox vault's `.obsidian/plugins/ninja-board/`;
  - later, `install.py` copies it into a new vault when Obsidian is one of the vault's readers.

## 6. Out of scope for v1
- Creating or editing tasks, dates or notes (for v0.1.0; round 2 added planning and deadlines, see above).
- Calendar export.
- Time tracking views (Capacity).
- Charts.
- Settings beyond Bases' own view options.

## 7. Open points for the checkpoint
- Setup, once by hand: the `[w]` waiting status in Tasks' settings. The Guide's Setup tile checks it.

## 8. Folding stories in the Week view (decided 2026-10-18)
Folding the task lines of a story card on this week's board was approved, and so was the same folding in the upcoming weeks, in planning and in the past weeks. Built in 1.0.4 for this week's board, and in 1.1.0 for every week.
- **What it is.** In the Week view, whichever week it shows, a story card (a task note inside a project) can fold its task lines away.
  - A folded card keeps its head: title, meta, and on this week's board and in the lists the progress ring and count and its points. Its lines are hidden.
  - New stories start open.
- **One list for every week.** The story cards of this week's board, of an upcoming week (Planned or due, To plan and its Show all list modal) and of a past week fold the same way, by one list of story names. A story folded on one week is folded on every week it appears, and in the list modal.
  - A click on a chevron folds every card of that name in place, on the page and on the page behind a list modal, then saves.
- **The chevron.** The same chevron the planner's story cards have, first in the card's head: `button.brain-peek`, with `aria-expanded` and an `aria-label` that says what it does next ("Hide the lines of ..." or "Show the lines of ...").
  - It uses the existing chevron styles. Its hit area is the card's left edge (the left 15% and 12px) at the card's full height, with the open lines kept above it: a click there folds the card, and the lines' checks stay free. The rest of the card still opens the note or starts a drag.
  - It shows only while the card is hovered or has the keyboard's focus in it, and always on a touch screen (`@media (hover: none)`). Its place stays (opacity, not display), so nothing shifts when it appears.
  - This is scoped to the Week view's story cards by a class of their own, `brain-foldable`. Backlog's chevrons stay as they are, and board cards carry no `data-story`; the list cards of an upcoming week keep theirs, for their small-card spacing.
- **Remembered across restarts.** Folded stories are saved in the Week view's own config, the base block in the Week dashboard note, under `collapsed`: a list of story names, the note name (the key an arrangement uses).
  - It is saved the way an arrangement is, through the view's config, but it is **not an undo step**, and folding is not an edit on a past week either.
  - Where the config can't hold it (an embed, a hover preview or a canvas) or the save fails, the fold lasts for the session, as the Schedule's view does. A Notice appears the first time, saying "Open the dashboard note itself to keep stories folded" where the config can't hold it, and "Couldn't save the folded stories" when a save fails.
  - A name stays in the list after its story leaves the week, so it is still folded when it comes back. The list is never pruned, and a name is listed once.
  - A fold changes the cards in place and does not draw the page again, so a hovered chevron does not flicker; the draw that echoes the save is skipped, as is any draw from the inputs already on screen, and a draw keeps the hover look of what the pointer is on. All of this holds on every week.
- **Collapse all and Expand all.** An icon button, quiet like the other icon buttons, on every week page that has a story card. It folds or opens every story card that shows on the page, in place, then saves their names.
  - **Where.** This week: the right end of the "Coming up" row, after the week chips. An upcoming week: the right end of the "Planned or due" heading row. A past week: the right end of the "Record · frozen ..." or "From your notes" line.
  - Collapse all is a compact list: three short lines, each with a dot before it. Expand all is a detailed list: two small squares, each with two lines beside them.
  - When every story card that shows is folded the button reads "Expand all stories" and shows the detailed list; otherwise it reads "Collapse all stories" and shows the compact list. With no story card on the page there is no button.
  - Collapse all adds every story name that shows to `collapsed`. Expand all removes those names and keeps any others.
  - On an upcoming week, while To plan is open the button covers the cards of both tiles; while it is closed, the cards of Planned or due only (To plan's are not on show). A week whose only stories are in To plan has the button hidden while To plan is closed.
- **Upcoming weeks and planning.** Story cards in Planned or due and in To plan (and its Show all list modal) fold by the shared list: open by default, the chevron on hover. They no longer fold by themselves while planning.
  - Opening and closing planning (the Plan this week pill) leaves every card as the list says. It still shows and hides the To plan tile and makes the planned cards draggable.
- **Past weeks.** A story becomes a read-only card, with the same chevron and the same list. The past week's board still has its columns, and each column counts its top-level items, cards and rows, as the board does.
  - **A line belongs to a story** when its parent is that story. In a record, the line's context (the text after " · ") equals the story's title, and the title names a story: a task note inside a project in the vault, or another item listed in Not done, In progress or Done of the same record. In "From your notes", the line's note is a story note. A line of a project or an area, or of a story that can't be identified, stays a row.
  - **The card's column** is the story's own row's, when the story is itself listed. Otherwise it is the first of Not done, In progress and Done that holds one of its lines. The card sits at its own row, else at its first line.
  - **The card** shows the story's title (it opens the story's note where that exists, plain text otherwise) and, when the story is itself listed, its own words (its context and state), then its lines as read-only rows with their own state and words ("Done Fri", "moved → ...", "Due ...", "dropped ..."), without the story's name. A story that isn't listed has no words of its own.
  - **A card is one level.** A listed story that has lines is never a line of another card. A story listed twice takes its lines in its first row. A story with no line in the week stays a plain row.
  - There is no progress ring, no drag, no state menu and no focus stop on the card: its title and chevron are its controls. The week's figures (tasks done of total, points) are the record's or the notes' own, not the cards'. A record's Backlog stays a flat fold.
- **Backlog is unchanged.** Its No date tile and its list modals keep their own folding: each story card folded behind an always-shown chevron, opened for the session only, and nothing saved.
- **Today** never draws a story's lines as a card (its rows come from a story's doing lines and notes, with no ring or lines), so it has nothing to fold.

## 9. Board pages are clean and read-only (decided 2026-10-19)
A screenshot of a dashboard note showed, above the board, the Properties panel (`type`, `created`, "Add property"), an empty line with the text cursor, and the base block's `</>` button. The request was to make that top section invisible, so that a board page is just the board. There is nothing to type on in a board page itself, and read-only was approved. Built for 1.1.1.

The first build found a board page by reading its text and marked the note from the view's side. Run in Obsidian 1.14.4 and sampled frame by frame, it showed two faults, and this design is the answer to them. Marking the five board notes, having Ninja Board hide their Properties and title, and opening them read-only was approved, at the cost of a Second Brain Setup release.
- **The measurements.** The first two are the faults. The third is why a class has neither.
  1. The note-level host mark (a class on the note, set by `src/ui/host.ts`) is set once, when a view loads, by a walk up from the view to the note. Bases attaches the view to the note after that, so the walk never reached the note: the mark was set on neither the editing container (`.markdown-source-view`) nor the reading container (`.markdown-preview-view`). Measured in Obsidian 1.14.4 in Live Preview and in reading view, for a dashboard note without the class and for a note that embeds a dashboard. So the rules keyed to the mark never applied, and a dashboard showed its Properties and title the whole time, after Back and after a restart too. The mark on a base block or embed (`brain-embed-host`) does land: the Bases toolbar is hidden.
  2. The text of the note came too late. `file-open` fires before the view holds the new note, so the page was known only after an asynchronous read. For about 50 ms the page showed in Live Preview, with its Properties, its title and the `</>` button.
  3. `cssclasses` has neither fault. With a class in the note's frontmatter and CSS on that class, Obsidian puts the class on the note's editing and reading containers as it draws the note. Sampled frame by frame, the Properties and the title never showed, in either mode. And the frontmatter is in `metadataCache` when `file-open` fires, so the switch to reading view can be made inside the handler, with no read.
- **What a board page is.** A note whose frontmatter `cssclasses` holds `ninja-board`: a list with that item, or the string `ninja-board`. The five dashboard notes carry it, written as a list after `created:`:
  ```yaml
  ---
  type: note
  created: 2026-10-01
  cssclasses:
    - ninja-board
  ---
  ```
  - **The match follows Obsidian's own reading of the key (1.14.4).** The key is `cssclasses` in any case (`CSSClasses:` works), a list or one string, and each item is trimmed (`' ninja-board'` counts). A string is one class, not split, and Obsidian drops a class with a space in it, so `wide ninja-board` as a string is not a board page. A class that only starts with `ninja-board` (`ninja-board-x`) is not one either. The old singular `cssclass:` key is not applied by Obsidian when it draws a note (only its Format converter rewrites it), so it is not a board page.
  - **No class, no board page.** A dashboard note without the class is a plain note: it opens as before, and a note that only embeds a dashboard (`![[02 Week]]`) is the same. A note's text is no longer read.
- **What hides.** On a board page, its Properties and its title (the note's name above the content), by the class itself: `.ninja-board` sets Obsidian's own `--metadata-display-editing` and `--metadata-display-reading` to `none`, and hides `.inline-title`. Obsidian applies the class as it draws the note, so nothing shows first, in Live Preview, Source mode and reading view.
  - **Only a board page hides them.** A note without the class, one that embeds a dashboard included, shows its own Properties and title. The note-level host mark was built first, to hide them for such notes, and was removed on 2026-10-20 because it never reached the note in 1.14.4 (measurement 1): its rules hid nothing.
  - **The Bases toolbar** of a base block or embed that holds a view stays hidden, board page or not, by the mark `brain-embed-host` that `src/ui/host.ts` sets on the block or embed. Ninja Board's views have their own sorting and grouping. Source mode still shows the block's code to edit.
  - The earlier `display: none` on the Properties panel lost to Obsidian's rule for it in Live Preview and in reading view, which reads those two variables.
  - The `type` and `created` properties stay in the note: the vault's rules give every note both. They are hidden, not removed.
- **Read-only on open.** When a board page opens in source mode (Live Preview or Source), Ninja Board switches it to reading view inside the `file-open` handler, with no entry in the tab's history, and does not wait for anything. It does this when a file opens, once at startup for every open note tab that is loaded (a tab Obsidian has not loaded yet is left to the file-open event when it is first shown), and again when the metadata cache gains an entry. If the metadata cache has no entry for a note yet (a vault still indexing when the start page opens, a note copied a moment ago), the note counts as no board page for now and is not taken as checked: the next file-open, a tab switch included, or the arrival of its entry checks it again. The class still hides its Properties and title meanwhile. The board is drawn in reading view and does everything it did: ticks, drags, folds, Undo. Reading view shows no `</>` button and no empty line, so the page is the board and nothing else. The commands Open today and Open guide open board pages, so they open read-only too.
- **Leaving it.** A plain note opened from the board (a card or a row) opens for editing at once, with the cursor on its line. Any other note opened in the same tab (from the file list or a link) goes back to editing, the mode the tab had before. A board page opened over a board page stays in reading view, from the board too: the Guide's links to the dashboards open that way.
- **Tab switches.** Obsidian also fires its file-open event when the user switches to another tab. A note view that shows the same note as at its last check is not opened again, so a switch changes nothing. The check is kept per note view, not per tab: a note that opens in a tab after a PDF or a canvas gets a new view, and counts as an open.
- **Cmd/Ctrl+E.** A user who switches a board page to editing keeps it, until the page is opened again. The base block's code is one switch away.
- **A default view of reading.** Whether a board page that is already in reading view is left alone depends on the user's setting (Settings, Editor, Default view for new tabs), not on the tab's mode: Obsidian saves each tab's mode, so a tab Ninja Board switched comes back in reading view after a restart, and after Back to a board page. When the setting is editing (or unset), such a page is remembered as read-only like one Ninja Board switched just now, so the note opened from it opens for editing. When the setting is reading, the page is left alone and not remembered, so the note opened after it is as that user has it. Ninja Board reads the setting as `defaultViewMode` from the vault's config, an API Obsidian does not document; without it the default is taken to be editing.
- **A switch that fails** is logged; the page keeps the mode it opened in. So is a check that throws: the pass at startup runs inside the plugin's own load when it is enabled after Obsidian has started, and one leaf's failure must not stop the other leaves or the load.
