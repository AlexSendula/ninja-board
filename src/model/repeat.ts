// A repeating task note's completion: its next due date, the frontmatter that becomes open again, and the Log line that
// records the occurrence it closed. The rules are the implementation spec's (Edits: "Complete a repeating task note", and
// "The next date"). Pure: the day it was done is passed in, never read from a clock. A repeat that does not parse can't be
// completed, so nothing is written for it.
import { addDays, toISO, weekdayOf } from './dates.ts';
import type { Occurrence } from './types.ts';

type Unit = 'day' | 'week' | 'month' | 'year';
type Step = { kind: 'step'; n: number; unit: Unit };
/** A repeat: every n units, or on the listed weekdays (0 is Monday). */
export type Repeat = Step | { kind: 'weekdays'; days: number[] };

/** What a completion counts from: the repeat, the anchor (`from`: the due date, or the done date), and a missed fixed date's fate. */
export interface Completion { repeat: string; from: 'due' | 'done'; missed: 'carry' | 'lapse'; due: string }

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY = '(?:mon|tue|wed|thu|fri|sat|sun)';
const ITEM = `${DAY}(?:-${DAY})?`;
const WEEKDAYS = new RegExp(`^every (${ITEM}(?:, ?${ITEM})*)$`, 'i');
const STEP = /^every (?:(\d+) )?(day|week|month|year)s?$/i;
const HEADING = /^#{1,6}[ \t]/;
const LOG_HEADING = /^## Log[ \t]*\r?$/;
const OCCURRENCE = /^- (\d{4}-\d{2}-\d{2}) Done: the occurrence due (\d{4}-\d{2}-\d{2})\. Next due (\d{4}-\d{2}-\d{2})\.\r?$/;

/** The repeat a note's `repeat` says: "every month", "every 6 months", "every tue", "every mon, wed, fri", "every mon-fri". Undefined otherwise. */
export function parseRepeat(text: string): Repeat | undefined {
  const t = text.trim();
  const step = STEP.exec(t);
  if (step) {
    const n = Number(step[1] ?? 1);
    return n >= 1 ? { kind: 'step', n, unit: (step[2] ?? 'day').toLowerCase() as Unit } : undefined;
  }
  const items = WEEKDAYS.exec(t)?.[1];
  if (items === undefined) return undefined;
  const days = new Set<number>();
  for (const item of items.toLowerCase().split(/, ?/)) {
    const [from = '', to = from] = item.split('-');
    const start = DAYS.indexOf(from);
    for (let k = 0; k <= (DAYS.indexOf(to) - start + 7) % 7; k++) days.add((start + k) % 7);
  }
  return { kind: 'weekdays', days: [...days].sort((a, b) => a - b) };
}

/** How many years past the later of the due date and the day it was done a repeat is followed; a date beyond it is refused. */
const HORIZON_YEARS = 100;

/**
 * The next due date after the occurrence due on `c.due` is completed on `completedOn`. Counted from the done date: one
 * step after it. Counted from the due date: one step after it, when a missed date carries over; when it lapses, the first
 * date after the later of the due date and the day it was done. Each step counts from the due date being completed, so a
 * month end drifts (31 Jan, 28 Feb, 28 Mar). Undefined when the repeat does not parse, when the date would leave year 9999,
 * or when it lands more than HORIZON_YEARS past the later date.
 */
export function nextDue(c: Completion, completedOn: string): string | undefined {
  const r = parseRepeat(c.repeat);
  if (r === undefined) return undefined;
  const later = c.due > completedOn ? c.due : completedOn;
  const next = c.from === 'done' ? after(completedOn, r)
    : c.missed === 'carry' ? after(c.due, r)
    : r.kind === 'weekdays' ? nextWeekday(later, r.days)
    : lapsed(c.due, r, later);
  // A year past 9999 is not a date toISO keeps, so the Log line and the frontmatter never get one.
  if (toISO(next) === undefined) return undefined;
  return Number(next.slice(0, 4)) - Number(later.slice(0, 4)) <= HORIZON_YEARS ? next : undefined;
}

/**
 * A completed repeating task note's frontmatter: open, with its next due date; its planned day and week, its waiting and
 * its done key go (the note doesn't finish). Returns the Log line for the occurrence, or undefined when the repeat does not
 * parse or the note has no date to count from (`repeat` requires `due`): the frontmatter is then left as it was.
 */
export function applyNoteComplete(fm: Record<string, unknown>, completedOn: string): string | undefined {
  const due = toISO(fm.due);
  if (due === undefined) return undefined;
  const next = nextDue({
    repeat: typeof fm.repeat === 'string' ? fm.repeat : '',
    from: fm.repeat_from === 'done' ? 'done' : 'due',
    missed: fm.if_missed === 'lapse' ? 'lapse' : 'carry',
    due,
  }, completedOn);
  if (next === undefined) return undefined;
  fm.status = 'open';
  fm.due = next;
  for (const key of ['scheduled', 'start', 'waiting_on', 'chase', 'done']) delete fm[key];
  return occurrenceLine({ on: completedOn, due, next });
}

