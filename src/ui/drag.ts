import type { ArrangeColumn, Arrangement } from '../model/types.ts';
import { placeItem } from '../model/arrange.ts';
import { h } from './dom.ts';
import { openItemMenu } from './task.ts';

const MOVE_SLOP_PX = 4;
const EDGE_PX = 48;        // a lifted drag this close to the top or bottom of its view scrolls it
const MAX_SCROLL_PX = 16;  // per frame, at the edge or past it
const LONG_PRESS_MS = 500;
// A board's drop zones, and the ones that take the landing slot: an arrangeable column (Waiting is one, in both views).
const ZONE = '.brain-col';
const ARRANGEABLE = '.brain-col[data-arrange]';
// The inline styles a lift sets (its fixed place is the .brain-is-floating class); the end takes them all away again.
const LIFT_STYLES = ['left', 'top', 'width', 'translate'];

/**
 * Where a drag ended:
 * - a board column, with the slot's place among the column's other visible items (null in a column that
 *   keeps time order: Done);
 * - a day of the strip, or a week of Planned or due (any day of it), by its date or its Monday;
 * - To plan, which unplans.
 */
export type DropTarget =
  | { kind: 'column'; column: string; index: number | null }
  | { kind: 'day'; date: string }
  | { kind: 'week'; start: string }
  | { kind: 'unplan' };

export interface DragOpts {
  zones?: HTMLElement;                // where drop zones are looked for: the root by default
  carryTo?: HTMLElement;              // on lift the item moves here (out of a modal, onto the view); a cancelled drag puts it back
  onLift?(cancel: () => void): void;  // the drag lifted; cancel() ends it with no drop
  onEnd?(dropped: boolean): void;     // after a lifted drag, always, and before onDrop: true when onDrop is about to be called
}

// The stop of every press in progress, lifted or still waiting out a touch's long-press, with the element its drop lands in
// (its scope). cancelDrags stops the ones that land in a view, so one view's unload leaves another view's drag alone.
const live = new Map<() => void, Element>();

interface Press {
  id: number;
  x: number;
  y: number;
  item: Element;                                          // the row or card under the finger, whose menu a still long-press opens
  drag: HTMLElement;                                      // the .brain-draggable that moves
  touch: boolean;
  lifted: boolean;
  moved: boolean;
  height: number;                                         // the item's height at lift: the slot's
  home?: { parent: HTMLElement; next: Element | null };   // where a carried item came from
  zone: HTMLElement | null;                               // the drop zone under the pointer, tinted
  index: number | null;                                   // the slot's place, in an arrangeable column
  lastX: number;                                          // the pointer's last place: a scroll step moves the drag there again
  lastY: number;
  cx: number;                                             // the item's centre at lift, in viewport px
  cy: number;
  tx: number;                                             // the translate it has now
  ty: number;
  scroller: Element | null;                               // the view a lifted drag scrolls near its edges, found at lift
  frame?: number;                                         // the scroll step queued for the next frame, if any
  timer?: number;
  stop: () => void;                                       // ends this press (a cancelled drag): what cancelDrags calls
}

/** The Any day group a week zone without one gets while the slot is over it. */
interface Temp { zone: HTMLElement; group: HTMLElement; list: HTMLElement }

/**
 * Tints a drop zone, or clears its tint. A day pick also marks its strip, so styles.css can show only the day beneath as picked
 * while a drop is on it.
 */
function tintZone(zone: HTMLElement | null, on: boolean): void {
  zone?.classList.toggle('brain-is-drop', on);
  zone?.closest('.brain-picks')?.classList.toggle('brain-picks-drop', on);
}

