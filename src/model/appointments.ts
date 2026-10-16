import type { EventVM, NoteInfo, VaultSnapshot } from './types.ts';
import { weekdayOf } from './dates.ts';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY = '(?:mon|tue|wed|thu|fri|sat|sun)';
const ITEM = `${DAY}(?:-${DAY})?`;
// All or nothing: "every tue, thu and sat" does not match, so it never half-matches as "every tue".
const WEEKLY = new RegExp(`^every (${ITEM}(?:, ?${ITEM})*)$`, 'i');

/**
 * The appointments on one day, by start time: those dated that day, plus weekly
 * repeats ("every tue", "every mon, thu", "every mon-fri") from their date on.
 * Other repeats ("every 2 weeks", "every month", or anything that does not fully parse) show on
 * their first date only for now: `date` is the first occurrence, and Brain does no recurrence math.
 */
export function occurrencesOn(s: VaultSnapshot, iso: string): EventVM[] {
  return s.notes
    .filter((n) => n.type === 'appointment' && occursOn(n, iso))
    .map((n) => toEvent(n, iso))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function occursOn(n: NoteInfo, iso: string): boolean {
  if (n.date === iso) return true;
  const items = WEEKLY.exec(n.repeat?.trim() ?? '')?.[1];
  if (!items || n.date === undefined || iso < n.date) return false;
  return items.toLowerCase().split(/, ?/).some((item) => inItem(item, weekdayOf(iso) - 1));
}

/** Is weekday index `day` (0 = mon) in "tue" or in the range "mon-fri"? A range may wrap: "sat-mon". */
function inItem(item: string, day: number): boolean {
  const [from = '', to = from] = item.split('-');
  const start = DAYS.indexOf(from);
  return (day - start + 7) % 7 <= (DAYS.indexOf(to) - start + 7) % 7;
}

function toEvent(n: NoteInfo, iso: string): EventVM {
  // The lookbehind reads each run of spaces once, not from each space (see DONE_DATES_RE in obsidian/edits.ts).
  const [start = '', end] = (n.time ?? '').split(/(?<!\s)\s*[-–]\s*/);
  return { key: `${n.path}@${iso}`, path: n.path, title: n.name.replace(/^\d{4}-\d{2}-\d{2} /, ''), start, end, where: n.where };
}
