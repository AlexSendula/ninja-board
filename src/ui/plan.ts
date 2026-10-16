import type { GroupVM, RowVM, UpcomingWeekVM } from '../model/types.ts';
import type { Actions, ListEntry, ListSpec } from './actions.ts';
import type { DropTarget } from './drag.ts';
import type { Child } from './dom.ts';
import { h, link } from './dom.ts';
import { isoWeek } from '../model/dates.ts';
import { showAllButton } from './listModal.ts';
import { planIcon } from './marks.ts';
import { foldStory, listItem } from './card.ts';

/** Rows a To plan group draws before Show all N takes over. */
const SHOWN = 5;

/** The To plan tile's id, which the Plan this week pill controls. One upcoming week is drawn at a time. */
export function toPlanId(start: string): string {
  return `brain-to-plan-${start}`;
}

/**
 * An upcoming week under its strip: Planned or due, then To plan, which stays hidden until the Plan this
 * week pill opens it. The planned rows drag only while it is open.
 */
export function planParts(vm: UpcomingWeekVM, root: HTMLElement, actions: Actions, open: boolean): HTMLElement {
  return h('div', 'brain-plan', {}, [plannedTile(vm, actions, open), toPlanTile(vm, root, actions, open)]);
}

/** Planned or due: Any day first (the week plan), then each day. The tile is a drop zone for the whole week. */
function plannedTile(vm: UpcomingWeekVM, actions: Actions, open: boolean): HTMLElement {
  const labelId = `brain-planned-label-${vm.start}`;
  const groups = vm.byDay.map((g) => {
    const attrs: Record<string, string> = g.iso === undefined ? { 'data-any': '' } : {};
    return h('div', 'brain-group', attrs, [
      h('h4', 'brain-group-name', {}, [g.label]),
      plannedRows(g.rows, actions, open),
    ]);
  });
  return h('section', 'brain-tile brain-planned', {
    'data-drop': 'week',
    'data-week': vm.start,
    'data-slot-label': `Any day in week ${isoWeek(vm.start).week}`,
    'aria-labelledby': labelId,
  }, [
    h('div', 'brain-label-row', {}, [
      h('h3', 'brain-label', { id: labelId }, ['Planned or due']),
      h('span', 'brain-count', {}, [String(vm.planned)]),
    ]),
    h('div', 'brain-by-day', {}, groups),
    groups.length === 0 ? h('p', 'brain-empty', {}, ['Nothing planned or due']) : null,
  ]);
}

/**
 * Planned or due's rows. A story is a card, folded behind its chevron while To plan is open and whole while it is closed.
 * A plannable row drags only while To plan is open; the pill sets the class too.
 */
function plannedRows(rows: RowVM[], actions: Actions, open: boolean): HTMLUListElement {
  return h('ul', 'brain-tasks', {}, rows.map((row) => {
    const li = listItem(row, actions, open);
    if (!open) li.classList.remove('brain-draggable');
    return li;
  }));
}

/** To plan: hidden until the pill opens it. Still open this week and Due soon, then No date, each with its count. */
function toPlanTile(vm: UpcomingWeekVM, root: HTMLElement, actions: Actions, open: boolean): HTMLElement {
  const labelId = `brain-to-plan-label-${vm.start}`;
  const { open: stillOpen, dueSoon, noDate, count } = vm.toPlan;
  const specs = specsOf(vm, root, actions);
  const parts: Child[] = [
    h('div', 'brain-label-row', {}, [
      h('h3', 'brain-label', { id: labelId }, ['To plan']),
      h('span', 'brain-count', {}, [String(count)]),
    ]),
  ];
  if (stillOpen.length > 0) parts.push(subHead(specs.open, root, actions), rowList(stillOpen.slice(0, SHOWN), actions));
  if (dueSoon.length > 0) parts.push(subHead(specs.dueSoon, root, actions), rowList(dueSoon.slice(0, SHOWN), actions));
  if (noDate.length > 0) parts.push(subHead(specs.noDate, root, actions), ...undatedGroups(noDate, actions));
  if (count === 0) parts.push(h('p', 'brain-empty', {}, ['Nothing to plan']));
  const attrs: Record<string, string> = { id: toPlanId(vm.start), 'data-drop': 'unplan', 'aria-labelledby': labelId };
  if (!open) attrs.hidden = '';
  return h('section', 'brain-tile brain-to-plan', attrs, parts);
}

/** A To plan group's label row: its name, its count and, past 5, Show all N. */
function subHead(spec: ListSpec, root: HTMLElement, actions: Actions): HTMLElement {
  return h('div', 'brain-label-row', {}, [
    h('h4', 'brain-label', {}, [spec.title]),
    h('span', 'brain-count', {}, [String(spec.count)]),
    spec.count > SHOWN ? showAllButton(root, spec, actions) : null,
  ]);
}

/** No date's groups as Backlog draws them, cut after SHOWN rows in all; a group past the cut is left out. */
function undatedGroups(groups: GroupVM[], actions: Actions): HTMLElement[] {
  const out: HTMLElement[] = [];
  let left = SHOWN;
  for (const g of groups) {
    if (left === 0) break;
    const rows = g.rows.slice(0, left);
    left -= rows.length;
    out.push(h('div', 'brain-group', {}, [
      link(g.name, 'brain-group-name brain-link', () => actions.open(g.path)),
      h('ul', 'brain-tasks', {}, rows.map((row) => listItem(row, actions, true))),
    ]));
  }
  return out;
}

