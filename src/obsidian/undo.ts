// The undo layer: what Ninja Board wrote, kept so Undo can put it back, and the restore itself. Every write is checked against the
// note or view as it is now, and a step goes back only when all of its writes are still as Ninja Board left them.
import { Notice, parseYaml } from 'obsidian';
import type { App } from 'obsidian';
import { History } from '../model/history.ts';
import { replaceLineIfUnchanged } from './edits.ts';
import { withoutLogEntry } from '../model/repeat.ts';

/** The view config a saved layout is written to: Bases' config, which holds `arrange`, `schedule` and `waiting`. */
export interface LayoutConfig {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

/** One write Brain made, with what it replaced. Undo checks `after` is still there before it puts `before` back. */
export type Write =
  | { kind: 'line'; path: string; line: number; before: string; after: string }
  | { kind: 'field'; path: string; key: string; before: unknown; after: unknown }   // before undefined: the key was absent
  | { kind: 'layout'; config: LayoutConfig; key: string; before: unknown; after: unknown }
  | { kind: 'log'; path: string; entry: string; made: boolean; tail: string }   // a repeating note's Log line (made: its section was made with it, and tail is the text added)
  | { kind: 'lost'; path: string };   // a write Undo can't put back: a Tasks recurrence, two lines for one

type LineWrite = Extract<Write, { kind: 'line' }>;
type FieldWrite = Extract<Write, { kind: 'field' }>;
type LayoutWrite = Extract<Write, { kind: 'layout' }>;
type LogWrite = Extract<Write, { kind: 'log' }>;
/** One note's writes in a step: its lines, its Log lines and its fields. */
interface NoteWrites { lines: LineWrite[]; logs: LogWrite[]; fields: FieldWrite[] }

/** Every Ninja Board step the session holds, shared by all the Ninja Board views. Cleared when Obsidian reloads. */
export const history = new History<Write>();

/** What Undo does when it is pressed: the newest step, put back when it still can be. */
export async function undoLast(app: App): Promise<void> {
  const result = await history.undo((writes) => restore(app, writes));
  if (result === 'changed') new Notice('Changed since: not undone');
}

/** The fields a change to a note's frontmatter wrote: each key whose value differs, with its value before and after. */
export function fieldWrites(path: string, before: Record<string, unknown>, after: Record<string, unknown>): Write[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const writes: Write[] = [];
  for (const key of keys) {
    if (same(before[key], after[key])) continue;
    writes.push({ kind: 'field', path, key, before: before[key], after: after[key] });
  }
  return writes;
}

/**
 * Puts a step's writes back, newest first, where each is still as Brain left it. Everything is checked before anything is
 * written, so one change leaves the whole step as it is. Resolves to whether the step was put back.
 */
export async function restore(app: App, writes: readonly Write[]): Promise<boolean> {
  const newest = [...writes].reverse();
  if (newest.some((w) => w.kind === 'lost')) return false;
  const notes = new Map<string, NoteWrites>();
  for (const w of newest) {
    if (w.kind !== 'line' && w.kind !== 'field' && w.kind !== 'log') continue;
    const note = notes.get(w.path) ?? { lines: [], logs: [], fields: [] };
    notes.set(w.path, note);
    if (w.kind === 'line') note.lines.push(w);
    else if (w.kind === 'log') note.logs.push(w);
    else note.fields.push(w);
  }
  const layouts = newest.filter((w): w is LayoutWrite => w.kind === 'layout');

  // Checks first, reading the notes as they are now: a change to any one of them means nothing is put back.
  for (const [path, note] of notes) {
    const file = app.vault.getFileByPath(path);
    if (!file) return false;
    if (!stillAsLeft(await app.vault.read(file), note)) return false;
  }
  if (!layouts.every((w) => same(w.config.get(w.key), w.after))) return false;

  // Then the writes. Each one checks again as it writes, so a change made in between is not overwritten.
  let applied = true;
  for (const [path, note] of notes) {
    if (!(await putBack(app, path, note))) applied = false;
  }
  for (const w of layouts) {
    if (same(w.config.get(w.key), w.after)) w.config.set(w.key, w.before ?? null);
    else applied = false;
  }
  return applied;
}

/** Whether the note's text still has every line, Log line and field of the step as Brain left them. */
function stillAsLeft(text: string, note: NoteWrites): boolean {
  let content = text;
  for (const w of note.lines) {
    const next = replaceLineIfUnchanged(content, w.line, w.after, w.before);
    if (next === null) return false;
    content = next;
  }
  for (const w of note.logs) {
    const next = withoutLogEntry(content, w.entry, w.made, w.tail);
    if (next === undefined) return false;
    content = next;
  }
  return fieldsAsLeft(frontmatterOf(text), note.fields);
}

/**
 * Whether the frontmatter still holds what the step's field writes left, checked as the lines are: newest first, each write
 * finds the value the write after it left, and leaves the value it replaced for the write before it. A key written twice
 * is checked against what its first write left, not against its final value.
 */
function fieldsAsLeft(fm: Record<string, unknown>, fields: readonly FieldWrite[]): boolean {
  const now = new Map<string, unknown>();
  for (const w of fields) {
    const current = now.has(w.key) ? now.get(w.key) : fm[w.key];
    if (!same(current, w.after)) return false;
    now.set(w.key, w.before);
  }
  return true;
}

/** Writes one note's lines, Log lines and fields back, each only while it is still as Brain left it. */
async function putBack(app: App, path: string, note: NoteWrites): Promise<boolean> {
  const file = app.vault.getFileByPath(path);
  if (!file) return false;
  let applied = true;
  if (note.lines.length > 0 || note.logs.length > 0) {
    await app.vault.process(file, (data) => {
      let content = data;
      for (const w of note.lines) {
        const next = replaceLineIfUnchanged(content, w.line, w.after, w.before);
        if (next === null) {
          applied = false;
          return data;
        }
        content = next;
      }
      for (const w of note.logs) {
        const next = withoutLogEntry(content, w.entry, w.made, w.tail);
        if (next === undefined) {
          applied = false;
          return data;
        }
        content = next;
      }
      return content;
    });
  }
  if (note.fields.length > 0) {
    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (!fieldsAsLeft(fm, note.fields)) {
        applied = false;
        return;
      }
      for (const w of note.fields) {
        if (w.before === undefined) delete fm[w.key];
        else fm[w.key] = w.before;
      }
    });
  }
  return applied;
}

/** A note's frontmatter as its text reads it, through Obsidian's YAML: {} when there is none. */
function frontmatterOf(text: string): Record<string, unknown> {
  const yaml = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)/.exec(text)?.[1];
  const value: unknown = yaml === undefined ? {} : parseYaml(yaml);
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Whether two values are what a note or a config holds: they are plain data, so their JSON says it (undefined is only undefined). */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
