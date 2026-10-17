# Security

> Last updated: 15 October 2026

## Overview

Ninja Board is a local Obsidian plugin. It has no server, no account and no network code. It runs with Obsidian's access, and the implementation spec keeps third-party plugins to a minimum because a plugin can do anything on the computer ([implementation spec, section 1](https://alexsendula.github.io/second-brain/implementation/)). So the protection for the vault is in the code: what Ninja Board reads, the small set of writes it makes, and how it builds the screen.

The rest of this page is what the code does, checked against the source and against a fresh build of it (15 October 2026).

## What Ninja Board can touch

Obsidian's API lets a plugin reach the whole vault. Ninja Board's code reaches much less.

| Area | What the code does | Where |
|---|---|---|
| Notes Bases selects | Reads their frontmatter from the metadata cache. Reads their text only when they have task lines | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `snapshotFromFiles` and `rawNote` |
| `10 Archive/` | Never read. Both snapshot builders drop it | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), line 16; [model/snapshot.ts](../src/model/snapshot.ts), line 5 |
| A past week's plan | Read by its path, `08 Weeks/<year>/<YYYY-Www>.md`, only when that week is shown | [obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `readWeekPlan` |
| The dashboard note's layout | Bases' view config: `arrange`, `schedule` and `waiting` | [obsidian/view.ts](../src/obsidian/view.ts), lines 115, 131 and 152 |
| Tasks' saved settings | Read through Tasks' own `loadData()`, for the Guide's check. Only `taskFormat` and the custom statuses are used, and they are not shown | [obsidian/edits.ts](../src/obsidian/edits.ts), `readTasksSetup`; [model/guide.ts](../src/model/guide.ts) |
| Other files, settings and plugins' data | Not read | None |

Ninja Board opens a note only when you click its title or press Enter on it, or run **Ninja Board: Open Today** or **Ninja Board: Open guide**. Opening is in the current tab ([obsidian/actions.ts](../src/obsidian/actions.ts), `openNote`).

## Reading note text

- **Linear wikilink parse.** Ninja Board reads `[[link]]` targets in task lines with a pattern that takes time in step with the line's length ([taskLine.ts](../src/model/taskLine.ts), `LINK_RE`). The earlier pattern backed off through every start, so a line with many unclosed `[[` took seconds on every render. [`taskLine.test.ts`](../src/model/taskLine.test.ts) parses a 2.8 KB line of unclosed openers and fails if it takes 200 ms or more.
- **One bad note.** A note that can't be read (locked, evicted or removed) shows no tasks. Its error goes to the console, and every other note still shows its tasks ([obsidian/snapshot.ts](../src/obsidian/snapshot.ts), `readTaskLines`).
- **Date fields in brackets.** A field such as `[due:: [[2026-10-17]]]` is read and edited as one value, so a write never leaves a stray `]]` behind.

## Writes

Ninja Board makes writes in three places, and nowhere else. Opening a note is listed too, because it's the one other thing that touches the vault.

| Write | How | Check before it writes |
|---|---|---|
| A task line: tick, state, plan, deadline | `vault.process` on the line's note, replacing one line ([writes.ts](../src/obsidian/writes.ts), `writeLine`, line 88) | `replaceLineIfUnchanged`: the line must still be the text Ninja Board read. If not, nothing is written, and the Notice "That task changed — refreshed" shows ([edits.ts](../src/obsidian/edits.ts), line 42) |
| A task note's frontmatter: status, done, scheduled, start, due, points | `fileManager.processFrontMatter`, in `setNoteStatus`, `planNote`, `dueNote` and `pointsNote` ([writes.ts](../src/obsidian/writes.ts), lines 73, 120, 129 and 147) | The note must still exist. There is no line check: the change is applied to the frontmatter as it is when Obsidian writes it. A points write is refused unless the note is a story (a non-repeating task note in a project); an area task note, a repeating note and a task line are refused before any write |
| The layout: `arrange`, `schedule`, `waiting` | Bases' `config.set`, which Bases writes into the dashboard note's `base` block ([view.ts](../src/obsidian/view.ts), lines 115, 131 and 152; `schedule` and `waiting` take only fixed words) | Only where Bases can write the block back. In an embed, a hover or a canvas, nothing is saved ([edits.ts](../src/obsidian/edits.ts), `arrangementPersists`) |
| Opening a note | `openFile` | None. It writes nothing |

**Undo** writes through the same three places, and checks each restore again: a line only if it is still the text Ninja Board wrote, a field only if it still holds the value Ninja Board wrote, and a saved layout only if the view still holds what Ninja Board saved. A step that fails a check is skipped with the Notice "Changed since: not undone", and nothing is written for it.

Other guards:

- **Tasks' answer.** When you tick a line, Ninja Board asks Tasks for the new line and writes it only if the answer is not empty, every line of it is a task line, and it does what the tick was for: a completing tick needs a done line, and a reopening tick needs none ([edits.ts](../src/obsidian/edits.ts), `isUsableToggle`, line 32; [writes.ts](../src/obsidian/writes.ts), `doesTick`, line 51). Otherwise the line stays as it is, and the Notice "Tasks gave an answer Ninja Board can't use" shows.
- **A stale click on a note.** Ticking a task note acts on the state you saw, not the state in the file. A second click on an old row therefore can't undo the first ([writes.ts](../src/obsidian/writes.ts), `toggleNoteStatus`).
- **Failed writes.** Each write is wrapped. A failure shows the Notice "Ninja Board couldn't save that change" and is logged, and it never reaches Obsidian as an unhandled error ([obsidian/actions.ts](../src/obsidian/actions.ts), `saved`).

The plugin never deletes, trashes, renames or creates a file. A build of the current source contains none of `vault.delete`, `vault.trash`, `trashFile`, `adapter.`, `renameSync` or `unlink`.

## Network

- The plugin makes no network request. A fresh build of the current source contains no `fetch(`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`. Its only `require` is `obsidian`, which Obsidian supplies at runtime.
- The browser preview fetches two local files from its own server: `sample.json` and `../design/mockup.html` ([preview.ts](../preview/preview.ts), lines 58 and 167). The preview is not part of `main.js`.
- The one network step in the project is `npm install`, which fetches the development dependencies from the npm registry. That is a developer step. Ninja Board doesn't do it.
- Obsidian's own sync, and other plugins in the same vault, are outside this page.

## How the screen is built

- **`h()` builds every element.** It uses `document.createElement`, sets attributes with `setAttribute`, and appends children as nodes or as strings. A string becomes a text node ([dom.ts](../src/ui/dom.ts), line 6). `svg()` uses `createElementNS` (line 21). `link()` sets `href="#"` and stops the navigation (line 33).
- **No HTML from strings.** There is no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` in any production file, and none in a fresh build. The `innerHTML` and `outerHTML` in `src/` are in test files, which read the output.
- **No Markdown rendering.** Ninja Board doesn't use Obsidian's `MarkdownRenderer` or `setHTML`. A note's text, which can contain markup, never becomes HTML.
- **Note text in attributes.** An appointment's `title` and `aria-label` hold its name and time, set with `setAttribute`, so markup in them is never parsed ([schedule.ts](../src/ui/schedule.ts), lines 146 and 147). Ninja Board sets no `on…` attribute and no `href` from note text.
- **Numbers only in styles.** Run-time styles take positions and sizes computed from times and counts, set through `setCssProps` or `setCssStyles` ([schedule.ts](../src/ui/schedule.ts), lines 83 to 95; [popover.ts](../src/ui/popover.ts), lines 123 to 132).

## The sandbox script

[sandbox.mjs](../scripts/sandbox.mjs) installs Ninja Board into the sandbox vault and can reset that vault's notes. It never deletes.

- It stops before any change if the vault has no `.obsidian` folder (line 19).
- With `--yes`, it renames each item in the vault's top folder whose name doesn't start with a dot into `~/.Trash/brain-sandbox-<stamp>/` (line 53). It creates that folder without `recursive`, so a second run in the same second fails rather than overwriting (line 52). Then it copies `sample-vault/` in (line 35).
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
- To reach Tasks, Ninja Board reads `app.plugins.plugins['obsidian-tasks-plugin']` through a type cast ([edits.ts](../src/obsidian/edits.ts), line 18). Obsidian's typings don't declare `app.plugins`, so an Obsidian update could change it. If that happens, `tasksApi` returns nothing and ticking stops with the Notice "Ninja Board needs the Tasks plugin to tick tasks". Nothing is written in that case.

## Privacy

- The plugin sends nothing anywhere. It has no telemetry and no remote calls.
- Vault content goes to a model provider only when an agent tool reads it. The implementation spec's Privacy paragraph names the providers for each tool ([section 1](https://alexsendula.github.io/second-brain/implementation/)). Ninja Board is not an agent tool.

## Dependencies

- **Runtime:** none. The plugin's only import from outside its own code is `obsidian`. A fresh build contains no `linkedom`, `yaml` or Node module.
- **Development:** esbuild, typescript, the obsidian type declarations, linkedom, yaml and @types/node, pinned in [package-lock.json](../package-lock.json). They run on the developer's machine only.
- The repository runs no automated dependency audit. Its only workflow is the release workflow, which runs when a tag is pushed.

## Related Documentation

- [Database](DATABASE.md): what Ninja Board reads and writes, field by field
- [Deployment](DEPLOYMENT.md): building, installing and the sandbox reset
- [Troubleshooting](TROUBLESHOOTING.md): the Notices, and what each one means
