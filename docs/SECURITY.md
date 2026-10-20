# Security

> Last updated: 20 October 2026

## Overview

Ninja Board is a local Obsidian plugin. It has no server, no account and no network code. It runs with Obsidian's access, and the implementation spec keeps third-party plugins to a minimum because a plugin can do anything on the computer ([implementation spec, section 1](https://alexsendula.github.io/second-brain/implementation/)). So the protection for the vault is in the code: what Ninja Board reads, the small set of writes it makes, and how it builds the screen.

The rest of this page is what the code does, checked against the source (20 October 2026).

## What Ninja Board can touch

Obsidian's API lets a plugin reach the whole vault. Ninja Board's code reaches much less.

| Area | What the code does | Where |
|---|---|---|
| Notes Bases selects | Reads their frontmatter from the metadata cache. Reads their text only when they have task lines, or when they repeat (a repeating note's Log section is read as well). Undo reads the whole text of each note it puts back, to check it first | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `snapshotFromFiles`, `rawNote` and `readKeptLines`; [obsidian/undo.ts](../src/obsidian/undo.ts), `restore`, line 72 |
| Notes open in a Markdown view | Their frontmatter's `cssclasses`, from the metadata cache, to tell a board page. Their text is not read for this | [obsidian/boardPages.ts](../src/obsidian/boardPages.ts), `check`; [model/isBoardPage.ts](../src/model/isBoardPage.ts), `isBoardPage` |
| The folders above a story | `isStoryFile`, the story check behind the points edit, reads the note and the folders above it, up to the nearest one that holds a project note. It takes their frontmatter from the metadata cache, reads no note text, and never lists the vault's files | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `isStoryFile` and `projectsAbove` |
| `10 Archive/` | Never read. Both snapshot builders drop it | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), lines 11 and 23; [model/snapshot.ts](../src/model/snapshot.ts), lines 7 and 14 |
| A past week's plan | Read by its path, `08 Weeks/<year>/<YYYY-Www>.md`, only when that week is shown | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `readWeekPlan` |
| The config note | `99 System/config.md`: its `points_per_week`, the week's points target, from the frontmatter in the metadata cache. Reads no note text | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `readPointsTarget`, line 63 |
| The dashboard note's layout | Bases' view config: `arrange`, `schedule`, `waiting` and `collapsed` | [obsidian/view.ts](../src/obsidian/view.ts), lines 146, 162, 183 and 209 (the first three through `saveLayout`, whose `config.set` is at line 248; `collapsed` calls `config.set` itself) |
| Tasks' saved settings | Read through Tasks' own `loadData()`, for the Guide's check. Only `taskFormat`, `setDoneDate` and the custom statuses are used, and they are not shown. Whether Tasks is on comes from Obsidian's list of plugins | [obsidian/edits.ts](../src/obsidian/edits.ts), `readTasksSetup`, line 151; [model/guide.ts](../src/model/guide.ts) |
| Other files, settings and plugins' data | Not read | None |

Ninja Board opens a note only when you click its title or press Enter on it, or run **Ninja Board: Open today** or **Ninja Board: Open guide**. Opening is in the current tab ([obsidian/actions.ts](../src/obsidian/actions.ts), `openNote`, line 137; [main.ts](../src/main.ts), `openToday`; [obsidian/guide.ts](../src/obsidian/guide.ts), `openGuide`). A board page, a note whose frontmatter `cssclasses` holds `ninja-board`, is switched to reading view when it opens in source mode (from the `file-open` handler, at layout ready, or when the metadata cache changes), with no history entry. A plain note opened from a board page opens for editing, a board page opened from one stays in reading view, and a non-board note that opens in a tab Ninja Board had switched goes back to editing. These are view-mode changes, not writes ([obsidian/boardPages.ts](../src/obsidian/boardPages.ts), `check` and `setMode`; [main.ts](../src/main.ts), `registerBoardPages`, line 37).

## Reading note text

- **Linear wikilink parse.** Ninja Board reads `[[link]]` targets in task lines with a pattern that takes time in step with the line's length ([taskLine.ts](../src/model/taskLine.ts), `LINK_RE`). The earlier pattern backed off through every start, so a line with many unclosed `[[` took seconds on every render. [`taskLine.test.ts`](../src/model/taskLine.test.ts) parses a 2.8 KB line of unclosed openers and fails if it takes 200 ms or more.
- **One bad note.** A note that can't be read (locked, evicted or removed) shows no tasks. Its error goes to the console, and every other note still shows its tasks ([obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `readKeptLines`).
- **Date fields in brackets.** A field such as `[due:: [[2026-10-17]]]` is read and edited as one value, so a write never leaves a stray `]]` behind.

## Writes

Ninja Board makes writes in four places, and nowhere else. Opening a note, and a board page's switch between reading view and editing, are listed too. Neither writes to the vault.

