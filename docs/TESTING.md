# Testing

> Last updated: 19 October 2026 (Ninja Board v1.1.0)

## Overview

From the repository root, `npm test` runs 1268 tests from 97 test files. All 1268 pass. That is the count on 19 October 2026, with Node v24.14.0, in a few seconds. The number changes as tests are added, so run `npm test` for the current count. To run one file, pass its path: `node --test src/model/plan.test.ts` (69 tests at the time of writing). A file that imports `obsidian` needs the hook the script loads first: `node --import ./test/obsidian-hook.mjs --test src/obsidian/writes.test.ts`.

`npm run typecheck` is separate, and it also covers the tests. It passed on 19 October 2026 too.

## The runner

- **Node's built-in test runner** (`node:test`) with `node:assert/strict`. There is no Jest or Vitest.
- **Node runs the `.ts` files directly**, stripping the types. So the code follows three rules: every relative import ends in `.ts`, type-only imports use `import type`, and there are no enums, namespaces or constructor parameter properties. The tsconfig enforces these with `allowImportingTsExtensions`, `verbatimModuleSyntax` and `erasableSyntaxOnly`. [`test/smoke.test.ts`](../test/smoke.test.ts) fails first if type stripping breaks.
- **The glob** is `node --test "src/**/*.test.ts" "test/**/*.test.ts"`. Only `*.test.ts` files run. Helpers such as [`test/ui.ts`](../test/ui.ts) and [`test/sample.ts`](../test/sample.ts) are imported by tests, never run as tests.
- **Types are checked separately**, by `npm run typecheck` (`tsc --noEmit`, strict).

## Where the tests live

