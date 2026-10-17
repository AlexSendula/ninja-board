import { normalizePath, TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';
import type { RawNote, VaultSnapshot } from '../model/types.ts';
import { compareText } from '../model/order.ts';
import { weekPlanPath } from '../model/record.ts';
import { buildSnapshot } from '../model/snapshot.ts';
import { isStoryAt } from '../model/week.ts';
import { targetOf } from '../model/points.ts';
import { logLineNumbers } from '../model/repeat.ts';

const ARCHIVE = '10 Archive/';

/** The vault's config note (99 System, with the contexts and the add-ons). Its `points_per_week` is the week's points target. */
export const CONFIG_PATH = normalizePath('99 System/config.md');

/**
 * The snapshot of the notes Bases selected. buildSnapshot skips the archive too; this skips reading it.
 * Notes go to buildSnapshot sorted by path: Bases' order isn't guaranteed, and some picks in the
 * model depend on the order of the notes.
 */
export async function snapshotFromFiles(app: App, files: TFile[]): Promise<VaultSnapshot> {
  const notes = files
    .filter((f) => f.extension === 'md' && !f.path.startsWith(ARCHIVE))
    .sort((a, b) => compareText(a.path, b.path));
  return buildSnapshot(await Promise.all(notes.map((f) => rawNote(app, f))));
}

/**
 * Whether the note at `path` is a story: isStoryAt's answer over the whole vault, read for this note alone. A story's project is
 * the project note of the nearest folder above it that holds one (projectsAbove), so the snapshot is built from the note and
 * those projects only, and buildSnapshot and isStoryAt decide as they do for every note in the vault.
 */
export function isStoryFile(app: App, path: string): boolean {
  const file = app.vault.getFileByPath(path);
  if (!file || file.extension !== 'md') return false;
  const notes = [file, ...projectsAbove(app, path)].map((f) => ({
    path: f.path,
    frontmatter: app.metadataCache.getFileCache(f)?.frontmatter,
    lines: [],
  }));
  return isStoryAt(buildSnapshot(notes), path);
}

/**
 * The project notes of the nearest folder above `path` that holds any, walking up from the note's own folder. The vault's root
 * never counts: a project there has the folder "", and buildSnapshot's rule needs a path that starts with "/", which none does.
 */
function projectsAbove(app: App, path: string): TFile[] {
  for (let slash = path.lastIndexOf('/'); slash > 0; slash = path.lastIndexOf('/', slash - 1)) {
    const folder = app.vault.getAbstractFileByPath(path.slice(0, slash));
    if (!(folder instanceof TFolder)) continue;
    const projects = folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md'
      && child.path !== path && app.metadataCache.getFileCache(child)?.frontmatter?.type === 'project');
    if (projects.length > 0) return projects;
  }
  return [];
}

/**
 * The week's points target: the config note's `points_per_week`, 8 when there is no config note or no value. Read from the
 * metadata cache, so each draw reads it without waiting; a change to the config note redraws the view (see BrainView).
 */
export function readPointsTarget(app: App): number {
  const file = app.vault.getFileByPath(CONFIG_PATH);
  return targetOf(file ? app.metadataCache.getFileCache(file)?.frontmatter : undefined);
}

/**
 * The plan note of the week starting on `start`, every line of it, or undefined when there is none.
 * A plan holds no task lines, so the snapshot skips its text; the Week view reads the plan it shows.
 */
export async function readWeekPlan(app: App, start: string): Promise<RawNote | undefined> {
  const file = app.vault.getFileByPath(normalizePath(weekPlanPath(start)));
  if (!file) return undefined;
  const lines = (await app.vault.cachedRead(file)).split(/\r?\n/);
  return { path: file.path, frontmatter: app.metadataCache.getFileCache(file)?.frontmatter, lines };
}

/**
 * `lines` with every line blanked unless its number is in `taskLineNumbers`, so the indexes stay
 * the file's line numbers. The metadata cache knows what is really a task: a "- [ ]" inside a
 * code fence or an HTML comment is not, and must not become a tickable row.
 */
export function taskLinesOnly(lines: string[], taskLineNumbers: Set<number>): string[] {
  return lines.map((l, i) => (taskLineNumbers.has(i) ? l : ''));
}

async function rawNote(app: App, file: TFile): Promise<RawNote> {
  const cache = app.metadataCache.getFileCache(file);
  const taskLineNumbers = new Set(
    (cache?.listItems ?? []).filter((item) => item.task !== undefined).map((item) => item.position.start.line),
  );
  // A repeating note's Log section is read as well: its completed occurrences are the Done rows of their weeks.
  const repeats = typeof cache?.frontmatter?.repeat === 'string' && cache.frontmatter.repeat !== '';
  // Most notes hold no tasks, and every render comes through here: read only the ones that do, or that repeat.
  const lines = taskLineNumbers.size === 0 && !repeats ? [] : await readKeptLines(app, file, taskLineNumbers, repeats);
  return { path: file.path, frontmatter: cache?.frontmatter, lines };
}

/**
 * The note's lines with only its task lines kept (and its Log section's, for a repeating note). Split on \r?\n: a line ending
 * in \r would not parse as a task, and replaceLineIfUnchanged compares lines without their \r as well. A note that can't be
 * read (locked, evicted, removed) shows no tasks: one bad file must not fail the render of every view.
 */
async function readKeptLines(app: App, file: TFile, taskLineNumbers: Set<number>, repeats: boolean): Promise<string[]> {
  try {
    const all = (await app.vault.cachedRead(file)).split(/\r?\n/);
    const keep = new Set(taskLineNumbers);
    if (repeats) for (const i of logLineNumbers(all)) keep.add(i);
    return taskLinesOnly(all, keep);
  } catch (error) {
    console.error(error);
    return [];
  }
}
