import type { DayVM, EventVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { isoWeek, longDate, weekdayLong } from '../model/dates.ts';
import { hasEnded } from './clock.ts';
import { h, link } from './dom.ts';
import { agendaItems } from './schedule.ts';

/** Appointments a day shows: the first few still to come. The rest, and the finished ones, are behind the day's button. */
const CAP = 3;

export interface StripOpts {
  drop?: boolean;     // each day and its button take a dropped row
  now?: string;       // "HH:MM": what has ended today. Left out: nothing has.
  record?: boolean;   // a past week's record: every appointment shows, as it was, with no button
}

/**
 * The week strip: seven day columns, and below 720px seven compact day buttons whose picked day's
 * appointments are listed beneath. The CSS shows one or the other; picking a day works client-side.
 *
 * A day shows the appointments still to come, at most 3: a day before today shows none, and today none that
 * have ended (see hasEnded). What it doesn't show, finished or beyond the 3, is behind a quiet button: "+N more"
 * beside chips, or "N earlier" when there are none. It opens the day's full view (actions.showDay).
 * An upcoming week has nothing finished, so it shows its first 3 and +N more. A record shows everything.
 *
 * With `drop`, each day and its button take a dropped row (data-drop="day"), to plan it for that date.
 * A day before today takes none: planning looks forward.
 */
export function weekStrip(days: DayVM[], actions: Actions, opts: StripOpts = {}): HTMLElement {
  const label = `Days of week ${isoWeek(days[0].iso).week}`;
  const picks = days.map(dayPick);
  const columns = days.map((day) => dayColumn(day, actions, opts));
  if (opts.drop) {
    columns.forEach((col, i) => col.setAttribute('data-date', days[i].iso));   // the picks have theirs already
    // A past day takes no drop. The week's own days count as past before today; an upcoming week has none.
    days.forEach((day, i) => {
      if (day.isPast) return;
      columns[i].setAttribute('data-drop', 'day');
      picks[i].setAttribute('data-drop', 'day');
    });
  }
  const agenda = h('ol', 'brain-agenda brain-strip-agenda', { 'aria-live': 'polite' });
  const show = (day: DayVM) => {
    for (const pick of picks) pick.setAttribute('aria-pressed', String(pick.dataset.date === day.iso));
    agenda.replaceChildren(...dayItems(day, actions, opts));
  };
  picks.forEach((pick, i) => pick.addEventListener('click', () => show(days[i])));
  show(days.find((d) => d.isToday) ?? days[0]);
  return h('section', 'brain-tile brain-strip', {}, [
    h('ol', 'brain-days', { 'aria-label': label }, columns),
    h('div', 'brain-picks', { role: 'group', 'aria-label': label }, picks),
    agenda,
  ]);
}

function dayColumn(day: DayVM, actions: Actions, opts: StripOpts): HTMLLIElement {
  const { chips, hidden } = shownOn(day, opts);
  return h('li', dayClass('brain-day', day), day.isToday ? { 'aria-current': 'date' } : {}, [
    h('span', 'brain-label', {}, [day.weekdayShort]),
    h('span', 'brain-day-num', {}, [String(day.dayNum)]),
    chips.length > 0 || hidden > 0
      ? h('ul', 'brain-day-events', {}, [...chips.map((ev) => chip(ev, actions)), hidden > 0 ? moreItem(day, chips.length, hidden, 'more', actions, opts) : null])
      : null,
    dayCount(day),
  ]);
}

/** What a day shows (the appointments still to come, up to the cap) and how many it doesn't. */
function shownOn(day: DayVM, { now, record }: StripOpts): { chips: EventVM[]; hidden: number } {
  if (record) return { chips: day.events, hidden: 0 };
  const ahead = day.isPast ? [] : day.isToday ? day.events.filter((ev) => !hasEnded(ev, now ?? '')) : day.events;
  const chips = ahead.slice(0, CAP);
  return { chips, hidden: day.events.length - chips.length };
}

/** The picked day's list in the narrow strip: what the column would show, then the same button. */
function dayItems(day: DayVM, actions: Actions, opts: StripOpts): HTMLLIElement[] {
  if (day.events.length === 0) return [h('li', 'brain-empty', {}, ['No appointments'])];
  const { chips, hidden } = shownOn(day, opts);
  return [
    ...(chips.length > 0 ? agendaItems(chips, actions) : []),
    ...(hidden > 0 ? [moreItem(day, chips.length, hidden, 'more-agenda', actions, opts)] : []),
  ];
}

/**
 * "+N more" beside shown appointments, "N earlier" when none are shown: a quiet button that opens the day's full
 * view. N counts every appointment not shown, the finished ones too. Its key keeps the focus on it across a redraw
 * (the column's and the list's buttons are different keys, as only one of them shows).
 */
function moreItem(day: DayVM, shown: number, hidden: number, kind: string, actions: Actions, { now }: StripOpts): HTMLLIElement {
  const text = shown > 0 ? `+${hidden} more` : `${hidden} earlier`;
  const button = h('button', 'brain-quiet', {
    'aria-haspopup': 'dialog',
    'aria-label': `${text} on ${weekdayLong(day.iso)} ${day.dayNum}`,
    'data-key': `${kind}:${day.iso}`,
  }, [text]);
  button.addEventListener('click', () => actions.showDay({
    title: `${weekdayLong(day.iso)} ${longDate(day.iso)} · ${day.events.length}`,
    events: day.events,
    now: day.isToday ? now : undefined,
    opener: button,
  }));
  return h('li', 'brain-more-item', {}, [button]);
}

/**
 * A past day's done count, or "2 planned" and "1 due" (the due one red); the CSS puts the · between
 * them. Nothing on an empty day.
 */
function dayCount(day: DayVM): HTMLSpanElement | null {
  if (day.done > 0) return h('span', 'brain-day-count', {}, [`${day.done} done`]);
  if (day.planned === 0 && day.due === 0) return null;
  return h('span', 'brain-day-count brain-meta', {}, [
    day.planned > 0 ? h('span', undefined, {}, [`${day.planned} planned`]) : null,
    day.due > 0 ? h('span', undefined, { 'data-when': 'due' }, [`${day.due} due`]) : null,
  ]);
}

/** Time, then title; an appointment without a time is its title alone. */
function chip(ev: EventVM, actions: Actions): HTMLLIElement {
  return h('li', 'brain-chip', {}, [
    ev.start ? h('span', 'brain-chip-time', {}, [ev.start]) : null,
    // A record's appointment whose note is gone has no path: its title is plain text.
    ev.path
      ? link(ev.title, 'brain-chip-title brain-link brain-stretch', () => actions.open(ev.path))
      : h('span', 'brain-chip-title', {}, [ev.title]),
  ]);
}

function dayPick(day: DayVM): HTMLButtonElement {
  const label = `${weekdayLong(day.iso)} ${day.dayNum}` + countWords(day);
  return h('button', dayClass('brain-day-pick', day), {
    'aria-pressed': 'false',
    'data-key': `pick:${day.iso}`,
    ...(day.isToday ? { 'aria-current': 'date' } : {}),
    'data-date': day.iso,
    'aria-label': label,
  }, [
    h('span', 'brain-label', {}, [day.initial]),
    h('span', 'brain-day-num', {}, [String(day.dayNum)]),
    // The dot says something is on that day: an appointment, a task, or in a past week something done.
    day.events.length > 0 || day.planned > 0 || day.due > 0 || day.done > 0 ? h('span', 'brain-day-dot') : null,
  ]);
}

function dayClass(base: string, day: DayVM): string {
  return [base, day.isToday ? 'brain-is-today' : '', day.isPast ? 'brain-is-past' : ''].filter(Boolean).join(' ');
}

/** ", 2 done", ", 1 planned and 1 due", ", 2 planned", ", 1 due", or nothing on an empty day. */
function countWords(day: DayVM): string {
  if (day.done > 0) return `, ${day.done} done`;
  if (day.planned > 0 && day.due > 0) return `, ${day.planned} planned and ${day.due} due`;
  if (day.planned > 0) return `, ${day.planned} planned`;
  if (day.due > 0) return `, ${day.due} due`;
  return '';
}
