import type { EventVM, ScheduleView } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { minutes } from './clock.ts';
import { h, link } from './dom.ts';

/** The window of Large: 6 hours of timeline (288px at 48px an hour). A longer day scrolls inside it. */
const WINDOW_HOURS = 6;

export interface ScheduleOpts {
  now?: string;          // "HH:MM": where the now-line stands. Left out: no line.
  view?: ScheduleView;   // default: large
  whole?: boolean;       // Large: start with Whole day on (a redraw keeps what the page had)
  day?: string;          // Large: which day this is, kept on the window so a redraw can tell the same day from a new one
  scroll?: number;       // Large: where the window was scrolled (scheduleScroll), kept by a redraw of the same day; left out: open at now
}

/**
 * Today's Schedule tile.
 *
 * **Large** (the default): the day's timeline in a window of about 6 hours that scrolls, opened at now, with Whole day
 * to grow it in place. A day no longer than the window has nothing to scroll: the timeline stands on its own, with no Whole day.
 * **Compact**: the whole day squeezed into the same window, no scrolling. The switch, in the label row, goes between them.
 * Without a timeline (an event with no time, or no end) the tile is the plain list, with no buttons.
 * Below 560px the CSS shows the list and hides the buttons.
 */
export function schedule(events: EventVM[], actions: Actions, opts: ScheduleOpts = {}): HTMLElement {
  const view = opts.view ?? 'large';
  const tl = timeline(events, actions, opts.now);
  const head = [h('h3', 'brain-label', {}, ['Schedule']), h('span', 'brain-count', {}, [String(events.length)])];
  if (!tl) {
    return h('section', 'brain-tile brain-area-sched', {}, [h('div', 'brain-label-row', {}, head), h('ol', 'brain-agenda', {}, agendaItems(events, actions))]);
  }
  const scrolls = view === 'large' && hoursOf(tl) > WINDOW_HOURS;
  const scroller = scrolls ? scrollWindow(tl, opts) : null;
  const buttons = [scroller ? wholeButton(scroller) : null, switchButton(view, actions)];
  return h('section', view === 'compact' ? 'brain-tile brain-area-sched brain-is-compact' : 'brain-tile brain-area-sched', {}, [
    h('div', 'brain-label-row', {}, [...head, h('span', 'brain-tools', {}, buttons)]),
    scroller ?? tl,
    h('ol', 'brain-agenda', {}, agendaItems(events, actions)),
  ]);
}

/** Whether root's Schedule is grown to the whole day. Read it before a redraw replaces the tile. */
export function scheduleWhole(root: ParentNode): boolean {
  return root.querySelector('.brain-scroll.brain-is-whole') !== null;
}

/**
 * Where root's Large window is scrolled, and for which day: read before a redraw replaces the tile, so the redraw of
 * the same day can put it back. Undefined when there is no window, or it was never placed (drawn narrow, hidden).
 */
export function scheduleScroll(root: ParentNode): { day: string; top: number } | undefined {
  const scroller = root.querySelector<HTMLElement>('.brain-scroll[data-placed]');
  return scroller ? { day: scroller.dataset.day ?? '', top: scroller.scrollTop } : undefined;
}

/** The list form of a day's events, or one "No appointments" line. An event without a time has no time element. */
export function agendaItems(events: EventVM[], actions: Actions): HTMLLIElement[] {
  if (events.length === 0) return [h('li', 'brain-empty', {}, ['No appointments'])];
  return events.map((ev) => h('li', 'brain-agenda-item', {}, [
    ev.start ? h('time', 'brain-agenda-time', { datetime: ev.start }, [ev.start]) : null,
    // A record's appointment whose note is gone has no path: its title is plain text.
    ev.path ? link(ev.title, 'brain-link brain-stretch', () => actions.open(ev.path)) : h('span', undefined, {}, [ev.title]),
    ev.where ? h('span', 'brain-agenda-where', {}, [ev.where]) : null,
  ]));
}

/**
 * A day's timeline: the events plus an hour either side, on whole hours, at 48px an hour. Null unless every event
 * has a start and a later end. With `now`, it is today's: a now-line stands in it while the clock is inside the
 * day, and tickNow moves it.
 */
