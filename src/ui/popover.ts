// The cards: the planner card (a task row Brain plans), the states card (any other task row), the
// story card and the project card. A card is drawn outside the view
// (on the document's body, or in the list modal's container), so a re-render leaves it open. It keeps
// its own copy of the item: each write's new target replaces the old one, and its dates follow the
// same edits. One card is open at a time, and each pick waits for the one before it.
import type { PlanDates, RowTarget, RowVM, TaskState } from '../model/types.ts';
import type { Actions } from './actions.ts';
import {
  anyDayPressed, applyEdit, cardWeeks, dayChips, flipWeek, hasPlan, isDueDay, otherWeek, pickDay, pickNoDate, pickWeek,
  stepWeeks, toggleLater, weekChips, weekName,
} from '../model/plan.ts';
import type { CardWeeks, DateEdit, DayChipVM } from '../model/plan.ts';
import { h } from './dom.ts';
import { checkMark, planIcon, pointsText, projectIcon, stepIcon } from './marks.ts';
import { POINTS, pointsOf } from '../model/points.ts';
import type { Points } from '../model/points.ts';
import { refocus } from './focus.ts';

export type ProjectStatus = 'active' | 'paused' | 'someday' | 'done' | 'dropped';
export type CardSpec =
  | { kind: 'task'; title: string; target: RowTarget; state: TaskState; dates: PlanDates; repeats?: true }   // repeats: a repeating note, whose deadline no plan takes away
  | { kind: 'states'; title: string; target: RowTarget; state: TaskState }
  | { kind: 'story'; title: string; path: string; state: TaskState; dates?: PlanDates; points?: Points }   // dates: Brain may plan it, so its card has the plan picks; points: its Points row
  | { kind: 'project'; title: string; path: string; status: ProjectStatus };

type Point = { x: number; y: number };

const TASK_STATES: [TaskState, string][] = [
  ['todo', 'To do'], ['doing', 'Doing'], ['waiting', 'Waiting'], ['done', 'Done'], ['dropped', 'Dropped'],
];
const PROJECT_STATES: [ProjectStatus, string][] = [
  ['active', 'Active'], ['paused', 'Paused'], ['someday', 'Someday'], ['done', 'Done'], ['dropped', 'Dropped'],
];
// The attributes that find a pick's control again after the card is drawn.
const KEEP_ATTRS = ['data-day', 'data-week', 'data-pick', 'data-go', 'data-step', 'data-set', 'data-points'];

// The open card, if any. closeCard() closes it.
let current: { close(restore: boolean): void; isShown(): boolean } | undefined;

/** The card a row gets: progress → story (its note, with the plan picks when Brain may plan it); plan → task (a repeating row's too); else states. */
export function rowCard(row: RowVM): CardSpec {
  if (row.progress) {
    const points = pointsOf(row.points);
    return { kind: 'story', title: row.title, path: row.target.path, state: row.state, dates: row.plan, ...(points ? { points } : {}) };
  }
  if (row.plan) return { kind: 'task', title: row.title, target: row.target, state: row.state, dates: row.plan, ...(row.repeating ? { repeats: true } : {}) };
  return { kind: 'states', title: row.title, target: row.target, state: row.state };
}

/** Closes the open card, if any, focuses its item again (Escape's behaviour), and says whether there was one. */
export function closeCard(): boolean {
  if (!current) return false;
  // A card whose container has gone (its list modal closed) is not open, but its listeners still go.
  const shown = current.isShown();
  current.close(true);
  return shown;
}