| Write | How | Check before it writes |
|---|---|---|
| A task line: tick, state, plan, deadline | `vault.process` on the line's note, replacing one line ([writes.ts](../src/obsidian/writes.ts), `writeLine`, line 146) | `replaceLineIfUnchanged` ([edits.ts](../src/obsidian/edits.ts), line 48): the line must still be the text Ninja Board read. If not, nothing is written, and the Notice "That task changed — refreshed" shows ([writes.ts](../src/obsidian/writes.ts), line 163) |
| A task note's or project's frontmatter: status, done, scheduled, start, due, points, and a repeating note's waiting_on and chase | `fileManager.processFrontMatter`, in `setNoteState` and `editFrontmatter`, which `setNoteStatus`, `planNote`, `dueNote` and `pointsNote` use ([writes.ts](../src/obsidian/writes.ts), lines 91 and 135) | The note must still exist. There is no line check: the change is applied to the frontmatter as it is when Obsidian writes it. A points write is refused unless the note is a story (a non-repeating task note in a project); an area task note, a repeating note and a task line are refused before any write |
| A repeating note's Log line | `vault.process` on the note, adding one line under its first `## Log` heading, or a new `## Log` section at the end of the note when it has none ([writes.ts](../src/obsidian/writes.ts), `logOccurrence`, line 110). It goes with the frontmatter write of a repeating note's done | The note must still exist. There is no line check: the line is added to the note as it is when Obsidian writes it. A done that Ninja Board can't work out (a `repeat` or `due` it doesn't know) writes neither the frontmatter nor the line, and the Notice "Can't complete this repeating note: its repeat or its due date isn't one this plugin knows" shows ([writes.ts](../src/obsidian/writes.ts), line 102) |
| The layout: `arrange`, `schedule`, `waiting` and `collapsed` | Bases' `config.set`, which Bases writes into the dashboard note's `base` block ([view.ts](../src/obsidian/view.ts), lines 146, 162, 183 and 209; `schedule` and `waiting` take only fixed words, and `collapsed` takes only the names of stories) | Only where Bases can write the block back ([edits.ts](../src/obsidian/edits.ts), `arrangementPersists`, line 140). In an embed, a hover or a canvas, nothing is saved: an arrangement is refused with a Notice, and the Schedule's form, Waiting's view and the folded stories last for the session instead |
| Opening a note, and a board page's switch between reading view and editing | `openFile`, with the mode `openNote` passes ([actions.ts](../src/obsidian/actions.ts), line 137). A board page's mode is set by `view.setState`, with no history entry ([boardPages.ts](../src/obsidian/boardPages.ts), `setMode`) | None. A change of view mode is not a write to the vault |

**Undo** writes through the same places, and checks each restore again: a line only if it is still the text Ninja Board wrote, a Log line only if it is still the one Ninja Board added, a field only if it still holds the value Ninja Board wrote, and a saved layout only if the view still holds what Ninja Board saved. A step that fails a check is skipped with the Notice "Changed since: not undone", and nothing is written for it. Folding stories is not an undo step ([view.ts](../src/obsidian/view.ts), `foldStories`, line 205).

Other guards:

- **Tasks' answer.** When you tick a line, Ninja Board asks Tasks for the new line and writes it only if the answer is not empty, every line of it is a task line, and it does what the tick was for: a completing tick needs a done line, and a reopening tick needs none ([edits.ts](../src/obsidian/edits.ts), `isUsableToggle`, line 38; [writes.ts](../src/obsidian/writes.ts), `doesTick`, line 58). Otherwise the line stays as it is, and the Notice "Tasks gave an answer this plugin can't use" shows.
- **A stale click on a note.** Ticking a task note acts on the state you saw, not the state in the file. A second click on an old row therefore can't undo the first ([writes.ts](../src/obsidian/writes.ts), `toggleNoteStatus`).
- **Failed writes.** Each write is wrapped. A failed note write shows the Notice "Couldn't save that change" and is logged, and it never reaches Obsidian as an unhandled error ([obsidian/actions.ts](../src/obsidian/actions.ts), `saved`). A failed layout save is logged too, and shows a Notice of its own, such as "Couldn't save the arrangement" ([view.ts](../src/obsidian/view.ts), lines 149, 166, 187 and 213).

The plugin never deletes, trashes, renames or creates a file. A build of the current source contains none of `vault.delete`, `vault.trash`, `trashFile`, `adapter.`, `renameSync` or `unlink`.

## Network