/**
 * Dragging .brain-draggable items onto the drop zones inside `opts.zones` (the root by default), and Alt+↑/↓
 * on a focused item of an arrangeable column. The zones:
 * - a board column (.brain-col with data-column, or the mockup's data-states), anywhere along its height. One
 *   with data-arrange shows the landing slot, reports its place, and takes its own items. One without (Done)
 *   only tints, and doesn't take its own items. Waiting is a column in both views, so a pointer over it is a
 *   waiting drop, and Doing's places are its own list's rows only;
 * - a day ([data-drop="day"][data-date]), a week ([data-drop="week"][data-week]) and To plan
 *   ([data-drop="unplan"]). They take plannable rows only, and To plan takes nothing carried;
 * A repeating row drags to a column like any row: a drop on Done completes its occurrence.
 * Mouse and pen lift after a 4px move, so a click stays a click. Touch lifts after a 500ms press (moving
 * earlier is a scroll), and a still release then opens the item's menu. A lifted drag near the top or bottom of
 * the scrolling view scrolls it. A carried item moves into `carryTo` on lift; a drop leaves it there, and any
 * other end puts it back where it was.
 * onDrop gets the item and where it landed; the DOM is not moved for a board drop, the view re-renders from the vault.
 */
export function enableDrag(
  root: HTMLElement,
  onDrop: (item: HTMLElement, target: DropTarget) => void,
  opts: DragOpts = {},
): { cancel(): void } {
  const scope = opts.zones ?? root;
  // One slot per enableDrag: made once, moved to where it lands, and taken away when the drag ends.
  const slot = h('li', 'brain-drop-slot', { 'aria-hidden': 'true' });
  let press: Press | null = null;
  let swallowClick = false;
  let temp: Temp | null = null;

  const dropTemp = () => {
    temp?.group.remove();
    temp = null;
  };

  /**
   * A cancelled carry goes back where it came from. A re-render during the carry may have replaced the grid's
   * children: then it goes to the end of its list, or is left out when the list is gone or already holds the
   * redrawn copy.
   */
  const putBack = (drag: HTMLElement, { parent, next }: NonNullable<Press['home']>) => {
    const key = drag.getAttribute('data-key');
    if (!root.contains(parent) || (key !== null && [...parent.children].some((el) => el !== drag && el.getAttribute('data-key') === key))) {
      drag.remove();
    } else if (next?.parentNode === parent) parent.insertBefore(drag, next);
    else parent.append(drag);
  };

  // While lifted on touch the page must not scroll under the finger. The listener sits on the item, not on root: a lift can move
  // the item into carryTo, out of root, and a touch keeps sending its moves to the item it started on.
  const holdScroll = (e: Event) => e.preventDefault();
  // Escape cancels a lift on a board, wherever the focus is (a mouse drag leaves it on the body). A carry out of a modal is the
  // modal's: its Escape cancels the carry and keeps the modal open, so this leaves that key to it.
  const cancelOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.carryTo === undefined) finish(false);
  };
  // A scroll the drag didn't make (a wheel, a trackpad) moves the page under a still pointer: the item follows it there.
  const followScroll = () => {
    if (press?.lifted) follow(press, press.lastX, press.lastY);
  };

  const finish = (dropped: boolean) => {
    const p = press;
    if (!p) return;
    press = null;
    live.delete(p.stop);
    window.clearTimeout(p.timer);
    if (!p.lifted) return;
    try {
      if (p.frame !== undefined) root.ownerDocument.defaultView?.cancelAnimationFrame(p.frame);
      p.drag.classList.remove('brain-is-lifted', 'brain-is-floating');
      for (const prop of LIFT_STYLES) p.drag.style.removeProperty(prop);
      p.drag.removeEventListener('touchmove', holdScroll);
      root.ownerDocument.removeEventListener('keydown', cancelOnEscape);
      root.ownerDocument.removeEventListener('scroll', followScroll, { capture: true });
      tintZone(p.zone, false);
      dropTemp();
      slot.remove();
      slot.removeAttribute('data-label');
      if (p.home && !dropped) putBack(p.drag, p.home);   // a cancelled carry goes back
    } finally {
      opts.onEnd?.(dropped);   // however the end went: a host holding the view back must always hear of it
    }
  };

  const lift = (p: Press) => {
    const { drag } = p;
    p.lifted = true;
    p.height = drag.offsetHeight;
    const at = drag.getBoundingClientRect();
    p.cx = at.left + at.width / 2;
    p.cy = at.top + at.height / 2;
    p.tx = 0;
    p.ty = 0;
    if (opts.carryTo && drag.parentElement) {
      p.home = { parent: drag.parentElement, next: drag.nextElementSibling };
      opts.carryTo.append(drag);
    }
    // Fixed where it was: a fixed box at left and top 0 lands at the origin, so the old place is the difference. The class
    // fixes it, with no margin, before the origin is read.
    drag.classList.add('brain-is-floating');
    const origin = drag.getBoundingClientRect();
    drag.setCssStyles({ left: `${at.left - origin.left}px`, top: `${at.top - origin.top}px`, width: `${at.width}px` });
    drag.classList.add('brain-is-lifted');
    drag.addEventListener('touchmove', holdScroll, { passive: false });
    root.ownerDocument.addEventListener('keydown', cancelOnEscape);
    root.ownerDocument.addEventListener('scroll', followScroll, { capture: true, passive: true });   // a scroll doesn't bubble
    slot.setCssProps({ '--brain-slot': `${p.height}px` });
    slot.classList.toggle('brain-is-card', drag.classList.contains('brain-card'));
    root.setPointerCapture(p.id);
    p.scroller = scrollerOf(scope);
    edgeScroll(p);
    opts.onLift?.(() => {
      if (press === p) finish(false);
    });
  };

  /** The Any day group's list in a week zone: its own, else a temporary group made once for this zone. */
  const anyList = (zone: HTMLElement): HTMLElement => {
    const own = zone.querySelector<HTMLElement>('[data-any] > ul.brain-tasks');
    if (own) return own;
    if (temp === null || temp.zone !== zone) {
      dropTemp();
      const list = h('ul', 'brain-tasks');
      const group = h('div', 'brain-group', { 'data-any': '' }, [h('h4', 'brain-group-name', {}, ['Any day']), list]);
      (zone.querySelector<HTMLElement>('.brain-by-day') ?? zone).prepend(group);
      temp = { zone, group, list };
    }
    return temp.list;
  };

  /**
   * Puts the slot where the item would land in the zone under the pointer, and returns its place among the
   * column's other items. An arrangeable column: before the first item whose middle is below the pointer,
   * else at the end. A week zone: at the end of its Any day group, labelled. Anywhere else: taken away.
   */
  const placeSlot = (zone: HTMLElement | null, drag: HTMLElement, y: number): number | null => {
    const list = zone?.matches(ARRANGEABLE) ? zone.querySelector<HTMLElement>(':scope > .brain-col-items') : null;
    if (zone && list) {
      const items = itemsIn(list, drag);
      const at = items.findIndex((el) => middle(el) > y);
      const before = at >= 0 ? items[at] : null;
      if (slot.parentElement !== list || slot.nextElementSibling !== before) list.insertBefore(slot, before);
      slot.removeAttribute('data-label');
      return at >= 0 ? at : items.length;
    }
    if (zone?.dataset.drop === 'week') {
      const any = anyList(zone);
      slot.dataset.label = zone.dataset.slotLabel ?? '';
      if (slot.parentElement !== any || slot.nextElementSibling !== null) any.append(slot);
      return null;
    }
    slot.remove();
    slot.removeAttribute('data-label');
    return null;
  };

  /** The lifted item goes to the pointer at (x, y): the zone under it is tinted, and the slot goes where the item would land. */
  const follow = (p: Press, x: number, y: number) => {
    p.lastX = x;
    p.lastY = y;
    // Fixed inside a transformed ancestor, the item moves when the page scrolls. Rotate and scale turn about the centre, so the
    // rect's centre is the translate plus any such move: correct the translate so the centre stays with the pointer.
    const r = p.drag.getBoundingClientRect();
    p.tx += p.cx + (x - p.x) - (r.left + r.width / 2);
    p.ty += p.cy + (y - p.y) - (r.top + r.height / 2);
    p.drag.setCssStyles({ translate: `${p.tx}px ${p.ty}px` });
    const zone = zoneAt(scope, p.drag, x, y, opts.carryTo !== undefined);
    if (zone !== p.zone) {
      tintZone(p.zone, false);
      tintZone(zone, true);
      p.zone = zone;
      dropTemp();
    }
    p.index = placeSlot(zone, p.drag, y);
    edgeScroll(p);
  };

  /** Queues a scroll step for the next frame while the pointer is in the edge band of the view; a queued one goes once it has left. */
  const edgeScroll = (p: Press) => {
    const win = root.ownerDocument.defaultView;
    const step = win && p.scroller ? edgeStep(p.scroller, p.lastY, win) : 0;
    if (step === 0) {
      if (p.frame !== undefined) win?.cancelAnimationFrame(p.frame);
      p.frame = undefined;
    } else if (p.frame === undefined) p.frame = win?.requestAnimationFrame(() => scrollStep(p));
  };

  /** A frame's scroll: the view moves, then the drag follows the content that moved under the pointer. */
  const scrollStep = (p: Press) => {
    p.frame = undefined;
    const view = p.scroller;
    const win = root.ownerDocument.defaultView;
    if (press !== p || !view || !win) return;   // the drag has ended
    const step = edgeStep(view, p.lastY, win);
    if (step === 0) return;
    const before = view.scrollTop;
    view.scrollTop = before + step;
    if (view.scrollTop !== before) follow(p, p.lastX, p.lastY);   // a view at its end doesn't go on
  };

  root.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    const drag = target.closest<HTMLElement>('.brain-draggable');
    if (!drag || !root.contains(drag) || e.button !== 0 || target.closest('button')) return;
    finish(false);
    const p: Press = {
      id: e.pointerId, x: e.clientX, y: e.clientY,
      item: target.closest('[data-state][tabindex]') ?? drag, drag,
      touch: e.pointerType === 'touch', lifted: false, moved: false, height: 0, zone: null, index: null,
      lastX: e.clientX, lastY: e.clientY, scroller: null,
      cx: 0, cy: 0, tx: 0, ty: 0,
      stop: () => { if (press === p) finish(false); },
    };
    if (p.touch) p.timer = window.setTimeout(() => lift(p), LONG_PRESS_MS);
    press = p;
    // The scope, not the root: a drag carried out of a modal has its root in the modal, and its drop zones in the view.
    live.set(p.stop, scope);
  });

  root.addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.lifted) {
      if (Math.hypot(dx, dy) < MOVE_SLOP_PX) return;
      if (p.touch) {
        finish(false);   // a touch that moves before the long-press is a scroll
        return;
      }
      lift(p);
    }
    p.moved = true;
    follow(p, e.clientX, e.clientY);
  });

  root.addEventListener('pointerup', (e) => {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    if (!p.lifted) {
      finish(false);
      return;
    }
    // The click that follows a lift must not open the note.
    swallowClick = true;
    window.setTimeout(() => { swallowClick = false; });
    const target = p.moved ? dropTarget(p.zone, p.index) : undefined;
    finish(target !== undefined);
    if (target) onDrop(p.drag, target);
    else if (!p.moved) openItemMenu(p.item, { x: p.x, y: p.y });
  });

  root.addEventListener('pointercancel', () => finish(false));
  root.addEventListener('click', (e) => {
    if (!swallowClick) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Alt+↑ / Alt+↓ move a focused card or row one place in its arrangeable column, as a drop there would.
  root.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const item = e.target as HTMLElement;
    const list = item.parentElement;
    const col = list?.parentElement;
    // Only an item of the column itself: a row inside a card isn't one.
    if (!item.matches('.brain-draggable') || !list?.matches('.brain-col-items') || !col?.matches(ARRANGEABLE)) return;
    const column = columnKey(col);
    if (column === undefined) return;
    e.preventDefault();
    const items = itemsIn(list, null);
    const at = items.indexOf(item);
    const index = e.key === 'ArrowUp' ? at - 1 : at + 1;   // among the other items: one place up or down
    if (at >= 0 && index >= 0 && index < items.length) onDrop(item, { kind: 'column', column, index });
  });

  return { cancel: () => { if (press?.lifted) finish(false); } };
}