/** Where a card goes (CSS pixels in the window): below the anchor when it fits, else above, else pinned to the bottom; left clamped. */
export function placeCard(
  anchor: { left: number; top: number; right: number; bottom: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
): { left: number; top: number } {
  let top: number;
  if (size.h <= view.h - anchor.bottom - 12) top = anchor.bottom + 4;
  else if (size.h <= anchor.top - 8) top = anchor.top - size.h - 4;
  else top = Math.max(8, view.h - size.h - 8);
  return { left: Math.max(8, Math.min(anchor.left, view.w - size.w - 8)), top };
}

/** today and the shown upcoming week, from the nearest [data-today] (its data-today, and data-week when set). */
export function cardContext(item: Element): { today: string; shown?: string } | undefined {
  const root = item.closest<HTMLElement>('[data-today]');
  if (!root) return undefined;
  const today = root.dataset.today ?? '';
  return root.dataset.week === undefined ? { today } : { today, shown: root.dataset.week };
}

/** What a card shows and changes: the spec's fixed parts, and the values each pick moves on. */
interface Live {
  spec: CardSpec;
  today: string;
  weeks?: CardWeeks;       // the planner card
  target?: RowTarget;      // a task or states card's row, kept as each write returns it
  dates?: PlanDates;       // the planner card's dates
  points?: Points;         // a story's points: its Points row's pressed pick
  state?: TaskState;       // task, states and story cards
  status?: ProjectStatus;  // project cards
}

function liveOf(spec: CardSpec, ctx: { today: string; shown?: string } | undefined): Live {
  const today = ctx?.today ?? '';
  switch (spec.kind) {
    case 'task':
      if (!ctx) return liveOf({ kind: 'states', title: spec.title, target: spec.target, state: spec.state }, ctx);
      return { spec, today, weeks: cardWeeks(ctx.today, ctx.shown), target: spec.target, dates: { ...spec.dates }, state: spec.state };
    case 'states':
      return { spec, today, target: spec.target, state: spec.state };
    case 'story': {
      const target: RowTarget = { kind: 'note', path: spec.path, state: spec.state };
      if (!ctx || !spec.dates) return { spec, today, target, state: spec.state, points: spec.points };
      return { spec, today, weeks: cardWeeks(ctx.today, ctx.shown), target, dates: { ...spec.dates }, state: spec.state, points: spec.points };
    }
    case 'project':
      return { spec, today, status: spec.status };
  }
}

/**
 * Opens the card for `item` at `at` (the pointer, or the menu key's point), closing any open card
 * first. A task card needs the week context (cardContext); without it the card is the states card.
 */
export function openCard(item: HTMLElement, at: Point, spec: CardSpec, actions: Actions): HTMLElement {
  closeCard();
  const live = liveOf(spec, cardContext(item));
  const repeats = repeatsOf(live.spec);
  const doc = item.ownerDocument;
  const el = h('div', 'brain-view brain-popover', {
    tabindex: '-1', role: 'dialog', 'data-kind': live.spec.kind, 'aria-label': cardLabel(live.spec),
  });
  // Paints the content: a card's size is its content's, so it is measured only once drawn.
  const paint = (): void => {
    while (el.firstChild) el.removeChild(el.firstChild);
    el.append(screenOf(live));
  };
  const win = doc.defaultView;
  const view = { w: win?.innerWidth ?? 1024, h: win?.innerHeight ?? 768 };
  el.style.setProperty('max-width', `${view.w - 16}px`);
  el.style.setProperty('max-height', `${view.h - 16}px`);
  (item.closest<HTMLElement>('.modal-container') ?? doc.body).append(el);
  paint();
  const anchor = item.classList.contains('brain-card')
    ? { left: at.x, right: at.x, top: at.y, bottom: at.y }
    : item.getBoundingClientRect();
  const pos = placeCard(anchor, { w: el.offsetWidth || 0, h: el.offsetHeight || 0 }, view);
  el.style.setProperty('left', `${pos.left}px`);
  el.style.setProperty('top', `${pos.top}px`);

  // Where the focus goes back to: the item, or, when a re-render has replaced it, the row with its key in its view.
  const viewRoot = item.closest<HTMLElement>('[data-today]');
  const key = item.getAttribute('data-key');
  const restoreFocus = (): void => {
    if (item.isConnected) focusNode(item);
    else if (viewRoot && key) refocus(viewRoot, key);
  };
  let closed = false;
  let queue: Promise<void> = Promise.resolve();
  const handle = {
    close(restore: boolean): void {
      if (closed) return;
      closed = true;
      if (current === handle) current = undefined;
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('focusin', onFocus, true);
      el.remove();
      if (restore) restoreFocus();
    },
    isShown: (): boolean => !closed && el.isConnected,
  };
  const onDown = (e: Event): void => {
    if (!el.contains(e.target as Node)) handle.close(false);
  };
  // Focus that goes elsewhere (a tab switched from the keyboard, the quick switcher) takes the card away too: the card would
  // float over the note that has the focus, and Escape typed there would not reach it.
  const onFocus = (e: Event): void => {
    if (!el.contains(e.target as Node)) handle.close(false);
  };
  current = handle;
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('focusin', onFocus, true);

  // Each write goes through the vault in turn: the target it returns is the next one's. A pick's writes (a plan and a
  // deadline) are one undo step.
  const writeEdits = async (edits: DateEdit[]): Promise<boolean> => {
    let ok = true;
    await actions.group(`restore the dates of “${live.spec.title}”`, async () => {
      for (const edit of edits) {
        const target = live.target;
        if (!target || !live.dates) {
          ok = false;
          return;
        }
        const next = edit.kind === 'plan'
          ? await actions.plan(target, edit.to)
          : await actions.due(target, edit.date);
        if (!next) {
          ok = false;
          return;
        }
        live.target = next;
        live.dates = applyEdit(live.dates, edit, live.today, repeats);
      }
    });
    return ok;
  };

  // A story's points: the note is written, and the card keeps the points it now has.
  const setPoints = async (pick: Points): Promise<boolean> => {
    const spec = live.spec;
    if (spec.kind !== 'story') return false;
    const next = live.points === pick ? null : pick;
    const written = await actions.points({ kind: 'note', path: spec.path, state: live.state ?? spec.state }, next);
    if (!written) return false;
    live.points = next ?? undefined;
    return true;
  };

  const setTo = async (value: string): Promise<boolean> => {
    const spec = live.spec;
    if (spec.kind === 'project') {
      if (value === live.status) return true;
      await actions.setNoteStatus(spec.path, value);
      live.status = value as ProjectStatus;
      return true;
    }
    if (value === live.state) return true;
    if (spec.kind === 'story') {
      await actions.setNoteStatus(spec.path, value === 'todo' ? 'open' : value);
      live.state = value as TaskState;
      return true;
    }
    if (!live.target) return false;
    const next = await actions.setState(live.target, value as TaskState);
    if (!next) return false;
    live.target = next;
    live.state = value as TaskState;
    return true;
  };

  // Focuses the control a pick was made on, found again by its data-*; else the mockup's first stop.
  const focusPick = (keep?: string): void => {
    const kept = keep ? el.querySelector<HTMLElement>(keep) : null;
    const next = kept && !kept.hasAttribute('disabled') ? kept
      : kept?.hasAttribute('data-step') ? el.querySelector<HTMLElement>('[data-step]:not([disabled])') : null;
    focusNode(next ?? firstStop(el));
  };
  const draw = (keep?: string): void => {
    paint();
    focusPick(keep);
  };

  // One pick at a time: each waits for the one before. `work` resolves false when the card must close. With
  // `closes`, a pick that goes through closes the card too, and the focus goes back to the item.
  const run = (keep: string | undefined, work: () => Promise<boolean>, closes = false): void => {
    queue = queue.then(async () => {
      if (closed) return;
      const ok = await work().catch((error: unknown) => {
        console.error(error);
        return false;
      });
      if (closed) return;
      if (!ok) handle.close(false);
      else if (closes) handle.close(true);
      else draw(keep);
    });
  };

  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    if (!b || !el.contains(b) || b.hasAttribute('disabled')) return;
    const keep = keepOf(b);
    if (b.hasAttribute('data-go')) {
      const go = b.getAttribute('data-go');
      run(keep, async () => {
        if (live.weeks) live.weeks = go === 'week' ? flipWeek(live.weeks) : toggleLater(live.weeks);
        return true;
      });
    } else if (b.hasAttribute('data-step')) {
      const dir = b.getAttribute('data-step') === '-1' ? -1 : 1;
      run(keep, async () => {
        if (live.weeks) live.weeks = stepWeeks(live.weeks, dir);
        return true;
      });
    } else if (b.hasAttribute('data-set')) {
      const value = b.getAttribute('data-set') ?? '';
      // A card that holds only states closes after its pick; a planner card, a task's or a story's with plan picks, stays open,
      // except a repeating note's Done: it completes an occurrence, which moves the dates the card shows.
      run(keep, () => setTo(value), !isPlanner(live.spec) || (repeats && value === 'done'));
    } else if (b.hasAttribute('data-points')) {
      // A story's Points: the pick sets them, and the pressed pick removes them. The card stays open, as a planner card does.
      const pick = POINTS.find((n) => String(n) === b.getAttribute('data-points'));
      if (pick !== undefined) run(keep, () => setPoints(pick));
    } else if (b.hasAttribute('data-day')) {
      const day = b.getAttribute('data-day') ?? '';
      run(keep, () => writeEdits(pickDay({ plan: live.dates?.scheduled, due: live.dates?.due }, day, live.today, repeats).edits));
    } else if (b.hasAttribute('data-week')) {
      const monday = b.getAttribute('data-week') ?? '';
      run(keep, () => writeEdits(pickWeek(live.dates ?? {}, monday, live.today, repeats)));
    } else if (b.getAttribute('data-pick') === 'week') {
      run(keep, () => writeEdits(pickWeek(live.dates ?? {}, live.weeks?.week ?? '', live.today, repeats)));
    } else if (b.getAttribute('data-pick') === 'none') {
      run(keep, () => writeEdits(pickNoDate(live.dates ?? {}, live.today, repeats)));
    }
  });

  // A right-click on a day sets the deadline there and keeps the do day; on the red day it removes the deadline, unless the note
  // repeats: its deadline stays, so the red day does nothing. On the do day itself the due edit makes it the deadline, as a
  // second click does. Left clicks keep their do, due, do cycle (a repeating note's only sets and clears its do day).
  el.addEventListener('contextmenu', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button[data-day]');
    if (!b || !el.contains(b)) return;
    e.preventDefault();
    e.stopPropagation();
    if (b.hasAttribute('disabled')) return;
    const day = b.getAttribute('data-day') ?? '';
    const red = isDueDay(live.dates ?? {}, day, repeats);
    if (red && repeats) return;
    run(keepOf(b), () => writeEdits([{ kind: 'due', date: red ? null : day }]));
  });

  el.addEventListener('keydown', (e) => {
    // A held Enter clicks its button on every repeat, writing again each time; the repeats are cancelled, as the check button's are.
    if (e.key === 'Enter' && e.repeat) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();   // the key ends at the card: a list modal beneath it must not close as well
      handle.close(true);
      return;
    }
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey);
    if (!back && !fwd) return;
    e.preventDefault();
    const stops = [...el.querySelectorAll<HTMLElement>('button:not([disabled])')];
    if (stops.length === 0) return;
    const at = stops.indexOf(e.target as HTMLElement);
    const n = stops.length;
    focusNode(stops[at < 0 ? (back ? n - 1 : 0) : (at + (back ? n - 1 : 1)) % n]);
  });

  focusPick();
  return el;
}