export function timeline(events: EventVM[], actions: Actions, now?: string): HTMLDivElement | null {
  const spans = events.map((ev) => ({ ev, from: minutes(ev.start), to: ev.end ? minutes(ev.end) : NaN }));
  // NaN (no time, no end, a bad time) fails the comparison too.
  if (spans.length === 0 || spans.some((s) => !(s.to > s.from))) return null;
  const first = Math.max(0, Math.floor(Math.min(...spans.map((s) => s.from)) / 60) - 1);
  const last = Math.min(24, Math.ceil(Math.max(...spans.map((s) => s.to)) / 60) + 1);
  const hours = last - first;
  const at = (min: number) => round((min / 60 - first) / hours);

  const el = h('div', 'brain-timeline');
  el.setCssProps({ '--brain-hours': String(hours) });
  for (let hour = first; hour <= last; hour++) {
    const mark = h('span', 'brain-hour', { 'aria-hidden': 'true' }, [h('span', undefined, {}, [String(hour % 24).padStart(2, '0')])]);
    mark.setCssProps({ '--brain-at': String(at(hour * 60)) });
    el.append(mark);
  }
  const lanes = lanesOf(spans);
  spans.forEach(({ ev, from, to }, i) => {
    const block = eventBlock(ev, actions);
    block.setCssProps({
      '--brain-at': String(at(from)),
      '--brain-len': String(round((to - from) / 60 / hours)),
      '--brain-lane': String(lanes[i].lane),
      '--brain-lanes': String(lanes[i].lanes),
    });
    el.append(block);
  });
  if (now !== undefined) {
    el.dataset.first = String(first);
    tickTimeline(el, now);
  }
  return el;
}

/**
 * Each span's lane. Spans that overlap in time, directly or through others, form a group that shares the width: the
 * first free lane in start order, and the group is as many lanes wide as it needs. A span that overlaps nothing has
 * the whole width, and one that only touches another (ends where it starts) does not overlap it.
 */
function lanesOf(spans: Array<{ from: number; to: number }>): Array<{ lane: number; lanes: number }> {
  const placed = spans.map(() => ({ lane: 0, lanes: 1 }));
  const byStart = spans.map((_, i) => i).sort((a, b) => spans[a].from - spans[b].from || spans[b].to - spans[a].to);
  let group: number[] = [];
  let laneEnds: number[] = [];   // where the last span in each lane of the group ends
  let groupEnd = -Infinity;
  const closeGroup = () => {
    for (const i of group) placed[i].lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const i of byStart) {
    const { from, to } = spans[i];
    if (from >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= from);
    if (lane < 0) lane = laneEnds.push(to) - 1;
    else laneEnds[lane] = to;
    placed[i].lane = lane;
    group.push(i);
    groupEnd = Math.max(groupEnd, to);
  }
  closeGroup();
  return placed;
}

/**
 * An event block: the title on line one, the time and place on line two ("17:30–18:30 · Home"). The CSS ends each in an
 * ellipsis, drops line two in a block too short for it, and in Compact shows the start after the title instead.
 * The full text is on hover and in the label.
 */
function eventBlock(ev: EventVM, actions: Actions): HTMLAnchorElement {
  const when = `${ev.start}–${ev.end}`;
  const block = link([
    h('span', 'brain-event-title', {}, [ev.title, h('span', 'brain-start', {}, [` · ${ev.start}`])]),
    h('span', 'brain-event-meta', {}, [ev.where ? `${when} · ${ev.where}` : when]),
  ], 'brain-event', () => actions.open(ev.path));
  block.setAttribute('title', ev.where ? `${ev.title} · ${when} · ${ev.where}` : `${ev.title} · ${when}`);
  block.setAttribute('aria-label', ev.where ? `${ev.title}, ${when}, ${ev.where}` : `${ev.title}, ${when}`);
  return block;
}

/** Moves the now-line of every live timeline in root (the Schedule, an open day modal) to this time, without a redraw. */
export function tickNow(root: ParentNode, now: string): void {
  for (const el of root.querySelectorAll<HTMLElement>('.brain-timeline[data-first]')) tickTimeline(el, now);
}

/** The now-line of one live timeline: made if the clock has come inside the day, moved if it is there, removed once past it. */
function tickTimeline(el: HTMLElement, now: string): void {
  const hours = hoursOf(el);
  const at = (minutes(now) / 60 - Number(el.dataset.first)) / hours;
  let line = el.querySelector<HTMLElement>('.brain-now-line');
  if (!(at > 0 && at < 1)) {   // NaN fails too
    line?.remove();
    return;
  }
  line ??= el.appendChild(h('span', 'brain-now-line', {}, [h('span', 'brain-sr')]));
  line.setCssProps({ '--brain-at': String(round(at)) });
  line.setAttribute('title', `Now, ${now}`);
  line.querySelector('.brain-sr')!.textContent = `Now, ${now}`;
}

