import type { BacklogVM, GroupVM, InboxVM, ProjectCardVM, WaitingVM } from '../model/types.ts';
import type { Actions, ListEntry, ListSpec } from './actions.ts';
import { longDate, weekdayLong } from '../model/dates.ts';
import { h, link } from './dom.ts';
import { ring } from './marks.ts';
import { viewHead } from './header.ts';
import { bindItem, taskRow } from './task.ts';
import { openCard } from './popover.ts';
import { labelRow, mountPage } from './page.ts';
import { refreshLists, showAllButton } from './listModal.ts';
import { listItem } from './card.ts';

export function renderBacklog(root: HTMLElement, vm: BacklogVM, actions: Actions): void {
  const page = mountPage(root, 'backlog');
  page.append(backlogPart(root, vm, actions), waitingPart(vm, actions));
  // An open list modal (Show all on Someday) gets its list again, or closes.
  refreshLists(root, [somedaySpec(root, vm)]);
}

function backlogPart(root: HTMLElement, vm: BacklogVM, actions: Actions): HTMLElement {
  return h('section', 'brain-part', {}, [
    viewHead({ header: true, label: 'Backlog', title: `${vm.toSort} to sort`, undo: actions }),
    h('div', 'brain-grid', {}, [
      inboxTile(vm.inbox, actions),
      noDateTile(vm.noDate, actions),
      somedayTile(root, vm, actions),
    ]),
  ]);
}

function waitingPart(vm: BacklogVM, actions: Actions): HTMLElement {
  const items = vm.waiting.length > 0
    ? h('ul', 'brain-grid', {}, vm.waiting.map((w) => waitingTile(w, actions)))
    : h('p', 'brain-empty', {}, ['Not waiting on anyone.']);
  return h('section', 'brain-part', {}, [
    viewHead({
      header: true,
      label: 'Waiting',
      title: `${vm.waitingOpen} open`,
      figure: vm.nextChase ? { before: 'next chase', strong: vm.nextChase, rest: '' } : undefined,
    }),
    items,
  ]);
}

function inboxTile(inbox: InboxVM[], actions: Actions): HTMLElement {
  return h('section', 'brain-tile', {}, [
    h('h3', 'brain-label', {}, ['Inbox']),
    inbox.length > 0
      ? h('ul', 'brain-tasks', {}, inbox.map((item) => inboxRow(item, actions)))
      : h('p', 'brain-empty', {}, ['Nothing to sort.']),
  ]);
}

/** An inbox note: a dot, its title and how long ago it arrived. A note with no received time has no age. */
function inboxRow(item: InboxVM, actions: Actions): HTMLElement {
  return h('li', 'brain-task', { 'data-key': item.key }, [
    h('span', 'brain-lead', { 'aria-hidden': 'true' }, [h('span', 'brain-dot')]),
    h('div', 'brain-task-body', {}, [
      link(item.title, 'brain-task-text brain-link brain-stretch', () => actions.open(item.path)),
    ]),
    item.age ? h('span', 'brain-aside', {}, [item.age]) : null,
  ]);
}

function noDateTile(groups: GroupVM[], actions: Actions): HTMLElement {
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  return h('section', 'brain-tile', {}, [
    labelRow('No date', count),
    ...(groups.length > 0
      ? groups.map((g) => group(g, actions))
      : [h('p', 'brain-empty', {}, ['Every task has a date.'])]),
  ]);
}

function group(g: GroupVM, actions: Actions): HTMLElement {
  return h('div', 'brain-group', {}, [
    link(g.name, 'brain-group-name brain-link', () => actions.open(g.path)),
    h('ul', 'brain-tasks', {}, g.rows.map((r) => listItem(r, actions, true))),
  ]);
}

/** Someday: its newest five rows. Show all N sits in the label row when there are more; the list modal holds the rest. */
function somedayTile(root: HTMLElement, vm: BacklogVM, actions: Actions): HTMLElement {
  const cards = vm.someday;
  const head = labelRow('Someday', cards.length);
  if (cards.length > vm.somedayLimit) head.append(showAllButton(root, somedaySpec(root, vm), actions));
  const shown = cards.slice(0, vm.somedayLimit);
  return h('section', 'brain-tile', {}, [
    head,
    shown.length > 0
      ? h('ul', 'brain-tasks', {}, shown.map((c) => somedayRow(c, actions)))
      : h('p', 'brain-empty', {}, ['No someday projects.']),
  ]);
}

/** Backlog's Someday as a list: every card, newest first. It has no drag: a card opens through its card. */
function somedaySpec(root: HTMLElement, vm: BacklogVM): ListSpec {
  return {
    key: 'someday',
    title: 'Someday',
    noun: 'someday projects',
    count: vm.someday.length,
    entries: vm.someday.map((card): ListEntry => ({ kind: 'card', card })),
    drag: false,
    zones: root,
  };
}

/** A someday project as one row: its ring, its name and its count. It opens, and its menu sets the status. */
function somedayRow(card: ProjectCardVM, actions: Actions): HTMLElement {
  const title = link(card.title, 'brain-task-text brain-link brain-stretch', () => actions.open(card.path));
  title.setAttribute('tabindex', '-1');   // the row is the focus stop
  const row = h('li', 'brain-task', { 'data-state': card.status, 'data-menu': 'project', tabindex: '0', 'data-key': card.key }, [
    h('span', 'brain-lead', {}, [ring(card.done, card.total, 16, `${card.done} of ${card.total} done`)]),
    h('div', 'brain-task-body', {}, [title]),
    h('span', 'brain-aside', { 'aria-hidden': 'true' }, [`${card.done}/${card.total}`]),
  ]);
  bindItem(row, {
    open: () => actions.open(card.path),
    toggle: () => void actions.setNoteStatus(card.path, card.status === 'done' ? 'active' : 'done'),
    menu: (at) => openCard(row, at, { kind: 'project', title: card.title, path: card.path, status: card.status }, actions),
  });
  return row;
}

function waitingTile(w: WaitingVM, actions: Actions): HTMLElement {
  // The context names come without paths, so they are plain text, not links.
  const about: HTMLElement[] = [h('h3', 'brain-card-title', {}, [w.person])];
  if (w.context.length > 0) about.push(h('p', 'brain-meta', {}, w.context.map((c) => h('span', undefined, {}, [c]))));
  return h('li', 'brain-tile', { 'data-key': w.key }, [
    h('header', 'brain-card-head', {}, [h('div', undefined, {}, about), w.chase ? calendarPage(w) : null]),
    h('ul', 'brain-tasks', {}, w.rows.map((r) => taskRow(r, actions))),
  ]);
}

/** The chase date as a small calendar page, orange once it has passed. A tile with no chase date has none. */
function calendarPage(w: WaitingVM): HTMLElement {
  const when = `${weekdayLong(w.chase)} ${longDate(w.chase)}`;
  return h('div', w.late ? 'brain-cal brain-is-late' : 'brain-cal', {
    role: 'img',
    'aria-label': w.late ? `Chase date passed, ${when}` : `Chase ${when}`,
  }, [
    h('span', 'brain-label', {}, [w.calWeekday]),
    h('span', 'brain-cal-num', {}, [String(w.calDay)]),
  ]);
}