/** A planner card: a task's, or a story's when Brain may plan the story. */
function isPlanner(spec: CardSpec): boolean {
  return spec.kind === 'task' || (spec.kind === 'story' && spec.dates !== undefined);
}

/** A repeating note's card: its deadline stays whatever the plan (see isDueDay, applyEdit). */
function repeatsOf(spec: CardSpec): boolean {
  return spec.kind === 'task' && spec.repeats === true;
}

function cardLabel(spec: CardSpec): string {
  const what = isPlanner(spec) ? 'Plan' : 'State of';
  return `${what} “${spec.title}”`;
}

/** The attribute and value that find this control again, if it is a pick. */
function keepOf(b: HTMLElement): string | undefined {
  const attr = KEEP_ATTRS.find((name) => b.hasAttribute(name));
  return attr === undefined ? undefined : `[${attr}="${b.getAttribute(attr) ?? ''}"]`;
}

function focusNode(node: HTMLElement): void {
  node.focus?.({ preventScroll: true });
}

/** The mockup's focus stops: the pressed control, the any-day button or an enabled day, the checked state, else the card. */
function firstStop(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('[aria-pressed="true"]:not([disabled])')
    ?? el.querySelector<HTMLElement>('.brain-plan-main, .brain-plan-chip:not([disabled])')
    ?? el.querySelector<HTMLElement>('[aria-checked="true"]')
    ?? el;
}

