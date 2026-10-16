import type { NoteInfo, NoteType, RawNote, TaskLine, VaultSnapshot } from './types.ts';
import { toISO } from './dates.ts';
import { displayText, parseTaskLine } from './taskLine.ts';
import { pointsOf } from './points.ts';
import { occurrencesIn } from './repeat.ts';

const ARCHIVE = '10 Archive/';
const NOTE_TYPES: readonly NoteType[] = [
  'area', 'project', 'task', 'appointment', 'commitment', 'inbox',
  'person', 'people', 'conversation', 'week-plan',
];

export function buildSnapshot(raw: RawNote[]): VaultSnapshot {
  const notes = raw.filter((r) => !r.path.startsWith(ARCHIVE)).map(toNote);
  assignParents(notes);
  return { notes };
}

function toNote(r: RawNote): NoteInfo {
  const fm = r.frontmatter ?? {};
  const slash = r.path.lastIndexOf('/');
  // Points belong to task notes (only stories use them: the views read a story's); anything but 1, 2, 3, 5 or 8 is none.
  const points = fm.type === 'task' ? pointsOf(fm.points) : undefined;
  const occurrences = occurrencesIn(r.lines);
  return {
    path: r.path,
    name: r.path.slice(slash + 1).replace(/\.md$/, ''),
    folder: slash < 0 ? '' : r.path.slice(0, slash),
    type: noteType(fm.type),
    status: text(fm.status),
    area: linkName(fm.area),
    due: toISO(fm.due),
    scheduled: toISO(fm.scheduled),
    start: toISO(fm.start),
    done: toISO(fm.done),
    date: toISO(fm.date),
    created: toISO(fm.created),
    repeat: text(fm.repeat),
    lead: text(fm.lead),
    time: text(fm.time),
    where: text(fm.where),
    chase: toISO(fm.chase),
    waitingOn: shownName(fm.waiting_on),
    received: text(fm.received),
    tasks: r.lines.map((l, i) => parseTaskLine(l, r.path, i)).filter((t): t is TaskLine => t !== null),
    ...(points !== undefined ? { points } : {}),
    ...(occurrences.length > 0 ? { occurrences } : {}),
  };
}

function noteType(v: unknown): NoteType {
  return NOTE_TYPES.find((t) => t === v) ?? 'other';
}

/** Strings as they are. A YAML date becomes "YYYY-MM-DDTHH:MM", the format of `received`. */
function text(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 16);
  return undefined;
}

/** "[[Friends]]", "[[Friends|My friends]]" or "Friends" → "Friends". */
function linkName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.replace(/^\s*\[\[|\]\]\s*$/g, '').replace(/[|#].*$/, '').trim() || undefined;
}

/** A link or text as it reads on screen: "[[Bram Ellery|Bram]]" → "Bram", "the landlord" as it is. */
function shownName(v: unknown): string | undefined {
  return typeof v === 'string' ? displayText(v) || undefined : undefined;
}

/**
 * Membership is decided by folder, never by name (two notes may share a name).
 * A note belongs to the closest project folder it sits in; only outside every project, to the closest area.
 */
function assignParents(notes: NoteInfo[]): void {
  const projects = byDepth(notes, 'project');
  const areas = byDepth(notes, 'area');
  for (const n of notes) {
    const project = closest(projects, n);
    if (project) {
      n.projectPath = project.path;
      n.parentName = project.name;
      continue;
    }
    const area = closest(areas, n);
    if (area) {
      n.areaPath = area.path;
      n.parentName = area.name;
    }
  }
}

/** Notes of one type, deepest folder first, so `closest` finds the innermost one. */
function byDepth(notes: NoteInfo[], type: NoteType): NoteInfo[] {
  return notes.filter((n) => n.type === type).sort((a, b) => b.folder.length - a.folder.length);
}

function closest(owners: NoteInfo[], n: NoteInfo): NoteInfo | undefined {
  return owners.find((o) => o !== n && n.path.startsWith(o.folder + '/'));
}