/**
 * Ends the drags in progress that land in `view` (every drag on the page, when no view is named), lifted or still waiting out
 * a touch's long-press: the document's listeners and the timer go, and a carried item goes back where it came from, as for a
 * cancel. A view calls it with its own element when it unloads, so no drag outlives the view it started in.
 */
export function cancelDrags(view?: Element): void {
  for (const [stop, scope] of [...live]) if (!view || view.contains(scope)) stop();
}

/** The element under the pointer, past the dragged item: a link in its meta keeps pointer events (styles.css), so it can be the topmost. */
function under(doc: Document, drag: HTMLElement, x: number, y: number): Element | null {
  const all = doc.elementsFromPoint?.(x, y) ?? [doc.elementFromPoint(x, y)];
  return all.find((el): el is Element => el !== null && !drag.contains(el)) ?? null;
}

/** The zone under the pointer that takes the dragged item, or null. `carrying` is set when the drag carries its item out of a modal. */
function zoneAt(scope: HTMLElement, drag: HTMLElement, x: number, y: number, carrying: boolean): HTMLElement | null {
  const zone = under(scope.ownerDocument, drag, x, y)?.closest<HTMLElement>(`${ZONE}, [data-drop]`) ?? null;
  if (!zone || !scope.contains(zone)) return null;
  if (zone.matches(ZONE)) {
    // Its own column takes an item only to arrange it: Done keeps time order.
    const takes = !zone.contains(drag) || zone.hasAttribute('data-arrange');
    return takes && columnKey(zone) !== undefined ? zone : null;
  }
  if (!drag.matches('li[data-plannable]')) return null;   // a day, a week and To plan take plannable rows and story cards
  if (zone.contains(drag)) return null;   // a planning zone refuses the row it already holds
  if (zone.dataset.drop === 'day') return zone.dataset.date ? zone : null;
  if (zone.dataset.drop === 'week') return zone.dataset.week ? zone : null;
  if (zone.dataset.drop === 'unplan') return carrying ? null : zone;
  return null;
}

