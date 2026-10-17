# Ninja Board: weeks and story points design

This design sets two changes to the Ninja Board plugin, built in this order: **Part 1** fixes what a week holds, and **Part 2** adds optional story points on top of it. Each rule here was decided step by step, and the rules are binding. It builds on the round-2 design (`2026-10-14-brain-plugin-round-2-design.md`) and the implementation spec, where story points are deviation 5. Nothing here changes the [system design](https://alexsendula.github.io/second-brain/system-design/).

| | |
|---|---|
| Status | 2026-10-16. Decided with the author. Built on 2026-10-16, plugin side: story points (Part 2), the repeating-item states (section 8) and the planning of repeating notes. |
| Builds on | `2026-10-14-brain-plugin-round-2-design.md` (the Week board, planning, To plan), `2026-10-13-brain-plugin-design.md`, and the [implementation spec](https://alexsendula.github.io/second-brain/implementation/) (deviation 5, and its data, Edits and subcommand tables) |
| Visual design | The mockup ([design/mockup.html](../../design/mockup.html)): the Week 42 header and board, story cards, the planner card on a story, the planning page, and Backlog's No date. |

## 1. What was asked for, and what was decided

| The ask (shortened) | Decided |
|---|---|
| A week holds only what is assigned to it: "everything in a week should only be in there if it is assigned to that week". | Part 1 (section 2). A week holds an item when one of its dates falls in that week, or it was done that week, and open items carry over. Every task line, task note and story follows this. |
| Stories should plan like task notes. | Part 1: stories get the planner card, and can be dragged onto a day, onto Planned or due, or back to To plan. |
| Story points are a choice of this implementation. The system spec is a framework that stays frozen. | Part 2 (section 3): optional points on stories only, recorded as **deviation 5** in the implementation spec. The system spec is not touched. |
| Points are for work: Ninja Board will be used in a work vault too. | With no points anywhere, nothing about points shows, anywhere. |
| Points estimate a whole piece of work. | Only stories carry points, never their tasks, so the work isn't counted twice. Values are Fibonacci, which don't add up. |
| A weekly target that can be passed. | `points_per_week` in the config note, default 8. A week may be planned and done past it. |
| The agent should slowly learn to estimate better. | Each week's record stores its planned and done points (section 5). |
| Visuals, chosen from several sketches. | Section 4. |

## 2. Part 1: what is in a week

- **The bug.** Ninja Board doesn't do this today. The Week board shows every open story of an active project in To do: `storyColumn` in `src/model/week.ts` checks no date. The system spec builds the week plan from what is *assigned* to it: "repeating tasks that fall in the week, deadlines, planned tasks, appointments…" (system 4.6). The ask was that everything in a week be there only if it is assigned to that week. This applies to every task line, task note and story alike.
- **The rule.** An item is in a week when one of these falls in that week:
  - **Do date:** a planned day (`scheduled`), or planned for the week (`start` = that Monday).
  - **Deadline:** `due`. A repeating note's deadline counts only when the note has no plan (section 8).
  - **Early reminder:** its lead window, from `due` minus `lead` up to `due` (system 3.4). The Week board doesn't show this today.
  - **Chase date:** a waiting line's `scheduled`, if it is waiting.
  - **Repeat:** a repeating item that falls in the week.
  - **Done:** it was done that week.
- **Carry-over.** An item assigned to an earlier week and still open carries into this week automatically, until it is done or replanned.
  - This is how Today treats missed plans (deviation 4), and what Ninja Board does for task lines now.
- **Planning page.** Carried-over items also show in the planning view, under To plan's "Still open this week".
- **No date.** A story with no date at all is in no week.
  - It goes to Backlog's No date, under its project, and to To plan's No date, until it is planned.
  - That includes a story whose status is doing or waiting but has no date. The rule is assignment only.
  - **Consequence to confirm:** such a story leaves the Week board.
- **Stories become plannable**, like task notes. Today the planner leaves stories out.
  - The planner card offers a story the same choices as a task note: a day, the week, Later, and No date yet.
  - A story card can be dragged onto a strip day, onto Planned or due, or back to To plan.
- **The personal vault.** This changes it too: unplanned stories leave the Week board everywhere. That is intended.
- **No task lives on its own.** Every task lives in an area or a project (system 5.2, rule 1), and captures wait in the Inbox.
  - A stray task can still turn up, for example a line in a reference note or a person note. Ninja Board still shows it, labelled with its note, as it does now: nothing silently disappears.
  - The agent's vault check flags it so it gets moved. Nothing new is built for this.
- **Round 2 is superseded where they differ.** Round 2 is not edited here. Its rules change where they differ: its section 4 says stories can't be planned in Ninja Board ("What can be planned"), it leaves stories out of To plan ("What To plan offers"), and it says repeating task notes can't be planned or moved to another column. The bullets above and section 8 replace them.

## 3. Part 2: story points

- **Why it is a deviation.** The system spec's section 7, "Decisions that replaced earlier proposals", says "No size field (S/M/L): an optional estimate covers it", and "Story points and sprints dropped: capacity comes from real hours (Capacity add-on) and the week plan." The system spec is a framework that stays frozen, and points are a choice of this implementation. So they are recorded in the implementation spec as **deviation 5**, next to deviation 4. The system spec is not touched.
- **Who uses it.** It is for work. Ninja Board will be used in a work vault too. With no points anywhere, nothing about points shows, anywhere.
- **What can carry points.** Only **stories**: task notes inside a project, with frontmatter `points: 3`.
  - Not task lines. Not area task notes (task notes outside a project). Not the tasks inside a story.
  - The reason: a story's points estimate the whole piece of work, so pointing its tasks would count the work twice. Fibonacci points don't add up either.
  - A story's task lines keep showing progress through the 1/3 ring.
- **The scale.** 1, 2, 3, 5 or 8. Ninja Board offers only these values. Points may also be absent.
- **Who sets them.** Mostly the agent, through a `brain` tool next to plan and due: a `points` edit (section 5), shared with Ninja Board through `test/edit-cases.json`. They can also be set in the planner card (section 4). The edit sets `points` to one of the values, or removes it.
- **The target.** `points_per_week` in the vault's config note. It defaults to 8 when absent.
  - A week may be planned past it (12 or 13 is fine) and done past it. Nothing stops it.
- **What counts in a week.** The stories in that week, by Part 1's rule, carried-over ones included.
  - **Planned:** the sum of those stories' points, open and done that week.
  - **Done:** the points of the stories done that week.
- **When it shows.** The points ring and label appear only when at least one story in the shown week has points. That applies on the Week page, and on the planning page for the week being planned.
- **Learning over time.** The goal is that the agent slowly learns to estimate better. Each week's record (`08 Weeks/<year>/<YYYY-Www>.md`, written by the agent's `brain week`) stores that week's planned and done points, in frontmatter `points_planned` and `points_done`, only when a story in that week has points: a vault that never uses points gets neither. The past-week view shows them read-only when present.

## 4. Visuals

These were chosen from several sketches.

- **The Week header's tasks ring** keeps its ring. Its label becomes done/total, "2/16", followed by a checklist icon on the right: Lucide `list-checks`, or the nearest. This replaces "14 left".
  - Applied on the Week page. Today is unchanged, since it wasn't discussed.
- **The points ring**, beside the tasks ring, uses the same size and stroke.
  - **The outer ring is the target (8).** The done arc is in the accent; the planned-not-done arc is in a light accent; the empty track is the ring track.
  - **Overflow** (planned past the target) is a thin **orange inner circle**: half a lap for +4, a full lap for +8, capped at one lap. Overflow points that are done turn the accent colour, the same as done points on the outer ring.
  - **The label** is "12/8 pts" (planned/target), the same size as the tasks label.
  - **Over target,** a raised amber "+4" sits just above and to the right of the target number, like an exponent. It has no pill and no border, and a tiny gap of whitespace below it so it doesn't touch the text.
  - **Under target,** there is no badge and no inner circle: "5/8 pts".
  - **Colour:** no colour literals. Use Obsidian's and Ninja Board's variables, with orange as Obsidian's orange or warning colour.
- **A story card** shows "3 pts" in its top-right corner, under its 1/3 progress ring, small and quiet. A story without points shows only the ring, as today.
- **The planner card on a story** has the same plan picks as for a task, then a separator, then a **Points** row.
  - The row has the label "Points" and five equal-width picks, 1, 2, 3, 5 and 8, that fill the row's width so they are easy to click.
  - The pressed pick is the story's points. A click sets them; a click on the pressed pick removes them.
  - Then a separator, then the states row, as now. The Points row appears only for stories.
- **The planning page** shows the planned week's points ring, which updates as stories are planned in. To plan lists stories with their points, using the same quiet "3 pts".
- **To plan's No date.** Undated stories show inside No date's project groups, as small story cards: the title, then "No date" in the meta.
  - The top-right corner holds the progress ring and count (1/3) and, under it, "3 pts" when the story has points.
  - A group's stories come before its tasks.
- **The list modal.** "Show all" opens the same list in the list modal, and stories show there as the same cards.
  - A card can be carried out of the modal onto a day of the strip, or onto Planned or due, which plans it, as rows carry out now.
- **Peek, for stories only.** A chevron at the card's start folds the story open in place, to show its task lines, which can be ticked there. A second click folds it shut.
  - Task rows and area task notes get no chevron: tasks are self-explanatory.
  - **A big target.** The left 15% of the card opens or folds it, padding included, not just the chevron. A folded card's strip runs its full height. An open card's covers only its head, so the lines' checks stay free. The rest of the card still opens the note.
  - **Only while planning.** Folded cards and the chevron belong to planning: To plan, its list modal, and Planned or due while To plan is open. When a week is only looked at (To plan closed), Planned or due shows its story cards whole, with their lines and no chevron, as the board does.
  - **Stacked cards keep a gap** (as on the board), so two story cards in a list never touch.
- **A planned story** shows in the planning view's Planned or due as a story card, with the same ring, count and points as in To plan.
- **The planning header** shows two counts, not "5 planned or due".
  - **Planned:** the number, then the checklist icon (Lucide `list-checks`, as the Week header's tasks figure).
  - **Due:** a small gap, then a red flag icon (Lucide `flag`, in the danger colour), then the number.
  - There are no day bars and no words. The words go in the tooltip and the accessible label: "5 in the week, 3 due".
  - **What each counts (decided 2026-10-16):** the first number is everything in Planned or due; the second is how many of those have their deadline in the week. The tooltip and label read "5 in the week, 3 due".
  - The points ring stays at the right.
- **Narrow widths.** At 320px and 360px the header's points figure sits at the right edge of its row, the tasks figure on the left.
  - **Coming up** stays on one line at 320px: its three week chips take slightly less padding and gap. Their text does not change ("Week 43 · 5").
  - If the chips still do not fit in Obsidian's font, use "Wk 43" at those widths. Coming up is otherwise unchanged.

## 5. Edits and the agent

- **The points edit** sets or removes a story's points. It is a frontmatter edit, in the same form as the due edit (implementation spec, Edits):
  - **Set story points:** `points: 3` in the story's frontmatter, one of 1, 2, 3, 5 or 8. An existing `points` is replaced.
  - **Remove story points:** the `points` key is deleted.
  - Stories only. No other kind of note or line takes this edit.
- **Parity.** Ninja Board's planner card sets points; the agent sets them with `brain points <file> <1|2|3|5|8|none>`. A story is a note, so the command takes no line. The result is the same either way.
- **The week record fields.** The week plan (`08 Weeks/<year>/<YYYY-Www>.md`) gains two frontmatter fields, written by `brain week`:
  - `points_planned`: the week's planned points (section 3, What counts in a week).
  - `points_done`: the week's done points.
  - `brain week` writes both on every refresh, like the record sections, so a frozen week keeps the values from its turn, but only when a story in that week has points; otherwise it writes neither (and removes them if the week no longer has any). Ninja Board only reads them, in the past-week view, and only when present.
- **Config.** `points_per_week`, a number, default 8 when absent.
- **The data table** in the implementation spec gains the matching fields: task `points` (1, 2, 3, 5 or 8; stories only), config `points_per_week`, and week plan `points_planned` and `points_done`.

## 6. Building and checking

- **Part 1 before Part 2.** Part 2 sits on Part 1: a week's points are the stories in that week by Part 1's rule, carried-over ones included. Part 1 is built and checked first.
- **Tests first.** Each rule gets its test before the code it checks, and each test is seen to fail, for the right reason, before the code is written.
  - Part 1: one test per rule in section 2; carry-over; the planning list; and a story with no date, which is in no week and is listed in Backlog and To plan. Include a story that is doing or waiting with no date.
  - Part 2: the points cases below, and the UI checks for section 4.
- **The parity cases.** Each points case is an entry in `test/edit-cases.json`, the file the plugin's tests read, and the `brain` commands are tested against the same file. The cases: set each of 1, 2, 3, 5 and 8; replace a value; remove a value.
  - Stories can now be planned (Part 1), so they also get the plan cases a task note gets, with the same expected results.
- **The overview.** `brain week` applies the same rule as the Week board (implementation spec, Week plan).

## 7. Not in scope

- Points on anything but stories.
- Velocity charts.
- Syncing with a work tool: none exists.
- Any change to the system spec.
- Today's "N left".

## 8. Repeating items: every state from Ninja Board (decided 2026-10-16, built 2026-10-16)

This was decided on 2026-10-16. It overturns the rule that a repeating task note is never ticked, planned or moved in Ninja Board ("done via the agent"), which the round-2 design and the implementation spec both stated. It matches system 4.8: a repeating task is done by ticking it off or telling the agent.

- **Every state.** A repeating task note's row (Ninja Board shows its repeat, for example "Every 6 months") gets the tick and its five states (To do, Doing, Waiting, Done, Dropped), like any other task note. The "done via the agent" line goes.
- **To do, Doing and Waiting** are plain status writes, as for other task notes. A Waiting set from Ninja Board may lack who or when. `brain check` reports it, and the catch-up asks, as it already does.
- **Done means this occurrence is done.** Ninja Board moves the note to its next date by the same rules as `brain complete`, written down in the implementation spec (section 2, Edits: "Complete a repeating task note"):
  - the repeat rule (`every n` days, weeks, months or years, or `every <weekdays>`);
  - counted from the due date or from the done date, by `repeat_from` (default: the due date);
  - for fixed-date repeats, a missed occurrence carries over (it stays due) or lapses (it is skipped), by `if_missed`.
  The row goes back to open with its new due date. A plan for the finished occurrence (its planned day or week) is removed. The completion adds a line to the note's Log, as `brain complete` does. The meta shows the new date.
- **Dropped** stops the repeat: status dropped, and `done` set to today, as for any task note.
- **Dragging** a repeating row to another column changes its state, like any row. A drop on Done completes the occurrence instead, as the tick does. Arranging within a column stays as it is.
- **Undo** covers all of these, through the normal write path.
- **Where the row shows.** Each completed occurrence is a Done row in the week it was done, from its Log line (section 2): its title, "Done Thu" and the repeat mark, with no tick. The note itself is on This week's board in the week its plan gives or, with no plan, the week its next due date falls in (section 2), with its dates in its meta. A note in another week is not on this board.
- **Planning.** A repeating task note takes the planner card, as a task note does, with its five states and its day, week and deadline rows (built on 2026-10-16). The rules, decided on 2026-10-16:
  - a left click on a day sets the do day; a second click on that day clears it; the deadline stays;
  - a left click on the red day makes it the do day too; the red chip stays and can't be cleared;
  - a right-click on another day moves the deadline there; a right-click on the red day does nothing;
  - a week plan, or No date yet, sets or clears the plan only; the deadline stays;
  - a drop on a day plans the row for that day; a drop on To plan takes its plan away; the deadline stays;
  - **Done** on the card completes the occurrence (the bullet above) and closes the card.
- **The week.** A repeating note's plan decides its week: a planned day or week puts it there, and its deadline's week does not count. With no plan, its deadline puts it in its week. To plan still lists no repeating note. On Today and in the week it sorts by its plan, not by its passed deadline.
