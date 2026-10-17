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
  const [start = '', end] = splitTime(n.time ?? '');
  return { key: `${n.path}@${iso}`, path: n.path, title: n.name.replace(/^\d{4}-\d{2}-\d{2} /, ''), start, end, where: n.where };
}

const DASHES = '-–';
const isSpace = (c: string): boolean => /\s/.test(c);

/**
 * A time split at its dashes, with the spaces round each dash in neither piece: "09:00 - 10:30" gives "09:00" and "10:30". It is
 * the split of a regex with a lookbehind that keeps a separator from starting in the middle of a run of spaces; iOS
 * before 16.4 has no lookbehind, so the same rule is run here, in one pass (a regex without it would be quadratic over a long run).
 * The rule: a separator's run of spaces starts at the first space after the text before it, but never before the piece's start,
 * and a run that starts at the piece's start needs a non-space before it. So "a - - b" is "a" and "- b".
 */
function splitTime(time: string): string[] {
  const pieces: string[] = [];
  let from = 0;                                           // where the current piece starts
  for (let d = 0; d < time.length; d++) {
    if (!DASHES.includes(time[d] ?? '')) continue;
    let at = d;
    while (at > from && isSpace(time[at - 1] ?? '')) at--;
    if (at === from && from > 0 && isSpace(time[from - 1] ?? '')) continue;   // a separator needs a non-space before its run
    pieces.push(time.slice(from, at));
    let end = d + 1;
    while (end < time.length && isSpace(time[end] ?? '')) end++;
    from = end;
    d = end - 1;
  }
  pieces.push(time.slice(from));
  return pieces;
}
