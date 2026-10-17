// The pure half of the writes. Nothing here imports 'obsidian' at runtime (that package ships
// types only), so Node's test runner can load this file.
import type { PlanTo, TasksSetup, TaskState } from '../model/types.ts';
import { BRACKET_VALUE, parseTaskLine, symbolOf, withField, withSymbol } from '../model/taskLine.ts';
import { toISO } from '../model/dates.ts';
import { planDropsDue } from '../model/plan.ts';

export { applyNoteDue, applyNotePlan } from '../model/plan.ts';
export { applyNotePoints } from '../model/points.ts';

/** The part of the Tasks plugin's apiV1 that Brain uses. */
export interface TasksApi {
  executeToggleTaskDoneCommand(line: string, path: string): string;
}

const TASKS_ID = 'obsidian-tasks-plugin';

/** The parts of a loaded plugin that Brain reads: Tasks' API, and its saved settings through Plugin.loadData. */
interface LoadedPlugin { apiV1?: TasksApi; loadData?: () => Promise<unknown> }

// app.plugins: the loaded plugins by id, and enabledPlugins: the ones turned on, loaded or not (at launch, plugins load one
// after another).
interface WithPlugins {
  plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, LoadedPlugin | undefined> };
}

/** The Tasks API, or undefined when Tasks is missing, disabled, or too old to have the toggle command. */
export function tasksApi(app: object): TasksApi | undefined {
  const api = (app as WithPlugins).plugins?.plugins?.[TASKS_ID]?.apiV1;
  return typeof api?.executeToggleTaskDoneCommand === 'function' ? api : undefined;
}

/**
 * Whether what Tasks returned is safe to write over a task line: a non-empty string of which
 * every line is a task line. Anything else (an empty string, undefined, a half answer) would
 * blank or garble the line it replaces.
 */
export function isUsableToggle(result: unknown, path: string, line: number): result is string {
  if (typeof result !== 'string' || result === '') return false;
  return result.split(/\r?\n/).every((l) => parseTaskLine(l, path, line) !== null);
}

/**
 * `content` with line `line` replaced, or null when that line is missing or no longer equals
 * `expected`. The line keeps its own ending, and a two-line replacement (a Tasks recurrence)
 * is joined with the file's line ending.
 */
export function replaceLineIfUnchanged(content: string, line: number, expected: string, replacement: string): string | null {
  const lines = content.split('\n');
  const current = lines[line];
  if (current === undefined) return null;
  const cr = current.endsWith('\r') ? '\r' : '';
  if ((cr ? current.slice(0, -1) : current) !== expected) return null;
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  lines[line] = replacement.split(/\r?\n/).join(eol) + cr;
  return lines.join('\n');
}

// A completion or cancelled field, in [ ] or ( ). removeFields takes the whitespace before it.
const DONE_FIELD_RE = new RegExp(`\\[(?:completion|cancelled)::${BRACKET_VALUE}\\]|\\((?:completion|cancelled)::[^)(]*\\)`, 'g');

/**
 * `text` with each match of `field` removed when `drop` says so, and the whitespace right before a removed match with it.
 * `field` is global and starts with no whitespace. Not a regex with the whitespace in it: without a lookbehind (iOS before
 * 16.4 has none) that tries a match at each space of a run, a quadratic time over a long run. Here each gap is trimmed once.
 */
function removeFields(text: string, field: RegExp, drop: (m: RegExpMatchArray) => boolean): string {
  let out = '';
  let from = 0;
  for (const m of text.matchAll(field)) {
    const at = m.index;
    const gap = text.slice(from, at);
    out += drop(m) ? gap.trimEnd() : gap + m[0];
    from = at + m[0].length;
  }
  return out + text.slice(from);
}

/**
 * The line set by hand to any state but done (done goes through Tasks). Reopening a line
 * clears its completion and cancelled dates; dropping it stamps a cancelled date.
 */
export function lineWithState(raw: string, state: Exclude<TaskState, 'done'>, today: string): string {
  const line = removeFields(withSymbol(raw, symbolOf(state)), DONE_FIELD_RE, always);
  return state === 'dropped' ? withField(line, 'cancelled', today) : line;
}