| Where | What it tests | How |
|---|---|---|
| `src/model/*.test.ts` | Dates and ISO weeks, task lines, the views' models, planning rules, arrangements, the week record. | Plain `assert` on data. Each function takes `today` as an argument, so the tests fix the date. |
| `src/ui/*.test.ts` | The renderers, cards, drag, focus, the keyboard and the list modal. | linkedom DOM. See [The UI tests](#the-ui-tests-linkedom). |
| `src/obsidian/edits.test.ts` and `edit-cases.test.ts` | The edit rules in [`edits.ts`](../src/obsidian/edits.ts), and the shared examples in [`edit-cases.json`](../test/edit-cases.json). | Node only. `edits.ts` imports nothing from `obsidian` at run time. |
| `src/obsidian/snapshot.test.ts` | The snapshot builder, with a stand-in vault. A note that cannot be read shows no tasks, and the other notes still show theirs. | Node only. `src/obsidian/snapshot.ts` imports types from `obsidian`. |
| `src/obsidian/writes.test.ts` | The write path: the stale-line refusal, ticking through Tasks (including `[X]`, and an answer that does not match the tick, which writes nothing), recurrence, planning, deadlines and the frontmatter writes. | Node, with [`test/obsidian-stub.ts`](../test/obsidian-stub.ts) standing in for `obsidian`. |
| `src/obsidian/view.test.ts` | The view's draw, and the redraws for paging, arranging and the Schedule view, which draw at once while vault events stay debounced. | Node and linkedom, with the stub. |
| [`test/nodes.test.ts`](../test/nodes.test.ts) | The guard against `assert.equal` or `deepEqual` on a DOM node. See [Known pitfall](#known-pitfall-assertequal-on-linkedom-elements). | Reads the test sources. |
| [`test/preview.test.ts`](../test/preview.test.ts) | The preview's in-memory writes against the sample vault, and the token list that `checkView()` compares. | Node, with [`preview/memoryWrites.ts`](../preview/memoryWrites.ts). |
| [`test/previewModal.test.ts`](../test/previewModal.test.ts) | The preview's list and day modals: a carry, Escape, focus. | linkedom. |
| [`test/sample.test.ts`](../test/sample.test.ts) | The sample vault. It has 46 notes, and the JSON the preview loads builds the same snapshot. | Node. |
| [`test/styles.test.ts`](../test/styles.test.ts) | `styles.css` against the mockup. See [The stylesheet test](#the-stylesheet-test). | Reads the two files. |
| [`test/obsidianDom.test.ts`](../test/obsidianDom.test.ts) | The helpers the views call on every element, `setCssProps` and `setCssStyles`, on HTML and SVG elements. | linkedom, with [`preview/obsidian-dom.ts`](../preview/obsidian-dom.ts). |
| [`src/ui/host.test.ts`](../src/ui/host.test.ts) | The marks on the notes and embeds a view sits in, at any depth, and their removal when the view unloads. | linkedom. |
| [`test/sandbox.test.ts`](../test/sandbox.test.ts) | [`scripts/sandbox.mjs`](../scripts/sandbox.mjs), in temporary folders only. | Runs the script with a temporary HOME and vault. It also runs `npm run build`, which rewrites `main.js`. |
| [`test/smoke.test.ts`](../test/smoke.test.ts) | That the `.ts` sources load under type stripping. | Node. |

**What is not tested automatically.** The files in `src/obsidian/`, and `src/main.ts`, that import values from `obsidian` load under Node through [`test/obsidian-stub.ts`](../test/obsidian-stub.ts), which [`test/obsidian-hook.mjs`](../test/obsidian-hook.mjs) puts in place of the package. The stub holds only what the tested code uses at run time (`Notice`, `Modal`, `MarkdownView`, `Platform`, `Plugin`, `BasesView`, `debounce`, `normalizePath`, `parseYaml`, `stringifyYaml`, `TAbstractFile`, `TFile`, `TFolder`). `writes.ts` and `view.ts` have tests. `src/obsidian/actions.ts` has tests too. `main.ts` has a test of its registrations, in `src/main.test.ts`. The `ListModal` and `DayModal` classes and `src/obsidian/guide.ts` have none. Their logic runs through the pure parts they call, and through `preview/memoryWrites.ts` in the preview tests. Obsidian's own behaviour (Bases, Tasks' completion, the metadata cache) is checked by hand in the sandbox vault. The commits record this as "author's hand check". The browser preview and `checkView()` are checked by hand too. The agent's `brain` commands are not in this repository (see [Architecture](./ARCHITECTURE.md)).

## The sample vault is the test data

[`sample-vault/`](../sample-vault/) is the only sample data. The tests, the preview and the sandbox all use it. It has 46 notes: the five dashboard notes, the inbox, the projects, the areas, the people, and two week plans. `08 Weeks/2026/2026-W41.md` carries a week record, which the past-week view reads.

- [`test/sample.ts`](../test/sample.ts) reads it. `readSample()` returns the notes as `RawNote[]`, and `loadSample()` returns the snapshot the views receive.
- [`scripts/sample-json.mjs`](../scripts/sample-json.mjs) writes the same `RawNote[]` to `preview/sample.json`, which the preview loads.
- Today in the sample is 13 October 2026. The preview's clock is fixed at 11:10 (`NOW` in [`preview/preview.ts`](../preview/preview.ts)). Tests pass their own times.
- A case the sample does not need to show can be written inline, as a raw line or a frontmatter object. `edit-cases.json` does this. Add a note to the sample only when the preview or the sandbox should show it too.

## The parity contract: `test/edit-cases.json`

This file is the shared examples for every edit Ninja Board makes. The agent's `brain` commands, once built, are to be tested against the same cases, as the implementation spec's "Edits" section requires ([spec, section 2](https://alexsendula.github.io/second-brain/implementation/)). `src/obsidian/edit-cases.test.ts` runs each case against [`edits.ts`](../src/obsidian/edits.ts).

| Group | Cases | The edit under test | Function |
|---|---|---|---|
| `lines` | 12 | A state change on a task line | `lineWithState` |
| `notes` | 11 | A status in a note's frontmatter | `applyNoteStatus` |
| `plans` | 43 | Planning a task line: on a day, for a week, or no date yet | `lineWithPlan` |
| `notePlans` | 37 | Planning a task note | `applyNotePlan` |
| `dues` | 9 | A deadline on a task line | `lineWithDue` |
| `noteDues` | 4 | A deadline on a task note | `applyNoteDue` |
| `notePoints` | 9 | Setting or removing a story's points | `applyNotePoints` |
| `noteCompletes` | 14 | Completing a repeating task note: its next due date and its Log line, or a refusal | `applyNoteComplete` |

- The top-level `today` is 14 October 2026. Cases that depend on the day read it. A case in `plans` may carry its own `today`.
- A case has a `name`, its input (`raw` for a line, `before` for a note's frontmatter), then `to` or `date`, then `expect`. `to` is a state for `lines` and `notes`, and a plan for `plans` and `notePlans`: `{ "day": … }`, `{ "week": … }`, or `null` for no date yet. `date` is for the deadline groups, and `null` removes the deadline.
- The line case made by Tasks (`"by": "tasks"`) is not computed by Ninja Board, since Tasks writes that line when a task is ticked. The test reads the line Tasks wrote instead: done, with its completion date and its deadline. The agent's `brain complete` must write the same shape.
- **To change a rule, change its cases first.** Then make the code pass them.

## The UI tests (linkedom)

- [`test/ui.ts`](../test/ui.ts) makes a linkedom document and assigns it to `globalThis.document`. It also installs Obsidian's `createEl`, `setCssProps` and `setCssStyles` ([`preview/obsidian-dom.ts`](../preview/obsidian-dom.ts)), so the views draw as they do in Obsidian. The renderers use the global `document`, so a UI test imports `../../test/ui.ts` before any module that renders. The UI tests mark that import with the comment "first: it installs the DOM".
- `fire(el, type, fields)` dispatches a bubbling, cancelable event with extra fields such as `key`, `clientX` or `pointerType`. linkedom has no `KeyboardEvent` or `PointerEvent`.
- `recorder()` returns an `Actions` double and the calls it recorded. Its writes resolve as the plugin's do: a line comes back with its new raw text, and a note with its new state. A recorded state write is dated 13 October 2026 (`RECORDED_DAY`).
- `sampleLine(text)`, `sampleNote(name)` and `rowFor(text, vm)` give real sample lines and notes, and a `RowVM` built from them.

## Known pitfall: `assert.equal` on linkedom elements

**Do not pass linkedom elements to `assert.equal` or `deepEqual` as the things compared.** In a probe on 15 October 2026, a failing `assert.equal` between two `<ul>` elements, one holding 300 rows, was still running after 60 seconds, and the probe was killed. The cost falls on the failure path: a failing assertion builds its message from both values. A passing check of the same element is not what the probe measured.

Compare what you mean instead:

- the `textContent` of an element, as a string;
- an attribute, with `getAttribute`;
- a count, from `querySelectorAll(…).length`;
- a list of strings, built with `map`, then `deepEqual`.

The existing tests do this. See `src/ui/backlog.test.ts` (text and counts) and `src/ui/past.test.ts` (`texts(...)` maps the nodes to `textContent`).

For a node itself, [`test/ui.ts`](../test/ui.ts) has two helpers. `absent(el)` asserts that a lookup found nothing. `same(a, b)` asserts that two lookups give the same node, or both nothing. On failure both print the element, not a diff. [`test/nodes.test.ts`](../test/nodes.test.ts) fails when an `assert.equal` or `deepEqual` takes a DOM lookup as an operand. It checks one line at a time, so a lookup split over several lines can pass it.

## The stylesheet test

[`test/styles.test.ts`](../test/styles.test.ts) checks these things about [`styles.css`](../styles.css) and about the sources:

1. **It is the mockup's CSS.** `styles.css` equals the `<style id="brain-css">` block of [`design/mockup.html`](../design/mockup.html) once two differences are removed: the scoping, and the note-context reset. The scoping forms are `.brain-view ` (by descent) and `.brain-view.brain-` (the planner card and the list modal's content, which carry `.brain-view` themselves). The mockup's one-line reset is also taken out of the comparison.
2. **No colour literals.** The file must not contain `#hex`, `rgb(`, `rgba(`, `hsl(` or `hsla(`.
3. **Every selector is scoped.** It is under `.brain-view`, or it is a modal frame (`.brain-modal`, `.brain-day-modal`, or the carry's `.brain-carrying`), or it is keyed to a mark that [`src/ui/host.ts`](../src/ui/host.ts) sets on a note or an embed. The test insists on finding more than 100 selectors, so a broken parser cannot pass by finding none.
4. **The scope forms.** The descendant forms `.brain-view .brain-popover` and `.brain-view .brain-modal-body` must not appear. The modal frames are their own classes, with no `:has`.
5. **The modal layout.** The list and day modals lay their content out as a flex column, so the grid scrolls beneath the search field.
6. **Obsidian's review rules.** `styles.css` has no `:has`, `!important`, `clip-path`, multicolumn (`column-gap` included, even in grid and flex) or `display: contents`. The Undo button is hidden by `visibility`, never by `display`, so the head keeps its height.
7. **The sources.** No source writes an element style directly: a run-time value goes through `setCssProps` or `setCssStyles`, and a fixed one goes to a class. No shipped source uses a lookbehind, which iOS before 16.4 does not have.

A failing test prints the character where the two differ, with the text around it from each side.

## Checking the preview against the mockup

`checkView()` is a browser console function, and no test runs it. It is the manual check that the preview matches the mockup.

1. Run `npm run preview` and open `http://localhost:8766/preview/`.
2. In the console, run `await checkView()`, or `await checkView(selector)` to compare only the parts that match a selector.

It works like this ([`preview/preview.ts`](../preview/preview.ts), [`preview/tokens.ts`](../preview/tokens.ts)):

- It compares the page with the mockup's markup for the view on screen, token by token. Each element becomes its tag, its sorted classes and its `aria-label`. Each text node is trimmed. Labels are compared in lower case, since CSS upper-cases them. The mockup's `mock-*` classes, `<template>` elements and `[data-frozen]` nodes are ignored.
- It returns `{ dom, overflow }`. `dom` is `'same'` when everything matches. Otherwise it is the index of the first differing token, the token counts on each side, and the next six tokens on each side. `overflow` lists the elements that stick out past the right edge of `.brain-view`.
- With a selector, `dom` is `'nothing compared'` when neither side matches, so a typo cannot pass.
- Week compares against the mockup's state for the week the pager shows. The mockup draws weeks 42, 41, 40 and 43. A week it does not draw returns `'no mockup state'`.

**A difference is not always a code bug.** The sample follows the round-2 rules, and the mockup's numbers were drawn by hand. So Week 43 differs in the counts: To plan's "Still open this week" lists 6 rows, not 4; To plan has 15 items, not 14; No date has 7, not 8; and Backlog's No date has 7, not 3. These are recorded in the round-2 spec's as-built section ([spec, section 10](design/2026-10-14-brain-plugin-round-2-design.md)). Check the sample first.

## Counts

- **Tests:** 1268, from 97 files, all passing (19 October 2026).
- **Typecheck:** passes.
- **Sample notes:** 46. [`test/sample.test.ts`](../test/sample.test.ts) asserts this number, so adding a note means changing the test too.
- **Edit cases:** 139 across eight groups. The Tasks line case is read back, not computed.
