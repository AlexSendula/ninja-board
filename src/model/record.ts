// The week record: the five sections `brain week` writes into a week plan's overview, so a past week
// shows as it was (the design spec, section 5). Brain only reads them; it never writes a week plan.
import type { RawNote } from './types.ts';
import { isoWeek, toISO } from './dates.ts';
import { BRACKET_VALUE, displayText } from './taskLine.ts';

/** The record's sections, in the order `brain week` writes them. Each heading is `### <name>`. */
export const RECORD_SECTIONS = ['Appointments', 'Done', 'In progress', 'Not done', 'Backlog'] as const;

/** One record item: `- <title> · <context> [day:: …] [time:: …] [due:: …] [moved:: …] [dropped:: …]`. */
export interface RecordItem {
  title: string; context?: string;
  day?: string; time?: string; due?: string; moved?: string; dropped?: string;   // ISO dates; time "HH:MM" or "HH:MM-HH:MM"
}

export interface WeekRecord {
  frozen?: string; updated?: string;   // the plan's frontmatter: set at the freeze, and by every refresh
  points?: { planned: number; done: number };   // the plan's points_planned and points_done, when both are numbers (deviation 5)
  appointments: RecordItem[]; done: RecordItem[]; inProgress: RecordItem[]; notDone: RecordItem[]; backlog: RecordItem[];
}

const ITEM = /^\s*[-*+] /;
const CHECKBOX = /^\s*[-*+] \[.\]/;                  // a live task line, never a record item
const FIELD = new RegExp(String.raw`\[([A-Za-z][\w-]*)::(${BRACKET_VALUE})\]`, 'g');   // [word:: value]
const TIME = /^\d{1,2}:\d{2}(-\d{1,2}:\d{2})?$/;
const DATE_FIELDS = ['day', 'due', 'moved', 'dropped'] as const;
const SEPARATOR = ' · ';                             // between title and context; the last one counts

/**
 * The record in a week plan note's lines (every line, frontmatter included). Undefined unless all five
 * `### ` headings are there, exactly: a plan from before the headings were added has none. Never throws.
 */
export function parseWeekRecord(note: RawNote): WeekRecord | undefined {
  const starts = RECORD_SECTIONS.map((name) => note.lines.findIndex((l) => l.trim() === '### ' + name));
  if (starts.includes(-1)) return undefined;
  const [appointments, done, inProgress, notDone, backlog] = starts.map((at) => itemsFrom(note.lines, at + 1));
  const frozen = toISO(note.frontmatter?.frozen);
  const updated = toISO(note.frontmatter?.updated);
  const pointsPlanned = note.frontmatter?.points_planned;
  const pointsDone = note.frontmatter?.points_done;
  const points = typeof pointsPlanned === 'number' && typeof pointsDone === 'number' ? { planned: pointsPlanned, done: pointsDone } : undefined;
  return {
    ...(frozen ? { frozen } : {}),
    ...(updated ? { updated } : {}),
    ...(points ? { points } : {}),
    appointments, done, inProgress, notDone, backlog,
  };
}

/** `08 Weeks/2026/2026-W41.md`: the week plan of the ISO week holding `start`. */
export function weekPlanPath(start: string): string {
  const { year, week } = isoWeek(start);
  return `08 Weeks/${year}/${year}-W${String(week).padStart(2, '0')}.md`;
}

/** The plain list items from `from` to the next line starting with `#` or `<!--`. */
function itemsFrom(lines: string[], from: number): RecordItem[] {
  const items: RecordItem[] = [];
  for (const line of lines.slice(from)) {
    const lead = line.trimStart();
    if (lead.startsWith('#') || lead.startsWith('<!--')) break;
    if (!ITEM.test(line) || CHECKBOX.test(line)) continue;
    const item = parseItem(line);
    if (item) items.push(item);
  }
  return items;
}

function parseItem(line: string): RecordItem | undefined {
  const body = line.replace(ITEM, '');
  const fields = new Map<string, string>();
  for (const [, key = '', value = ''] of body.matchAll(FIELD)) if (!fields.has(key)) fields.set(key, value.trim());
  const text = body.replace(FIELD, ' ').replace(/\s+/g, ' ').trim();
  const cut = text.lastIndexOf(SEPARATOR);
  const title = displayText(cut < 0 ? text : text.slice(0, cut));
  if (!title) return undefined;   // fields and nothing else: not an item
  const item: RecordItem = { title };
  // The context reads as shown too, so "[[Home]]" is Home, like the title's links.
  const context = cut < 0 ? '' : displayText(text.slice(cut + SEPARATOR.length));
  if (context) item.context = context;
  for (const key of DATE_FIELDS) {
    const iso = toISO(fields.get(key));
    if (iso) item[key] = iso;
  }
  const time = fields.get('time');
  if (time !== undefined && TIME.test(time)) item.time = time;
  return item;
}
