# Style guide

> Last updated: 16 October 2026 (Ninja Board 1.0.0)

These are the conventions the Ninja Board code already follows. Match them when you add code.

**There is no linter or formatter.** The repository has no ESLint, Prettier, Biome or `.editorconfig` config, and `package.json` has no lint script. Consistency comes from three things: the strict TypeScript compiler (`npm run typecheck`), the tests (`npm test`), and review against this guide.

## General principles

1. **Pure where it can be.** The model takes data and returns data. It reads no clock and no DOM, and it does not import `obsidian`. The caller passes `today` and the time of day.
2. **Say what a file is.** Each module starts with a short `//` comment naming what it is, and often what it must not do. For example, [`src/obsidian/edits.ts`](../src/obsidian/edits.ts): "The pure half of the writes. Nothing here imports 'obsidian' at runtime (that package ships types only), so Node's test runner can load this file."
3. **Explicit over clever.** The code names each step (`planDropsDue`, `applyNoteStatus`) rather than folding rules together.

## Formatting

- **Indent with two spaces.** There are no tabs in `src`, `test` or `preview`.
- **Quotes.** Single quotes for strings. A string that contains an apostrophe uses double quotes, as in `"Tasks gave an answer Ninja Board can't use"` in [`writes.ts`](../src/obsidian/writes.ts). Most do; two lines escape the apostrophe with `\'` instead.
- **Semicolons** end every statement.
- **Trailing commas** in multi-line lists and parameter lists. See `h()` in [`src/ui/dom.ts`](../src/ui/dom.ts).
- **Spaces inside object braces**: `{ kind: 'line', path, line }`.
- **Line length** has no fixed limit. Hundreds of lines run past 120 characters, so wrap for reading, not at a column.
- **Long calls** wrap one argument per line, with the closing parenthesis on its own line. See `renderWeek(` in [`src/obsidian/view.ts`](../src/obsidian/view.ts).

## Naming

| Kind | Convention | Examples |
|---|---|---|
| Module files | camelCase | `taskLine.ts`, `src/ui/listModal.ts`, `memoryWrites.ts` |
| Test files | The module's name plus `.test.ts`, beside the module in `src/`. Cross-layer tests in `test/` name what they cover. | `src/model/plan.test.ts`, `edit-cases.test.ts`, `styles.test.ts` |
| Data and scripts | kebab-case data; `.mjs` scripts | `edit-cases.json`, `sample-json.mjs`, `sandbox.mjs` |
| Functions | camelCase, usually starting with a verb | `buildToday`, `renderWeek`, `pickDay`, `readArrangement` |
| Types and interfaces | PascalCase | `RowTarget`, `ListSpec`, `TaskState` |
| View models | a `VM` suffix | `RowVM`, `ProjectCardVM`, `GroupVM` |
| Module constants | UPPER_SNAKE_CASE | `TODAY_NOTE`, `SVG_NS`, `ARCHIVE` |
| CSS classes | `brain-` plus kebab-case | `brain-tile`, `brain-col-items` |
| CSS state classes | `brain-is-` plus the state | `brain-is-drop`, `brain-is-late` |
| DOM attributes | `data-` plus kebab-case | `data-when="due"`, `data-column`, `data-key` |

**Function prefixes carry the meaning.** The code uses these, and new functions should too:

- `build*` (model): computes a view's model from the snapshot. `buildToday`, `buildWeek`.
- `render*` (UI): draws a view model into an element. `renderToday`.
- `lineWith*`: returns a task line with one change. `lineWithState`, `lineWithPlan`, `lineWithDue`.
- `apply*`: changes a frontmatter object in place. `applyNoteStatus`, `applyNotePlan`.
- `read*`: turns an unknown value (from the base block, or a file) into a typed one. `readArrangement`, `readScheduleView`.
- `pick*`: the planner card's choice, returned as edits. `pickDay`, `pickWeek`, `pickNoDate`.
- Predicates start with `is` or `has`: `isUsableToggle`, `hasPlan`.

**Words.** In code, the fields are `scheduled` (a planned day), `start` (a planned week) and `due` (a deadline). The UI and the README say "planned" and "deadline", as in "Planned Wed" and "Due Thu". The five states are `todo`, `doing`, `waiting`, `done` and `dropped`. The UI shows them as To do, Doing, Waiting, Done and Dropped. Keep to these words in new UI text.

## TypeScript

- **Strict mode.** `tsconfig.json` sets `strict`. Do not loosen it.
- **No `any`.** None in `src`, `test` or `preview`. Take outside values as `unknown` and narrow them. `readArrangement(v: unknown)` does this. In [`writes.ts`](../src/obsidian/writes.ts), Tasks' answer is `const result: unknown`, and the type guard `isUsableToggle` in [`edits.ts`](../src/obsidian/edits.ts) narrows it before use.
- **Relative imports end in `.ts`.** This is required by `allowImportingTsExtensions` and by Node's type stripping. Node built-ins take the `node:` prefix.
- **Type-only imports use `import type`.** `verbatimModuleSyntax` requires it, and well over a hundred import lines use it. For example, from [`src/ui/actions.ts`](../src/ui/actions.ts):

  ```ts
  import type { Arrangement, EventVM, GroupVM, PlanTo, ProjectCardVM, RowTarget, RowVM, ScheduleView, TaskState } from '../model/types.ts';
  import type { DropTarget } from './drag.ts';
  ```