/**
 * A task note's or project's frontmatter after a state change. Finishing or dropping stamps `done`
 * with today, unless it already has a date; any other state removes it. Other fields stay.
 */
export function applyNoteStatus(fm: Record<string, unknown>, status: string, today: string): void {
  fm.status = status;
  if (status === 'done' || status === 'dropped') fm.done ??= today;
  else delete fm.done;
}

/** A date field, in [ ] or ( ). Its value is in group 1 or 2. */
function dateFieldRe(key: string): RegExp {
  return new RegExp(`\\[${key}::(${BRACKET_VALUE})\\]|\\(${key}::([^)(]*)\\)`, 'g');
}

const always = (): boolean => true;

/** `raw` without the `key` fields whose date `drop` accepts. `drop` gets the date as ISO, or undefined when the value is not one. */
function withoutField(raw: string, key: 'due' | 'scheduled' | 'start', drop: (iso: string | undefined) => boolean): string {
  return removeFields(raw, dateFieldRe(key), (m) => drop(toISO((m[1] ?? m[2] ?? '').trim())));
}

/**
 * A task line planned for `to`: a day sets `scheduled` and removes any `start`; a week sets `start`
 * and removes any `scheduled`; no date yet removes both. A `due` the plan leaves behind goes too (see
 * planDropsDue; `today` is for no date yet). The text, the tags and a trailing block id are untouched.
 * A line that isn't a task comes back unchanged.
 */
export function lineWithPlan(raw: string, to: PlanTo, today: string): string {
  if (parseTaskLine(raw, '', 0) === null) return raw;
  const line = withoutField(raw, 'due', (iso) => planDropsDue(iso, to, today));
  if (to === null) return withoutField(withoutField(line, 'scheduled', always), 'start', always);
  if ('day' in to) return withoutField(withField(line, 'scheduled', to.day), 'start', always);
  return withoutField(withField(line, 'start', to.week), 'scheduled', always);
}

/**
 * A task line with its deadline set to `date` (its `due` set or replaced, and a `scheduled` on that
 * same day removed), or with the deadline removed (`null`). The planned day and the rest of the line
 * stay. A line that isn't a task comes back unchanged.
 */
export function lineWithDue(raw: string, date: string | null): string {
  if (parseTaskLine(raw, '', 0) === null) return raw;
  if (date === null) return withoutField(raw, 'due', always);
  return withoutField(withField(raw, 'due', date), 'scheduled', (iso) => iso === date);
}

/**
 * Whether Bases can save the view's config (an arrangement) from where it is drawn. In an embed
 * (`![[Week]]`), a hover popover or a canvas node, the base block has no section to write back to,
 * so `config.set` would change it in memory only, until the next render.
 */
export function arrangementPersists(container: Element): boolean {
  return container.closest('.markdown-embed, .hover-popover, .canvas-node') === null;
}

/**
 * What the Guide's setup check can know of the Tasks plugin. Obsidian keeps only loaded plugins in app.plugins.plugins, so no
 * entry means Tasks is off, unless it is enabled and just not loaded yet (a Guide open at launch): then it is on, and its
 * settings are not read yet. Tasks keeps its live settings to itself; the public way in is its saved data.json, through
 * Plugin.loadData: null when never saved (its defaults apply). Every failure ends in "Can't check": a plugin list that can't be
 * read gives no `on`, and saved settings that can't be read give no `settings`.
 */
export async function readTasksSetup(app: object): Promise<TasksSetup> {
  let tasks: LoadedPlugin | undefined;
  try {
    const plugins = (app as WithPlugins).plugins;
    tasks = plugins?.plugins?.[TASKS_ID];
    if (!tasks) {
      const enabled = plugins?.enabledPlugins;
      return typeof enabled?.has === 'function' ? { on: enabled.has(TASKS_ID) } : {};
    }
  } catch {
    return {};
  }
  if (typeof tasks.loadData !== 'function') return { on: true };
  try {
    return { on: true, settings: await tasks.loadData() };
  } catch {
    return { on: true };
  }
}