/** The view a lifted drag scrolls: the nearest scrolling element from scope up, else the document's. */
function scrollerOf(scope: HTMLElement): Element | null {
  const doc = scope.ownerDocument;
  for (let el: Element | null = scope; el; el = el.parentElement) {
    const overflow = doc.defaultView?.getComputedStyle?.(el).overflowY ?? '';
    if (/^(auto|scroll|overlay)$/.test(overflow) && el.scrollHeight > el.clientHeight) return el;
  }
  return doc.scrollingElement;
}

/** A view's visible part, top and bottom in viewport pixels: the document's is the whole window's height. */
function visibleEdges(view: Element, win: Window): [number, number] {
  if (view === view.ownerDocument.scrollingElement) return [0, win.innerHeight];
  const r = view.getBoundingClientRect();
  return [Math.max(r.top, 0), Math.min(r.bottom, win.innerHeight)];
}

/**
 * The scroll step for a pointer at y near the top or bottom of a view: 0 outside the EDGE_PX band, else up to
 * MAX_SCROLL_PX, the most at the edge or past it. Negative scrolls up. Near both edges of a short view, the nearer.
 */
function edgeStep(view: Element, y: number, win: Window): number {
  const [top, bottom] = visibleEdges(view, win);
  const up = y - top;         // negative once past the top
  const down = bottom - y;    // negative once past the bottom
  const step = (distance: number) => Math.ceil(MAX_SCROLL_PX * Math.min(1, (EDGE_PX - distance) / EDGE_PX));
  if (up < EDGE_PX && up <= down) return -step(up);
  return down < EDGE_PX ? step(down) : 0;
}

