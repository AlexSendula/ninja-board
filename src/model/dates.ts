// ISO date helpers and the date wording rule.
// toISO accepts any value and ageText any string; every other function expects a valid
// "YYYY-MM-DD" string, so run outside values through toISO first.
// Arithmetic runs in UTC so local time zones and DST never shift a day.
import type { MetaPart } from './types.ts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DATE_OR_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}.*)?$/;
const DAY_MS = 86_400_000;

function utc(iso: string): Date {
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function toISO(v: unknown): string | undefined {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    return `${pad(v.getFullYear(), 4)}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!DATE_OR_DATETIME.test(s)) return undefined;
  const iso = s.slice(0, 10);
  // Date.UTC rolls 2026-02-30 over to 2026-03-02, so a round trip that changes the string means invalid.
  return fromUTC(utc(iso)) === iso ? iso : undefined;
}

export function addDays(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

export function daysBetween(a: string, b: string): number {
  return (utc(b).getTime() - utc(a).getTime()) / DAY_MS;
}

const DURATION = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/;

/**
 * A lead time (implementation spec, section 2: number + m, h, d or w, largest first) as whole days. A deadline is a
 * date, so a lead under a day opens its window on the deadline's own day; `24h` is one day. undefined: not a duration.
 */
export function leadDays(lead: string): number | undefined {
  const m = DURATION.exec(lead.trim());
  if (!m || lead.trim() === '') return undefined;
  const [weeks = 0, days = 0, hours = 0, minutes = 0] = m.slice(1).map((v) => Number(v ?? 0));
  return Math.floor(((weeks * 7 + days) * 1440 + hours * 60 + minutes) / 1440);
}

export function weekdayOf(iso: string): number {
  return utc(iso).getUTCDay() || 7;
}

export function isoWeek(iso: string): { year: number; week: number; start: string; end: string } {
  const start = addDays(iso, 1 - weekdayOf(iso));
  // An ISO week belongs to the year of its Thursday.
  const thursday = addDays(start, 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1;
  return { year, week, start, end: addDays(start, 6) };
}

export function monthName(n: number): string {
  return MONTHS[n - 1] ?? '';
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS[weekdayOf(iso) - 1] ?? '';
}

export function longDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${monthName(Number(iso.slice(5, 7)))}`;
}

export function dayWord(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n >= 1 && n <= 6) return weekdayLong(iso).slice(0, 3);
  const short = dayMonth(iso);
  return iso.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${iso.slice(0, 4)}`;
}

/** "28 Sep": a two-month week title's ends, and the date in dayWord. */
export function dayMonth(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${monthName(Number(iso.slice(5, 7))).slice(0, 3)}`;
}

/** "Tue 20": a day group's name in an upcoming week. */
export function dayLabel(iso: string): string {
  return `${weekdayLong(iso).slice(0, 3)} ${Number(iso.slice(8, 10))}`;
}

/** "Thu 15 Oct": a date outside the shown week, and the record's frozen and updated dates. */
export function shortDate(iso: string): string {
  return `${weekdayLong(iso).slice(0, 3)} ${dayMonth(iso)}`;
}

/**
 * A date as a week that isn't this week reads it: the short weekday inside the week that starts on
 * `start` ("Sat"), else the short date ("Thu 15 Oct"), with the year when it differs from the week's.
 */
export function weekWord(iso: string, start: string): string {
  if (iso >= start && iso <= addDays(start, 6)) return weekdayLong(iso).slice(0, 3);
  return iso.slice(0, 4) === start.slice(0, 4) ? shortDate(iso) : `${shortDate(iso)} ${iso.slice(0, 4)}`;
}

/** dayWord, lowercased when it is Today or Yesterday, for use after a verb ("Chase today"). */
function afterVerb(iso: string, today: string): string {
  const word = dayWord(iso, today);
  return word === 'Today' || word === 'Yesterday' ? word.toLowerCase() : word;
}

export function dueText(iso: string, today: string): MetaPart {
  const overdue = daysBetween(iso, today);
  if (overdue > 0) return { text: `${overdue} ${overdue === 1 ? 'day' : 'days'} overdue`, tone: 'overdue', when: 'due' };
  return { text: `Due ${afterVerb(iso, today)}`, when: 'due' };
}

export function chaseText(iso: string, today: string): MetaPart {
  const text = `Chase ${afterVerb(iso, today)}`;
  return iso < today ? { text, tone: 'late', when: 'plan' } : { text, when: 'plan' };
}

/** A day plan: "Planned today", "Planned Wed", "Planned 26 Oct". */
export function plannedText(iso: string, today: string): MetaPart {
  return { text: 'Planned ' + afterVerb(iso, today), when: 'plan' };
}

/** A week plan (any day in the week): "This week" for this week, else "Week 43". */
export function weekPlanText(start: string, today: string): MetaPart {
  const week = isoWeek(start);
  return { text: week.start === isoWeek(today).start ? 'This week' : 'Week ' + week.week, when: 'plan' };
}

export function doneText(iso: string, today: string): string {
  return `Done ${afterVerb(iso, today)}`;
}

/** Inbox age. Takes a date or a date-time ("2026-10-12T21:04"); invalid input gives ''. */
export function ageText(iso: string, today: string): string {
  const date = toISO(iso);
  if (!date) return '';
  const n = daysBetween(date, today);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  return `${n} days`;
}
