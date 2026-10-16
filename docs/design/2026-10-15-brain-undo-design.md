# Ninja Board: undo design

Ninja Board gets one undo button and one history for every Ninja Board page. Each change Ninja Board makes, to a note in the vault or to the dashboard's saved layout, is one step, and each press undoes the most recent step left. The rules here were decided on 2026-10-15 and are binding. It builds on the round-2 design (`2026-10-14-brain-plugin-round-2-design.md`) and the brain plugin design (`2026-10-13-brain-plugin-design.md`). Nothing here changes the [system design](https://alexsendula.github.io/second-brain/system-design/), and no note format changes: undo writes back the values Ninja Board already writes.

| | |
|---|---|
| Status | 2026-10-15. Decided with the author. Built on 2026-10-16. |
| Builds on | `2026-10-14-brain-plugin-round-2-design.md` (the Week board, planning, To plan), `2026-10-13-brain-plugin-design.md`, and `2026-10-13-second-brain-implementation.md` (its Edits table: every write that undo reverses) |
| Visual design | The working demo in [design/mockup.html](../../design/mockup.html), which has the button and the history. |

## 1. What was asked for

| The design (shortened) | Decided |
|---|---|
| One undo button, always in the same place: top-right, above the tasks and points figures, on every page except the Guide. | Section 2. |
| Each press undoes the most recent remaining action, so pressing again goes further back. | Section 3. |
| One history for all Ninja Board pages, lasting for the Obsidian session and cleared on reload. No redo. | Section 3, and section 7. |
| Cmd/Ctrl+Z does the same in a Ninja Board view, never in the editor. A command, "Undo the last Ninja Board change", can be bound. Ninja Board sets no default global hotkey. | Section 3. |
| What counts as an action, and what is view state. | Section 4. |
| Undo restores only where the note is still as Ninja Board left it. Otherwise that step is skipped, with a notice. | Section 5. |

## 2. The button

- **Where.** The top-right of the page head, above the figures. It is in the same spot on every Ninja Board page: Today, every week page, Projects, and Backlog & Waiting (in its first head). It is not on the Guide.
  - A page without figures keeps the same top-right spot.
- **When it shows.** Only when there is something to undo. The history empty means it is hidden. After the first change it fades in.
- **Look.** A small round icon button with a back-arrow icon, in the muted text colour. Its hit target is the same 28px as the week's ‹ › buttons. The icon is drawn like the mockup's other small icons: one stroke in `currentColor`, round caps, on the 16px icon grid.
- **Tooltip and label.** Both name the action it would undo: `Undo: untick “Pay the window cleaner” (⌘Z)`. The accessible label is the same without the shortcut. The shortcut reads Ctrl+Z off macOS.
- **Narrow widths.** Below 400px the button stays on the title's row, at its right. The figures take the row beneath, as the Week figures already do at that width.

## 3. History and keys

- **One stack.** The history is shared by all Ninja Board pages. An action on Week can be undone from Today.
- **Each press** undoes the most recent action left. The next press undoes the one before it, as far as the session's history goes.
- **Lifetime.** The history lasts for the Obsidian session and is cleared on reload. There is no redo.
- **Cmd/Ctrl+Z** does the same while focus is inside a Ninja Board view: a Ninja Board page, the list modal, or the planner card.
  - In a text field, such as the list modal's search field, the key keeps the field's own undo. The editor's undo is never taken.
- **The command.** "Undo the last Ninja Board change" can be bound by the user. Ninja Board sets no default global hotkey.

## 4. What is an action

- **Counts as an action.** Anything Ninja Board writes, in the vault or in the dashboard's saved layout:
  - ticking and unticking;
  - a state (To do, Doing, Waiting, Done, Dropped), from the check, the planner card, or a drop;
  - plan and deadline edits, from the planner card or a right-click on a day;
  - drag moves and drops, with their arrangement, and Alt+↑ / Alt+↓ arranging within a column;
  - story points;
  - project status;
  - the Waiting and Schedule switches, since they are saved to the layout.
- **One user action is one step,** even when it made several writes. Examples: a planner pick that plans a row and drops a deadline; a drop that changes a row's state and its place in the column.
- **Not an action.** Pure view state: folding a story, scrolling, switching weeks, opening planning, and opening or closing a modal.

## 5. Safety

- **Restore only where unchanged.** Undo puts back the before-state only where the note is still exactly as Ninja Board left it. This is the same guard as the stale-line refusal: `replaceLineIfUnchanged` in `src/obsidian/edits.ts`. A frontmatter edit gets the same check: the field must still hold the value Ninja Board wrote.
- **Skipped steps.** If the user or the agent changed the note since, that step is skipped. A short Notice says "Changed since: not undone", and the step leaves the history.
  - One press handles one step. A skipped press does not go on to the step before it; the next press does.
- **Recurring tasks.** A tick that Tasks answered with a recurrence (two lines, see `setLineState` in `writes.ts`) has no single line to restore. Undo skips it with the same Notice.
- **Same writers.** Undo writes through the functions Ninja Board already uses for its own edits, so their rules hold on the way back.

## 6. How it is built

The writes all go through `src/obsidian` (`writes.ts` and `view.ts`). The undo stack lives in that layer.

- **The stack.** Each action records its before and after: a note's line or frontmatter values, or the dashboard's saved arrangement. An action that makes several writes records them as one step.
- **The restore.** Undo puts back the raw before-text of each write, behind the stale guard (section 5): a task line through `replaceLineIfUnchanged` in `src/obsidian/edits.ts`, a frontmatter key through `processFrontMatter`, and a view's saved value through the config's `set`. A repeating note's Log line is taken out rather than restored: `withoutLogEntry` in `src/model/repeat.ts` removes the entry under a section that was there, or the text Ninja Board appended for a section it made (which must still end the note), and nothing else. It does not run the writers that made the change (`setLineState`, `toggleNoteStatus`, `planLine`, `dueLine`, `planNote`, `dueNote`), so a restore writes back what was there and adds nothing.
- **The interface.** The `Actions` interface (`src/ui/actions.ts`) gains `undo()`. The UI only shows the button, sets its tooltip and label, and calls `Actions.undo`. The keyboard handler and the command call the same method.
- **The mockup differs on purpose.** The demo in `design/mockup.html` keeps a snapshot of each Ninja Board page's DOM and restores it. The plugin restores notes and layouts instead. The demo shows the behaviour, not the build.

## 7. Not in scope

- Redo.
- History across reloads.