/**
 * A column list's items: its children with a data-key that show, without the dragged one. A card carried out
 * of a modal may already be in the column (the board shows the first few): every element with its key is the
 * dragged item, so none of them counts as another place.
 */
function itemsIn(list: HTMLElement, drag: HTMLElement | null): HTMLElement[] {
  const key = drag?.getAttribute('data-key') ?? null;
  return [...list.children].filter(
    (el): el is HTMLElement => el !== drag && el.hasAttribute('data-key') && el.getAttribute('data-key') !== key && !(el as HTMLElement).hidden,
  );
}

function middle(el: Element): number {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
}

function dropTarget(zone: HTMLElement | null, index: number | null): DropTarget | undefined {
  if (!zone) return undefined;
  const { drop, date, week } = zone.dataset;
  if (drop === 'day' && date) return { kind: 'day', date };
  if (drop === 'week' && week) return { kind: 'week', start: week };
  if (drop === 'unplan') return { kind: 'unplan' };
  const column = columnKey(zone);
  return column === undefined ? undefined : { kind: 'column', column, index };
}

// data-column, or else the first word of the mockup's data-states: "doing waiting" drops as "doing".
function columnKey(col: HTMLElement): string | undefined {
  return col.dataset.column ?? col.dataset.states?.split(' ')[0];
}