function screenOf(live: Live): HTMLElement {
  const spec = live.spec;
  const title = h('p', 'brain-plan-title', {}, [spec.title]);
  const days: Node[] = live.weeks && live.dates ? taskBody(live.weeks, live.dates, live.today, repeatsOf(spec)) : [];
  // Done, dropped and waiting items aren't planned in Brain: the plan controls go, but keep their room, so the card stays its size.
  if (live.state !== 'todo' && live.state !== 'doing') days.forEach((node) => shelve(node as HTMLElement));
  // A story has its Points row between two separators, above the states; anything else has one separator above them.
  const between = spec.kind === 'story'
    ? [separator(), pointsRow(live.points), separator()]
    : [separator()];
  return h('div', 'brain-plan-screen', {}, [title, ...days, ...between, statesGroup(live)]);
}

function separator(): HTMLElement {
  return h('div', 'brain-plan-sep', { role: 'separator' });
}

/** A story's Points row: a label, then five equal picks, 1, 2, 3, 5 and 8; the pressed one is the story's points. */
function pointsRow(points: Points | undefined): HTMLElement {
  return h('div', 'brain-plan-points', { role: 'radiogroup', 'aria-label': 'Points' }, [
    h('span', 'brain-plan-points-label', {}, ['Points']),
    ...POINTS.map((n) => h('button', 'brain-plan-pick', {
      role: 'radio', 'aria-checked': String(n === points), 'data-points': String(n), 'aria-label': pointsText(n),
    }, [String(n)])),
  ]);
}

