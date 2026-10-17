import type { EventVM } from '../model/types.ts';

// The model never reads the clock. The UI is handed the time of day as "HH:MM" (BrainView its clock,
// the preview a fixed 11:10, a test its own) and compares minutes, so this file takes it as an argument.

/** "20:15" → 1215. Anything else, "" included, gives NaN, which fails every comparison. */
export function minutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/**
 * The minute an appointment is over: its end, or for one with only a start, its start. NaN with no time at
 * all. An end before the start runs past midnight, so it is over only tomorrow.
 */
function overAt(ev: EventVM): number {
  const start = minutes(ev.start);
  const end = minutes(ev.end ?? '');
  if (Number.isNaN(end)) return start;
  return end < start ? end + 24 * 60 : end;
}

/**
 * Whether a TODAY appointment is over at `now`: with an end time the end has passed, with only a start the
 * start has passed. With no time it is not over before the day is. (A past day is over whole, and a future
 * day has not begun: the strip decides that from the day.)
 */
export function hasEnded(ev: EventVM, now: string): boolean {
  return overAt(ev) <= minutes(now);
}

/**
 * The first minute after `now` at which today's strip changes: the earliest end (the start, for one with no
 * end) that is still ahead. "HH:MM", or undefined when nothing more will end today.
 */
export function nextChange(events: EventVM[], now: string): string | undefined {
  const ahead = events.map(overAt).filter((at) => at > minutes(now) && at < 24 * 60);
  if (ahead.length === 0) return undefined;
  const at = Math.min(...ahead);
  return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
}

/**
 * Calls `fire` once at `time` today, a second into that minute so the clock reads it. `from` is the moment
 * it is called at. Returns a function that cancels it. A time already passed fires at once.
 */
export function wakeAt(time: string, from: Date, fire: () => void): () => void {
  if (Number.isNaN(minutes(time))) return () => {};
  const sinceMidnight = ((from.getHours() * 60 + from.getMinutes()) * 60 + from.getSeconds()) * 1000 + from.getMilliseconds();
  const delay = Math.max(0, minutes(time) * 60_000 + 1000 - sinceMidnight);
  const timer = window.setTimeout(fire, delay);
  return () => window.clearTimeout(timer);
}