/** A board's arrangeable columns: each one's item keys in the order shown, hidden items included. */
export type ShownLists = Partial<Record<ArrangeColumn, readonly string[]>>;

/**
 * The arrange: lists a board drop saves. The item with this key came from `from.column` at `from.index` (in
 * its shown list) and landed in `to.column` at `to.index` among the other items. `saved` is what the view
 * has saved so far.
 * - The target column, when it is arrangeable and the drop has a place, gets the item there: its whole shown
 *   order is saved, as the author placed it.
 * - On a move between columns, the column it left is saved only when it already has a saved list, and then
 *   as that list without the item. A column the author never arranged stays automatic. Done is never
 *   saved: it isn't in `shown`.
 * Undefined when nothing changes.
 */
export function dropLists(
  shown: ShownLists,
  saved: Arrangement,
  from: { column: string; index: number },
  key: string,
  to: { column: string; index: number | null },
): Arrangement | undefined {
  const lists: Arrangement = {};
  const move = from.column !== to.column;
  if (arrangeable(shown, to.column) && to.index !== null) {
    const keys = shown[to.column] ?? [];
    const placed = placeItem(keys, move ? null : from.index, key, to.index);
    if (move || placed.some((k, i) => k !== keys[i])) lists[to.column] = placed;
  }
  if (move && arrangeable(shown, from.column)) {
    const left = withoutItem(saved[from.column] ?? [], shown[from.column] ?? [], from.index);
    if (left) lists[from.column] = left;
  }
  return Object.keys(lists).length > 0 ? lists : undefined;
}

/**
 * The saved list without the item at `index` of the shown list, or undefined when the saved list does not hold
 * it. Items sharing a key are listed in turn, so the nth shown copy of a key is the nth listed one.
 */
function withoutItem(saved: readonly string[], shown: readonly string[], index: number): string[] | undefined {
  const key = shown[index];
  let copies = shown.slice(0, index).filter((k) => k === key).length;
  const at = saved.findIndex((k) => k === key && copies-- === 0);
  return at < 0 ? undefined : saved.filter((_, i) => i !== at);
}

function arrangeable(shown: ShownLists, column: string): column is ArrangeColumn {
  return Object.hasOwn(shown, column);
}