/**
 * Takes a plan control (or a group of them) out of use: invisible, out of the focus order and the page's
 * reading, and its buttons disabled. It stays in the layout.
 */
function shelve(el: HTMLElement): void {
  el.style.setProperty('visibility', 'hidden');
  el.setAttribute('aria-hidden', 'true');
  for (const b of [el, ...el.querySelectorAll<HTMLElement>('button')]) if (b.localName === 'button') b.setAttribute('disabled', '');
}

/** The planner card's body: the any-day button and the days, or the week scroller and No date yet; then the pair. */
function taskBody(w: CardWeeks, dates: PlanDates, today: string, repeating: boolean): Node[] {
  const body: Node[] = w.later
    ? [
      scroller(w, dates),
      h('button', 'brain-plan-go', { 'data-pick': 'none', 'aria-pressed': String(!hasPlan(dates)) }, [
        h('span', undefined, {}, ['No date yet']),
      ]),
    ]
    : [
      h('button', 'brain-plan-main', { 'data-pick': 'week', 'aria-pressed': String(anyDayPressed(w.week, dates)) }, [
        planIcon('cal'), h('span', undefined, {}, [`${weekName(w.week, w)}, any day`]),
      ]),
      h('div', 'brain-plan-days', { role: 'group', 'aria-label': `Days of ${weekName(w.week, w).toLowerCase()}` },
        dayChips(w.week, dates, today, repeating).map(dayButton)),
    ];
  const other = otherWeek(w);
  const pair = h('div', 'brain-plan-pair', {}, [
    h('button', 'brain-plan-go', { 'data-go': 'week' }, [
      planIcon(other.back ? 'back' : 'fwd'), h('span', undefined, {}, [other.name]),
    ]),
    h('button', 'brain-plan-go', { 'data-go': 'later', 'aria-pressed': String(w.later) }, [
      planIcon('clock'), h('span', undefined, {}, ['Later']),
    ]),
  ]);
  return [...body, pair];
}

function dayButton(d: DayChipVM): HTMLButtonElement {
  const attrs: Record<string, string> = { 'data-day': d.iso, 'aria-pressed': String(d.pressed), 'aria-label': d.label };
  if (d.today) attrs['aria-current'] = 'date';
  if (d.disabled) attrs.disabled = '';
  const cls = ['brain-plan-chip', d.today ? 'brain-is-today' : '', d.due ? 'brain-is-due' : ''].filter(Boolean).join(' ');
  return h('button', cls, attrs, [h('span', 'brain-label', {}, [d.letter]), h('span', 'brain-day-num', {}, [String(d.day)])]);
}

function scroller(w: CardWeeks, dates: PlanDates): HTMLElement {
  const earlier: Record<string, string> = { 'data-step': '-1', 'aria-label': 'Earlier weeks' };
  if (w.from <= w.first) earlier.disabled = '';
  return h('div', 'brain-plan-scroll', {}, [
    h('button', 'brain-step', earlier, [stepIcon('prev')]),
    ...weekChips(w, dates).map((c) => h('button', 'brain-plan-chip', {
      'data-week': c.start, 'aria-pressed': String(c.pressed), 'aria-label': c.aria,
    }, [h('span', 'brain-label', {}, [c.label]), h('span', 'brain-day-num', {}, [c.date])])),
    h('button', 'brain-step', { 'data-step': '1', 'aria-label': 'Later weeks' }, [stepIcon('next')]),
  ]);
}

/** The state row: five labelled marks; a project's are its icons. */
function statesGroup(live: Live): HTMLElement {
  if (live.spec.kind === 'project') {
    const current = live.status;
    return h('div', 'brain-plan-states', { role: 'radiogroup', 'aria-label': 'State' },
      PROJECT_STATES.map(([value, label]) => stateButton(value, label, value === current, projectIcon(value), false)));
  }
  const current = live.state;
  return h('div', 'brain-plan-states', { role: 'radiogroup', 'aria-label': 'State' },
    TASK_STATES.map(([value, label]) => stateButton(value, label, value === current, checkMark(), true)));
}

function stateButton(value: string, label: string, checked: boolean, mark: SVGSVGElement, withState: boolean): HTMLButtonElement {
  const attrs: Record<string, string> = { role: 'radio', 'aria-checked': String(checked), 'data-set': value };
  if (withState) attrs['data-state'] = value;
  return h('button', 'brain-state', attrs, [mark, h('span', undefined, {}, [label])]);
}
