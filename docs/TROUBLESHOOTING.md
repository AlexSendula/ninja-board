# Troubleshooting

> Last updated: 16 October 2026

## Where to look

- **Notices.** Ninja Board's messages appear as Obsidian notices. The table below has every one, with its exact text, from the code.
- **The console.** Errors that Ninja Board catches are logged with `console.error`, and the notice says only that something failed. Open Obsidian's developer tools (Cmd+Option+I on macOS) and read the Console.
- **The Guide.** The Guide's **Setup** tile, in `01 Dashboard/05 Guide.md`, shows the Tasks setup check. It's the first place to look when Tasks is involved.

## Notices

| Notice (exact text) | When it shows | What to do |
|---|---|---|
| Ninja Board needs the Bases core plugin. Turn on Bases, then reload Ninja Board. | At startup, when Ninja Board can't register its views. The code reads any failed registration as Bases being off ([main.ts](../src/main.ts), line 30) | Settings → Core plugins → turn on Bases, then reload Obsidian |
| Ninja Board can't find 01 Dashboard/01 Today.md | The **Open Today** command, when that note is missing ([main.ts](../src/main.ts), line 40) | Put the note back at that path. The path is fixed in the code |
| Ninja Board can't find 01 Dashboard/05 Guide.md | The **Open guide** command, when that note is missing ([src/obsidian/guide.ts](../src/obsidian/guide.ts), line 11) | Put the note back at that path |
| Ninja Board needs the Tasks plugin to tick tasks | Ticking a line, or setting a line to done from a card, when Tasks has no toggle API: Tasks is off, missing or too old ([writes.ts](../src/obsidian/writes.ts), line 29) | Turn on Tasks, and update it |
| Tasks gave an answer Ninja Board can't use | Tasks returned an empty answer, one that isn't a task line, or one that doesn't do what the tick was for: a completing tick with no done line, or a reopening tick that still has one. Nothing is written ([writes.ts](../src/obsidian/writes.ts), line 39) | Try again. Check that Tasks is up to date and its Task Format is Dataview |
| That task changed — refreshed | The line in the note is no longer the one Ninja Board drew. Nothing is written ([writes.ts](../src/obsidian/writes.ts), line 96) | See [That task changed](#that-task-changed) |
| Ninja Board couldn't save that change | A state, plan, deadline or status write failed or threw ([src/obsidian/actions.ts](../src/obsidian/actions.ts), line 71) | Nothing changed. Read the error in the console |
| Ninja Board couldn't open that note | Opening a note threw an error ([src/obsidian/actions.ts](../src/obsidian/actions.ts), line 33) | Read the error in the console. Check the note still exists |
| Open the dashboard note itself to arrange this board | A board is dragged or rearranged in an embed, a hover preview or a canvas ([view.ts](../src/obsidian/view.ts), line 108) | Open the dashboard note itself. See [Arranging outside the note](#arranging-outside-the-note) |
| Couldn't save the arrangement | Bases refused to save the layout ([view.ts](../src/obsidian/view.ts), line 115) | Read the console. The board is drawn again from what was saved before |
| Open the dashboard note itself to keep the Schedule view | The Schedule's view is switched in an embed, a hover preview or a canvas ([view.ts](../src/obsidian/view.ts), line 136) | Open the dashboard note itself. Until then the choice lasts for this session |
| Couldn't save the Schedule view | Bases refused to save `schedule:` ([view.ts](../src/obsidian/view.ts), line 132) | Read the console. The choice lasts for this session |
| Ninja Board can't complete this repeating note: its repeat or its due date isn't one Ninja Board knows | A tick on a repeating note, or a drop on Done, when its `repeat` is not one of the forms Ninja Board reads, or its `due` is missing or not a date ([writes.ts](../src/obsidian/writes.ts), line 98) | Fix the `repeat` (for example `every 6 months`) or the `due` (`YYYY-MM-DD`) in the note's frontmatter. Nothing was changed |
| Changed since: not undone | Undo found that the note, or the saved layout, changed since Ninja Board's step. The step is dropped and nothing is written for it ([undo.ts](../src/obsidian/undo.ts), line 31) | Look at the row again: it is drawn from the note as it now is. A tick that Tasks answered with a recurrence can't be undone, and shows this Notice too. Press Undo again for the step before |

## The views

### The views don't show, or Ninja Board isn't in the view picker

1. Turn on the **Bases** core plugin, and reload Obsidian. If Ninja Board has no views at all, the notice at startup says so.
2. Check the dashboard note's `base` block. Its `views` entry needs a `type` that is one of `ninja-board-today`, `ninja-board-week`, `ninja-board-projects`, `ninja-board-backlog` or `ninja-board-guide`. Any other `type` isn't a Ninja Board view. The keys are in [Database](DATABASE.md#dashboard-notes).
3. Check the `filters`. Bases decides which notes Ninja Board draws. A note under `10 Archive/` never appears, whatever the filter says.

### A task or a card is missing

- **The note's type.** Task lines count only in project, area and task notes. A line in an inbox note, an appointment or a week plan is never drawn as a task ([Database](DATABASE.md#note-types)).
- **The project's status.** On the Week board, a project's lines show only while it is `active`. Its story cards show in the same way.
- **Not yet indexed.** Task lines come from the metadata cache. A note the cache hasn't read shows no tasks until the cache catches up, and the view draws again then ([view.ts](../src/obsidian/view.ts), `onload`).
- **A note can't be read.** One note that Obsidian can't read (locked, evicted or removed) shows no tasks. Its error is logged to the console, and the other notes still show theirs. Read the console for that note's path.
- **Not a task.** A `- [ ]` inside a code block or an HTML comment is not a task. A bullet with no checkbox is not a task either.
- **Archive.** Notes under `10 Archive/` never show.
- **A repeating note's Done row.** A completed occurrence comes from a line in the note's `## Log` section, in exactly the form `- <day> Done: the occurrence due <date>. Next due <date>.`, dated in the shown week. A line typed in another form is not read ([Database](DATABASE.md#repeating-task-notes)).

### Dates are missing from a task

- Ninja Board reads only the Dataview fields: `[due:: …]`, `[scheduled:: …]`, `[start:: …]`, `[completion:: …]` and `[cancelled:: …]`, or the same in parentheses. A date written in another format (such as an emoji marker) is not read.
- Set Tasks' **Task Format** to **Dataview**. The Guide's Setup tile says so until you do. Lines that already hold another format keep it; Ninja Board doesn't convert them.
- An invalid date, such as `2026-02-30`, is ignored.

### Arranging outside the note

A board's order and the Schedule's view are saved only in the dashboard note. In an embed (`![[Week]]`), a hover preview or a canvas, Ninja Board can't save them. The state change still happens: a row still moves to the other column and its task changes state, but the new order isn't kept.

To arrange or change the Schedule view, open the dashboard note itself (`01 Dashboard/02 Week.md`, `01 Dashboard/03 Projects.md` or `01 Dashboard/01 Today.md`), in Reading view or Live Preview. Bases can write the block back only there, or in a `.base` file ([user guide](USER_GUIDE.md#arranging)).

## Ticking and editing

### Ticking does nothing

Work down this list:

1. **A notice.** The table above says what each one means.
2. **No notice, but the line shows done with no completion date.** The likely causes are that Task Format is not Dataview, or that Set done date on every completed task is off. With another format, Tasks wrote its own format, which Ninja Board doesn't read; with the setting off, it wrote no done date. The Guide's Setup tile shows either one as **To fix**. Set Task Format to Dataview, and turn on Set done date on every completed task.
3. **A repeating note stays open after a tick.** The tick completes this occurrence, not the whole task: the note moves to its next due date, and the occurrence is written to its `## Log` section. Undo takes it back while the note is as Ninja Board left it. A repeating note's Done row has no tick.
4. **Ticking a task note needs no Tasks plugin.** Only ticking a task *line* does, and so does setting a line to done from a card. Setting a line to doing, waiting or dropped, or reopening it, doesn't need Tasks.

### That task changed

Ninja Board writes a line only when it is still the line it drew. If the note changed in between, for instance in the editor or by the agent, Ninja Board writes nothing and shows "That task changed — refreshed". There is nothing to repair. Look at the row again: the view draws again when the note's cache changes. If the row still shows the old state, close and reopen the dashboard note, then act on it again if you still want to.

### Undo skipped a step, or does nothing

Undo restores a step only where the note or the saved layout still holds what Ninja Board wrote. If you or the agent changed it since, the step is skipped with "Changed since: not undone", and the next press undoes the step before it. Undo's history lasts for the Obsidian session only, so after a reload there is nothing to undo. For older changes use Obsidian's File recovery, or the vault's git history where it has one. A completion's Log line is part of its step: if the note's `## Log` changed since, the step is skipped with the same Notice.

### A deadline or a day disappeared after a plan

This is the planning rule, not a fault. A plan to a day or week later than the deadline's week removes the deadline. A plan to no date removes a deadline that is this week or overdue. A plan in the same week as the deadline, or earlier, keeps it. A repeating task note keeps its deadline whatever the plan. The rule is in the spec's **Edits** table ([implementation spec, section 2](https://alexsendula.github.io/second-brain/implementation/#2-reference-format)). Set the deadline again if you want it back.

### Waiting

Ninja Board reads `[w]` as waiting even before the Waiting status exists in Tasks. The Guide's Setup tile then shows the Waiting line as **To fix**. Add the status ([Environment](ENVIRONMENT.md#obsidian-and-plugins)).

## The Guide's Setup tile

The Setup tile checks four things in the Tasks plugin. Each line shows one of three states: ticked (OK), **To fix**, or **Can't check**. A ticked line also says "OK" to a screen reader ([model/guide.ts](../src/model/guide.ts), `buildGuide`; [ui/guide.ts](../src/ui/guide.ts), `setupRow`).

| Line | Ticked (OK) | To fix | Where to look |
|---|---|---|---|
| Tasks | Tasks plugin on | Turn on the Tasks plugin | Settings, Community plugins |
| Format | Task Format is Dataview | Set Task Format to **Dataview** | Tasks settings, Task Format |
| Done date | Tasks sets the done date | Turn on Set done date on every completed task | Tasks settings |
| Waiting | Waiting status: symbol w, type ON_HOLD | Add a Waiting status: symbol w, type ON_HOLD | Tasks settings, Task Statuses |

- **The Waiting line checks two things only:** a custom status with symbol `w` and type `ON_HOLD`. It doesn't read the status's name or its next status symbol. Ticking a waiting line goes through Tasks, which moves it to that next symbol. With any other symbol the tick is refused with the Notice "Tasks gave an answer Ninja Board can't use", and nothing is written. Set the next symbol to `x` yourself.
- **Can't check** appears on the Format, Done date and Waiting lines when Tasks is off, when it's on but not loaded yet, or when its saved settings can't be read. Ninja Board can't tell, so it doesn't say the setting is wrong. The Tasks line is ticked when Tasks is on, even if its settings are unknown.
- **Tasks never saved its settings.** A Tasks install whose settings were never changed has nothing saved. Tasks then runs on its own defaults: the Format and the Waiting lines show **To fix**, and the Done date line shows OK, since Tasks sets the done date by default.
- **The Guide at launch.** A Guide that opens as Obsidian starts can show **Can't check** until Tasks has loaded.
- **Changes don't show at once.** The Guide reads Tasks' settings each time it draws, and doesn't watch for changes. After you change Tasks, close and reopen `05 Guide.md`.

The Setup check is read-only. It changes no setting.

## Styles look wrong

- **Reload Obsidian** after copying `styles.css`. The [deployment steps](DEPLOYMENT.md#install-into-a-vault) say the same.
- **Compare with the preview.** Run `npm run preview` and look at the same view there. If the preview is right, the problem is in the vault: a theme, a CSS snippet, or the width of the pane.
- **Themes.** Ninja Board's colours and fonts come from Obsidian's own CSS variables, such as `--text-normal` and `--background-primary`. A theme that changes those changes Ninja Board. The root tokens are at the top of [styles.css](../styles.css).
- **Snippets.** Ninja Board's rules are scoped under `.brain-view`, and a reset inside the view stops a note's own styles for headings, paragraphs and lists from leaking in. A CSS snippet with a more specific rule can still win.
- **Width is by design.** The layout follows the width of the view, not the window. Under 560px the view is one column, and the Schedule becomes a plain list with no view switch. From 560px the grid has two columns, and from 880px three ([styles.css](../styles.css), the `@container brain` rules).

## Preview

Run the preview from the repository root with `npm run preview`, then open **http://localhost:8766/preview/**. The page lives under `/preview/`, with the trailing slash. The root address returns 404: the server does not list folders.

- **"sample.json: HTTP 404. Start the preview with npm run preview."** The server isn't running, or it was started from another folder. Start it from the repository root. The message is in [preview.ts](../preview/preview.ts), line 58.
- **The server doesn't start.** The three steps of `npm run preview` run one after another with `&&`, so an error in the sample step or the build stops before the server starts. When the build works but the server still doesn't start, the usual cause is that port 8766 is taken. The server then stops with "Port 8766 is already in use." Find what holds the port with `lsof -nP -iTCP:8766 -sTCP:LISTEN`, and stop that process.
- **403 Forbidden.** The server answers only to `localhost:8766` and `127.0.0.1:8766`, so a page opened under another name, such as a LAN address, gets 403. Open one of those two addresses.
- **Opening a note does nothing but show a line of text.** That is the preview. It shows "Opens …" in place of opening the note in Obsidian.
- **A change disappears on reload.** The preview's edits are in memory. A reload brings the sample back.

## The sandbox script

- **"is not an Obsidian vault: it has no .obsidian folder."** `BRAIN_VAULT` points at the wrong folder. Nothing has changed. Set `BRAIN_VAULT` to the sandbox vault ([sandbox.mjs](../scripts/sandbox.mjs), line 19).
- **"Notes unchanged. To replace them with the sample notes, run: npm run sandbox -- --yes."** That's the normal first run. It lists the notes a reset would move, and moves nothing.
- **The script stops with an error during the reset.** The reset moves notes by renaming them into `~/.Trash`. A rename can't cross drives. If the vault is on another drive, the first rename fails, so no note moves and the sample isn't copied. An empty `brain-sandbox-…` folder stays in `~/.Trash`. I haven't run the reset on a vault on another drive, so this is from the code, not from a test.
- **Ninja Board isn't listed under Community plugins after a reset.** Turn on community plugins, then reload with Cmd+R. The script's next steps say the same.

## Installed, but Ninja Board won't turn on

- The three files must be in `<vault>/.obsidian/plugins/ninja-board/`: `main.js`, `manifest.json` and `styles.css`. Build first, with `npm run build`, then copy ([Deployment](DEPLOYMENT.md#install-into-a-vault)).
- `manifest.json` must have `"id": "ninja-board"`. That id is also the folder name Obsidian uses under `.obsidian/plugins/`.
- Community plugins must be turned on in Obsidian's settings before Ninja Board can be enabled.

## Related Documentation

- [Database](DATABASE.md): what each field and mark means
- [Security](SECURITY.md): what Ninja Board writes, and the checks before it writes
- [Deployment](DEPLOYMENT.md): building, installing and the checks before a build goes out