- **Erasable syntax only.** No `enum`, no `namespace`, no constructor parameter properties (`erasableSyntaxOnly`). Use a union of string literals instead of an enum: `export type TaskState = 'todo' | 'doing' | 'waiting' | 'done' | 'dropped';`.
- **Interfaces for contracts, type aliases for unions.** The code uses `interface` for object shapes and contracts (`Actions`, `ListSpec`, `DaySpec`, `TasksApi`), and `type` for unions and computed shapes (`TaskState`, `PlanTo`, `ListKey`, `Child`).
- **Named exports.** The one default export is the plugin class in [`src/main.ts`](../src/main.ts), which Obsidian requires.
- **Dates are ISO strings.** `YYYY-MM-DD` in the model, never `Date` objects. A week is named by its Monday.
- **Missing values are `null` or `undefined`, not exceptions.** `parseTaskLine` returns `null` for a line that is not a task. The week-record parser never throws (round-2 spec §5).
- **Obsidian actions catch their own errors.** A failed write shows a Notice and is logged, and it never becomes an unhandled rejection. The views call the actions with `void`. See the header of [`src/obsidian/actions.ts`](../src/obsidian/actions.ts).

## Comments

- **`//`** for a short note. **`/** … */`** (JSDoc) above an exported function or interface, saying what it promises and what it returns when it has nothing to return. The `setState` entry in [`src/ui/actions.ts`](../src/ui/actions.ts) is a model: it says it resolves to the target as it now stands, or to `null` when no target stands for the task.
- **Comments give the reason, and name the decision.** Cite the spec section, as in "round-2 spec §5", or the decision, as in "decided 15 October 2026". Some older comments cite plan task numbers, such as "Task 15" in [`src/model/plan.ts`](../src/model/plan.ts). Prefer the spec section for new comments.
- **Section headers** in long files use a dashed rule: `// ---------- Console check: await checkView() ----------` in [`preview/preview.ts`](../preview/preview.ts), and `/* ---------- Tiles: 1 → 2 → 3 ---------- */` in [`styles.css`](../styles.css).
- Do not restate what the code does. Say why, or what the caller must do.

## CSS

- **Every rule is under `.brain-view`.** [`test/styles.test.ts`](../test/styles.test.ts) checks this. Three forms are allowed for elements that carry the class themselves or sit outside it:
  - `.brain-view.brain-popover` and `.brain-view.brain-modal-body`, for the planner card and the list modal's content;
  - `.brain-modal:has(> .brain-view)`, for the list modal's frame;
  - the note-context reset at the top of the file, `.brain-view.brain-view :where(…)`, which doubles the class so it beats Obsidian's note styles.
- **Colours come from Obsidian's variables only.** Use `var(--text-normal)`, `var(--text-muted)`, `var(--interactive-accent)`, `var(--background-primary)`, `var(--color-red)` and the like. No `#hex`, no `rgb()`, `hsl()` or other literal (tested).
- **New colours are `--brain-*` tokens on `.brain-view`.** The file declares its own tokens there, as mixes of Obsidian's variables, for example `--brain-danger: color-mix(in srgb, var(--color-red) 75%, var(--text-normal));`. There are no `:root` tokens. Add a colour as a token, and use the token in the rule.
- **Sizes and radii** use Obsidian's `--size-4-*`, `--font-ui-*` and `--radius-*` where they fit. Plain `px` is used for hairlines and hit targets, and those are tokens too (`--brain-hit: 28px`, `--brain-stroke: 1.75px`).
- **The mockup comes first.** `styles.css` is the mockup's `#brain-css` block, with the scoping above. Change the mockup, then copy the rule across. [`design/mockup.html`](../design/mockup.html) is the visual and DOM contract.
- **The preview's own page is not the plugin's CSS.** [`preview/index.html`](../preview/index.html) carries its own harness styles, with literal colours. They are outside the stylesheet test.

## Tests

- Test names are plain sentences that say the behaviour: `'toggle ticks a to-do line and stamps today as its completion'`.
- Use `assert` from `node:assert/strict`. Compare strings and counts for DOM output, not elements (see [Testing](./TESTING.md#known-pitfall-assertequal-on-linkedom-elements)).
- Each test fixes its own dates, through the `today` argument or the `TODAY` constant.

## Git

Commit subjects and bodies are in [Developer guide](./DEVELOPER.md#commits). This guide does not repeat them.