/** The Log line of a completed occurrence: `- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2027-04-20.` */
export function occurrenceLine({ on, due, next }: Occurrence): string {
  return `- ${on} Done: the occurrence due ${due}. Next due ${next}.`;
}

/**
 * The completed occurrences a note's Log section holds, newest first (as the lines are). Other lines are not occurrences.
 * `nth` numbers the lines dated the same day from the top, so two completions on one day are two rows (rows.ts, occurrenceKey).
 */
export function occurrencesIn(lines: readonly string[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const line of logSection(lines)) {
    const m = OCCURRENCE.exec(line);
    if (!m) continue;
    const on = m[1] ?? '';
    out.push({ on, due: m[2] ?? '', next: m[3] ?? '', nth: out.filter((o) => o.on === on).length + 1 });
  }
  return out;
}

/**
 * `text` (a whole note, or its body) with `entry` at the top of its `## Log` section. A note with no section gets one at its
 * end, with the entry under it: `made` says so, and `tail` is exactly the text added there (a line break where the text had
 * none, a blank line, the section), which undo takes back. The text's own line endings are kept.
 */
export function withLogEntry(text: string, entry: string): { text: string; made: boolean; tail: string } {
  const lines = text.split('\n');
  const h = lines.findIndex(isLogHeading);
  if (h >= 0) {
    lines.splice(h + 1, 0, entry + (lines[h]?.endsWith('\r') ? '\r' : ''));
    return { text: lines.join('\n'), made: false, tail: '' };
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lineEnd = text === '' || text.endsWith('\n') ? '' : eol;
  const gap = text.trim() === '' ? '' : eol;   // one blank line between the note and its new section
  const tail = `${lineEnd}${gap}## Log${eol}${entry}${eol}`;
  return { text: text + tail, made: true, tail };
}

/**
 * `text` with the entry that withLogEntry added taken out, or undefined when it is not as Brain left it. For a section that was
 * there, the line under its heading must be the entry. For a section Brain made, the text must still end with the `tail` Brain
 * appended, so a line typed under the entry, or any change after it, refuses. Everything before is kept as it is. Undo uses
 * it; it never removes anything else.
 */
export function withoutLogEntry(text: string, entry: string, made: boolean, tail: string): string | undefined {
  if (made) return text.endsWith(tail) ? text.slice(0, text.length - tail.length) : undefined;
  const lines = text.split('\n');
  const h = lines.findIndex(isLogHeading);
  if (h < 0 || bare(lines[h + 1] ?? '') !== entry) return undefined;
  lines.splice(h + 1, 1);
  return lines.join('\n');
}

/** The indexes of the first Log section's lines, its heading included, up to the next heading: the lines a snapshot keeps. */
export function logLineNumbers(lines: readonly string[]): number[] {
  const start = lines.findIndex(isLogHeading);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && HEADING.test(l));
  const to = end < 0 ? lines.length : end;
  return Array.from({ length: to - start }, (_, k) => start + k);
}

/** The lines of the first Log section, below its heading and up to the next heading. */
function logSection(lines: readonly string[]): string[] {
  const start = lines.findIndex(isLogHeading);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && HEADING.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function isLogHeading(line: string): boolean {
  return LOG_HEADING.test(line);
}

/** A line without its carriage return. */
function bare(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/**
 * The first step from `due` after `later`. The walk stops at the first step that toISO refuses (one past year 9999), so it
 * ends even when the steps are far apart. Returns that refused step, which nextDue then refuses.
 */
function lapsed(due: string, r: Step, later: string): string {
  let k = 1;
  let next = stepFrom(due, r, k);
  while (next <= later && toISO(next) !== undefined) next = stepFrom(due, r, ++k);
  return next;
}

/** The first date after `anchor` that the repeat gives: one step, or the next listed weekday. */
function after(anchor: string, r: Repeat): string {
  return r.kind === 'weekdays' ? nextWeekday(anchor, r.days) : stepFrom(anchor, r, 1);
}

/** The k-th step from `anchor` (k = 1 is the next date). A day a month doesn't have becomes that month's last day. */
function stepFrom(anchor: string, r: Step, k: number): string {
  const { n, unit } = r;
  if (unit === 'day') return addDays(anchor, n * k);
  if (unit === 'week') return addDays(anchor, 7 * n * k);
  return addMonths(anchor, (unit === 'year' ? 12 : 1) * n * k);
}

function addMonths(iso: string, months: number): string {
  const total = Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;   // 0 is January
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Number(iso.slice(8, 10)), last);
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The first day strictly after `after` that is one of `days` (0 is Monday). */
function nextWeekday(after: string, days: number[]): string {
  for (let i = 1; i <= 7; i++) {
    const iso = addDays(after, i);
    if (days.includes(weekdayOf(iso) - 1)) return iso;
  }
  return addDays(after, 7);   // unreachable: a parsed weekday repeat lists at least one day
}