- The plugin makes no network request. A fresh build of the current source contains no `fetch(`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`. Its only `require` is `obsidian`, which Obsidian supplies at runtime.
- The browser preview makes no request of its own. Its sample notes and the mockup's markup are bundled into it when it is built ([preview.ts](../preview/preview.ts), lines 29 and 30), and a small server on `127.0.0.1` serves its page ([serve.mjs](../scripts/serve.mjs), line 80). The preview is not part of `main.js`.
- The project's network steps are `npm install`, which fetches the development dependencies from the npm registry, and the release workflow, which does the same with `npm ci` and publishes the release on GitHub when a tag is pushed. They are developer steps. Ninja Board doesn't do them.
- Obsidian's own sync, and other plugins in the same vault, are outside this page.

## How the screen is built

- **`h()` builds every element.** It uses Obsidian's `createEl`, sets attributes with `setAttribute`, and appends children as nodes or as strings. A string becomes a text node ([dom.ts](../src/ui/dom.ts), lines 12 to 15). `svg()` uses `createElementNS` (line 26). `link()` sets `href="#"` (line 34) and stops the navigation (line 36).
- **No HTML from strings.** There is no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` in any production file, and none in a fresh build. The `innerHTML` and `outerHTML` in `src/` are in test files, which read the output.
- **No Markdown rendering.** Ninja Board doesn't use Obsidian's `MarkdownRenderer` or `setHTML`. A note's text, which can contain markup, never becomes HTML.
- **Note text in attributes.** An appointment's `title` and `aria-label` hold its name, time and place, set with `setAttribute`, so markup in them is never parsed ([schedule.ts](../src/ui/schedule.ts), lines 148 and 149). Ninja Board sets no `on…` attribute and no `href` from note text.
- **Numbers only in styles.** Run-time styles take positions and sizes computed from times, counts and screen positions, set through `setCssProps` or `setCssStyles` ([schedule.ts](../src/ui/schedule.ts), lines 83 to 97, 168 and 185; [popover.ts](../src/ui/popover.ts), lines 129 and 136; [marks.ts](../src/ui/marks.ts), lines 34 and 49; [drag.ts](../src/ui/drag.ts), lines 177, 182 and 241).

## The sandbox script

[sandbox.mjs](../scripts/sandbox.mjs) installs Ninja Board into the sandbox vault and can reset that vault's notes. It never deletes.

- It stops before any change if the vault has no `.obsidian` folder (line 19).
- With `--yes`, it renames each item in the vault's top folder whose name doesn't start with a dot (line 28) into `~/.Trash/brain-sandbox-<stamp>/` (line 54). It creates that folder without `recursive`, so a second run in the same second fails rather than overwriting (line 53). Then it copies `sample-vault/` in (line 35).
- Dot-items stay, including `.obsidian`.
- Without `--yes`, it moves nothing.
- The Trash is `~/.Trash`, the macOS location (line 29). A vault on another drive can't be renamed into it. See [Troubleshooting](TROUBLESHOOTING.md#the-sandbox-script).
- The sandbox test runs the script with `HOME` set to a temporary folder, so the real Trash is never touched ([sandbox.test.ts](../test/sandbox.test.ts), lines 16 and 29).

## Stored data

- Ninja Board keeps no data of its own. It writes no file outside the vault, and it saves no settings file (no `data.json`).
- The only state it saves is the layout in the dashboard note's `base` block.
- Ninja Board's own Undo keeps its history in memory, for the Obsidian session only. For older edits, Obsidian's File recovery core plugin and the vault's git history are the undo, as the implementation spec sets up ([section 1](https://alexsendula.github.io/second-brain/implementation/)).

## Tasks

- Ninja Board calls Tasks' public `apiV1.executeToggleTaskDoneCommand`, and reads Tasks' saved settings through `loadData()`. Tasks is a third-party plugin, so Ninja Board checks its answers before writing them (see above).
- To reach Tasks, Ninja Board reads `app.plugins.plugins['obsidian-tasks-plugin']` through a type cast ([edits.ts](../src/obsidian/edits.ts), `tasksApi`, line 29). The Guide's check reads `app.plugins.enabledPlugins` the same way, to tell a Tasks that is off from one that is on but not loaded yet (`readTasksSetup`, line 157). Obsidian's typings don't declare `app.plugins`, so an Obsidian update could change it. If that happens, `tasksApi` returns nothing and ticking stops with the Notice "Tasks must be on to tick a task". Nothing is written in that case.

## Privacy

- The plugin sends nothing anywhere. It has no telemetry and no remote calls.
- Vault content goes to a model provider only when an agent tool reads it. The implementation spec's Privacy paragraph names the providers for each tool ([section 1](https://alexsendula.github.io/second-brain/implementation/)). Ninja Board is not an agent tool.

## Dependencies

- **Runtime:** none. The plugin's only import from outside its own code is `obsidian`. A fresh build contains no `linkedom`, `yaml` or Node module.
- **Development:** esbuild, typescript, the obsidian type declarations, linkedom, yaml, @types/node, eslint, @eslint/js, eslint-plugin-obsidianmd and typescript-eslint, pinned in [package-lock.json](../package-lock.json). They run on the developer's machine only.
- The repository runs no automated dependency audit. Its only workflow is the release workflow, which runs when a tag is pushed.

## Related Documentation

- [Database](DATABASE.md): what Ninja Board reads and writes, field by field
- [Deployment](DEPLOYMENT.md): building, installing and the sandbox reset
- [Troubleshooting](TROUBLESHOOTING.md): the Notices, and what each one means