function hoursOf(timelineEl: HTMLElement): number {
  return Number(timelineEl.style.getPropertyValue('--brain-hours'));
}

/**
 * The Large window around a timeline: it scrolls, fades at the edges that have more beyond them, and opens at now, or
 * where it was (`opts.scroll`) when this redraws the day it already showed.
 */
function scrollWindow(tl: HTMLElement, opts: ScheduleOpts): HTMLElement {
  const scroller = h('div', opts.whole ? 'brain-scroll brain-is-whole' : 'brain-scroll', {
    tabindex: '0', role: 'region', 'aria-label': 'Schedule, scrolls', 'data-day': opts.day ?? '',
  }, [h('span', 'brain-fade brain-fade-top'), tl, h('span', 'brain-fade brain-fade-bottom')]);
  scroller.setCssProps({ '--brain-hours': String(hoursOf(tl)) });   // Whole day grows the window to this many hours
  const fades = (): void => {
    scroller.toggleAttribute('data-above', scroller.scrollTop > 1);
    scroller.toggleAttribute('data-below', scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
  };
  scroller.addEventListener('scroll', fades, { passive: true });
  // Placed once it is drawn: a tile drawn narrow (hidden) is placed when it first shows. No layout, no observer (a test).
  // A redraw replaces the tile, and a replaced tile resizes to nothing: its observer sees that and lets go.
  const Observer = scroller.ownerDocument.defaultView?.ResizeObserver;
  if (!Observer) return scroller;
  let placed = false;
  new Observer((_entries, observer) => {
    if (!scroller.isConnected) {
      observer.disconnect();
      return;
    }
    if (!scroller.clientHeight) {
      placed = false;
      delete scroller.dataset.placed;
    } else if (!placed) {
      placed = true;
      scroller.dataset.placed = '';
      if (opts.scroll === undefined) atNow(scroller);
      else scroller.scrollTop = opts.scroll;
    }
    fades();
  }).observe(scroller);
  return scroller;
}

/** Scrolls the window so that the now-line stands an hour below its top edge. */
function atNow(scroller: HTMLElement): void {
  const line = scroller.querySelector<HTMLElement>('.brain-now-line');
  const tl = scroller.querySelector<HTMLElement>('.brain-timeline');
  if (!line || !tl || !scroller.clientHeight) return;
  const hour = tl.offsetHeight / hoursOf(tl);
  scroller.scrollTop += line.getBoundingClientRect().top - scroller.getBoundingClientRect().top - hour;
}

/** Whole day / Fit: grows the window to the whole day in place, and folds it back to the window at now. */
function wholeButton(scroller: HTMLElement): HTMLButtonElement {
  const button = h('button', 'brain-quiet', { 'aria-expanded': 'false', 'data-key': 'whole-day' }, ['Whole day']);
  const show = (whole: boolean): void => {
    button.setAttribute('aria-expanded', String(whole));
    button.textContent = whole ? 'Fit' : 'Whole day';
    if (whole) button.setAttribute('aria-label', `Fit to ${WINDOW_HOURS} hours`);
    else button.removeAttribute('aria-label');
  };
  show(scroller.classList.contains('brain-is-whole'));
  button.addEventListener('click', () => {
    const whole = scroller.classList.toggle('brain-is-whole');
    show(whole);
    if (whole) return;
    // Folding: the window can scroll only once it has shrunk, so wait out the height transition (none with reduced motion).
    const reduced = scroller.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      if (!scroller.classList.contains('brain-is-whole')) atNow(scroller);
    }, reduced ? 0 : 320);
  });
  return button;
}

/** The switch: it names the view it goes to. The host saves the choice and draws again. */
function switchButton(view: ScheduleView, actions: Actions): HTMLButtonElement {
  const to = view === 'large' ? 'compact' : 'large';
  const name = to === 'large' ? 'Large' : 'Compact';
  const button = h('button', 'brain-quiet', { 'aria-label': `Switch to the ${name} view`, 'data-key': 'schedule-switch' }, [name]);
  button.addEventListener('click', () => actions.scheduleView(to));
  return button;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