/** A To plan list's rows: a story is a card, folded behind its chevron, as the list modal draws it; any other row is a row. */
function rowList(rows: RowVM[], actions: Actions): HTMLUListElement {
  return h('ul', 'brain-tasks', {}, rows.map((row) => listItem(row, actions, true)));
}

/** The three To plan lists: Still open this week and Due soon as rows and story cards, No date as groups. */
function specsOf(vm: UpcomingWeekVM, root: HTMLElement, actions: Actions): Record<'open' | 'dueSoon' | 'noDate', ListSpec> {
  const { open, dueSoon, noDate } = vm.toPlan;
  const onDrop = dropOnPlan(vm, actions);
  return {
    open: {
      key: 'open', title: 'Still open this week', noun: 'tasks still open this week', count: open.length,
      entries: open.map((row): ListEntry => ({ kind: 'row', row })), drag: true, zones: root, onDrop,
    },
    dueSoon: {
      key: 'dueSoon', title: 'Due soon', noun: 'tasks due soon', count: dueSoon.length,
      entries: dueSoon.map((row): ListEntry => ({ kind: 'row', row })), drag: true, zones: root, onDrop,
    },
    noDate: {
      key: 'noDate', title: 'No date', noun: 'undated tasks',
      count: noDate.reduce((n, g) => n + g.rows.length, 0),
      entries: noDate.map((group): ListEntry => ({ kind: 'group', group })), drag: true, zones: root, onDrop,
    },
  };
}

/** The To plan lists, for the list modal and its Show all buttons, and for refreshLists. */
export function toPlanSpecs(vm: UpcomingWeekVM, root: HTMLElement, actions: Actions): ListSpec[] {
  const specs = specsOf(vm, root, actions);
  return [specs.open, specs.dueSoon, specs.noDate];
}

/**
 * The Plan this week pill: opens and closes To plan on the page it is in. A click writes nothing.
 * `controls` is toPlanId(vm.start), the To plan tile's id.
 */
export function planToggle(vm: UpcomingWeekVM, open: boolean, controls: string): HTMLButtonElement {
  const button = h('button', 'brain-plan-toggle', {
    'aria-expanded': String(open),
    'aria-controls': controls,
    'data-week': vm.start,
    'data-key': `plan-toggle:${vm.start}`,
  }, [planIcon('cal'), h('span', undefined, {}, [planLabel(open)])]);
  button.addEventListener('click', () => setPlanning(button, button.getAttribute('aria-expanded') !== 'true'));
  return button;
}

function planLabel(open: boolean): string {
  return open ? 'Done planning' : 'Plan this week';
}

/** Opens or closes To plan on this button's page, and makes the planned rows drag while it is open. */
function setPlanning(button: HTMLButtonElement, open: boolean): void {
  const page = button.closest('.brain-page');
  button.setAttribute('aria-expanded', String(open));
  const text = button.querySelector('span');
  if (text) text.textContent = planLabel(open);
  const toPlan = page?.querySelector(`[id="${button.getAttribute('aria-controls') ?? ''}"]`);
  if (toPlan) {
    if (open) toPlan.removeAttribute('hidden');
    else toPlan.setAttribute('hidden', '');
  }
  for (const row of page?.querySelectorAll('.brain-planned .brain-group > .brain-tasks > li[data-plannable]') ?? []) {
    if (open) row.classList.add('brain-draggable');
    else row.classList.remove('brain-draggable');
  }
  // A story card folds behind its chevron while To plan is open, every story card of the page: each opens folded, with
  // its label. While To plan is closed it is whole, with its lines and no chevron.
  for (const card of page?.querySelectorAll<HTMLElement>('.brain-plan li[data-story]') ?? []) {
    foldStory(card, false);
    const peek = card.querySelector('.brain-peek');
    if (peek) {
      if (open) peek.removeAttribute('hidden');
      else peek.setAttribute('hidden', '');
    }
    if (!open) card.querySelector('.brain-story-lines')?.removeAttribute('hidden');
  }
}

/** Whether this week's To plan is open. renderWeek reads it before the page is drawn again. */
export function planWasOpen(root: HTMLElement, start: string): boolean {
  return root.querySelector(`.brain-plan-toggle[aria-expanded="true"][data-week="${start}"]`) !== null;
}

/**
 * A drop while an upcoming week is shown. A row the model made plannable (`plan` set) dropped on a day of
 * the strip is planned on that date, and dropped on Planned or due it is planned for the week; a Planned or
 * due row dropped on To plan loses its date. A due date the plan leaves behind goes too (planDropsDue), but a
 * repeating note's never does.
 */
export function dropOnPlan(vm: UpcomingWeekVM, actions: Actions): (item: HTMLElement, target: DropTarget) => void {
  const planned = vm.byDay.flatMap((g) => g.rows);
  const toPlan = [...vm.toPlan.open, ...vm.toPlan.dueSoon, ...vm.toPlan.noDate.flatMap((g) => g.rows)];
  return (item, target) => {
    const inPlanned = planned.find((r) => r.key === item.dataset.key);
    const row = inPlanned ?? toPlan.find((r) => r.key === item.dataset.key);
    if (!row?.plan) return;   // a row with no plan (a waiting one) takes no drop
    if (target.kind === 'day') void actions.plan(row.target, { day: target.date });
    else if (target.kind === 'week') void actions.plan(row.target, { week: target.start });
    else if (target.kind === 'unplan' && inPlanned) void actions.plan(row.target, null);
  };
}
