// Stories in lists are cards: To plan's No date, the list modal, Backlog's No date and Planned or due. A card folds
// behind its chevron while planning, and its planner card offers the plan picks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { planParts, toPlanSpecs } from './plan.ts';
import { renderWeek } from './week.ts';
import { renderBacklog } from './backlog.ts';
import { renderListBody } from './listModal.ts';
import { openCard, rowCard } from './popover.ts';
import { buildWeek } from '../model/week.ts';
import { buildBacklog } from '../model/backlog.ts';
import { loadSample } from '../../test/sample.ts';
import type { RowVM, UpcomingWeekVM, VaultSnapshot } from '../model/types.ts';
import type { Actions } from './actions.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42; week 43 is Mon 19 to Sun 25 October
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function upcoming(s: VaultSnapshot, start: string): UpcomingWeekVM {
  const w = buildWeek(s, TODAY, { start });
  assert.ok(w.kind === 'upcoming', 'expected an upcoming week');
  return w;
}

const w43 = upcoming(loadSample(), '2026-10-19');
const fresh = (): HTMLElement => document.createElement('div');

/** The card drawn for a story title, anywhere under `within`. */
function cardOf(within: Element, title: string): HTMLElement {
  const card = [...within.querySelectorAll<HTMLElement>('li.brain-card[data-story]')]
    .find((el) => el.querySelector('.brain-card-title')?.textContent === title);
  assert.ok(card, `no story card ${title}`);
  return card;
}

const lineTitles = (card: Element) => [...card.querySelectorAll(':scope > .brain-story-lines > li .brain-task-text')].map((t) => t.textContent);

test('To plan: a story in No date is a card, under its group before the group\'s tasks, folded behind its chevron', () => {
  const plan = planParts(w43, fresh(), recorder().actions, true);
  const group = [...plan.querySelectorAll<HTMLElement>('.brain-group')].find((g) => g.querySelector('.brain-group-name')?.textContent === 'Renovate the kitchen');
  assert.ok(group);
  const items = [...group.querySelectorAll(':scope > .brain-tasks > li')].map((li) => li.getAttribute('data-story') !== null ? 'story' : 'task');
  assert.deepEqual(items, ['story', 'task']);
  const cabinets = cardOf(group, 'Order cabinets');
  assert.deepEqual([cabinets.tagName, cabinets.getAttribute('data-state'), cabinets.classList.contains('brain-card')], ['LI', 'todo', true]);
  assert.equal(cabinets.querySelector(':scope > .brain-card-head > .brain-peek')?.getAttribute('aria-expanded'), 'false');
  assert.equal(cabinets.querySelector(':scope > .brain-card-head > .brain-peek')?.getAttribute('aria-label'), 'Show the lines of Order cabinets');
  assert.equal(cabinets.querySelector(':scope > .brain-card-head .brain-card-title')?.textContent, 'Order cabinets');
  assert.equal(cabinets.querySelector(':scope > .brain-card-head .brain-meta')?.textContent, 'No date');
  assert.equal(cabinets.querySelector('.brain-progress > span[aria-hidden="true"]')?.textContent, '0/2');
  assert.equal(cabinets.querySelector('.brain-progress .brain-ring')?.getAttribute('aria-label'), '0 of 2 done');
  const lines = cabinets.querySelector(':scope > .brain-story-lines');
  assert.equal(lines?.hasAttribute('hidden'), true);
  assert.deepEqual(lineTitles(cabinets), ['Re-measure the corner under the sink', 'Pick the cabinet colour and handles']);
});

test('Planned or due: a story card is whole with its lines and no chevron while To plan is closed, and folded while it is open', () => {
  const closed = planParts(w43, fresh(), recorder().actions, false);
  const hostingClosed = cardOf(closed, "Choose hosting for Sam's site");
  assert.equal(hostingClosed.querySelector(':scope > .brain-card-head > .brain-peek')?.hasAttribute('hidden'), true);
  assert.equal(hostingClosed.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), false);
  assert.equal(hostingClosed.classList.contains('brain-draggable'), false);

  const open = planParts(w43, fresh(), recorder().actions, true);
  const hostingOpen = cardOf(open, "Choose hosting for Sam's site");
  assert.equal(hostingOpen.querySelector(':scope > .brain-card-head > .brain-peek')?.hasAttribute('hidden'), false);
  assert.equal(hostingOpen.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), true);
  assert.equal(hostingOpen.classList.contains('brain-draggable'), true);
  assert.equal(hostingOpen.hasAttribute('data-plannable'), true);
});

test('Planned or due: the chevron opens and folds the story\'s lines in place, and the toggle folds every card', () => {
  const root = fresh();
  renderWeek(root, w43, recorder().actions);
  const toggle = root.querySelector<HTMLElement>('.brain-plan-toggle');
  assert.ok(toggle);
  fire(toggle, 'click');   // To plan opens: the story cards fold
  const card = cardOf(root, "Choose hosting for Sam's site");
  assert.equal(card.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), true);
  fire(card.querySelector('.brain-peek')!, 'click');
  assert.equal(card.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), false);
  assert.equal(card.querySelector('.brain-peek')?.getAttribute('aria-expanded'), 'true');
  assert.equal(card.querySelector('.brain-peek')?.getAttribute('aria-label'), 'Hide the lines of Choose hosting for Sam\'s site');
  fire(card.querySelector('.brain-peek')!, 'click');
  assert.equal(card.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), true);
  fire(toggle, 'click');   // Done planning: whole again, no chevron
  assert.equal(card.querySelector(':scope > .brain-card-head > .brain-peek')?.hasAttribute('hidden'), true);
  assert.equal(card.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), false);
});

test('the list modal draws a story as the same card, and its search finds the card by its title', () => {
  const root = fresh();
  renderWeek(root, w43, recorder().actions);
  const spec = toPlanSpecs(w43, root, recorder().actions).find((s) => s.key === 'noDate');
  assert.ok(spec);
  const content = fresh();
  renderListBody(content, spec, recorder().actions, { close() {}, carry() {} });
  const card = cardOf(content, 'Order cabinets');
  assert.equal(card.querySelector(':scope > .brain-card-head > .brain-peek')?.getAttribute('aria-expanded'), 'false');
  assert.equal(content.querySelector('.brain-modal-grid')?.contains(card), true);
});

test('Backlog: No date draws its stories as folded cards with the peek', () => {
  const root = fresh();
  const { actions } = recorder();
  renderBacklog(root, buildBacklog(loadSample(), TODAY), actions);
  const section = [...root.querySelectorAll<HTMLElement>('.brain-grid > section.brain-tile')].find((s) => s.querySelector('.brain-label')?.textContent === 'No date');
  assert.ok(section);
  const card = cardOf(section, 'Order cabinets');
  assert.equal(card.querySelector(':scope > .brain-card-head > .brain-peek')?.getAttribute('aria-expanded'), 'false');
  assert.equal(card.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), true);
  assert.equal(card.classList.contains('brain-draggable'), false);
});

test('the planner card on a story offers the plan picks; a day pick plans the story and the card stays open', async () => {
  const { actions, calls } = recorder();
  const root = fresh();
  root.dataset.today = TODAY;
  root.dataset.week = w43.start;
  renderWeek(root, w43, actions);
  const card = cardOf(root, "Choose hosting for Sam's site");
  const row = w43.byDay.flatMap((g) => g.rows).find((r: RowVM) => r.title === "Choose hosting for Sam's site");
  assert.ok(row);
  const el = openCard(card, { x: 0, y: 0 }, rowCard(row), actions);
  assert.equal(el.getAttribute('data-kind'), 'story');
  assert.equal(el.querySelector('[data-pick="week"]') !== null, true);
  const day = el.querySelector<HTMLElement>('[data-day="2026-10-19"]');
  assert.ok(day);
  fire(day, 'click');
  await settle();
  assert.deepEqual(calls.filter((c) => c[0] === 'plan'), [['plan', { kind: 'note', path: row.target.path, state: 'doing' }, { day: '2026-10-19' }]]);
  assert.equal(el.isConnected, true);
});

test('a story with no plan gets the states card only, as before', () => {
  const row: RowVM = {
    key: 'x.md', target: { kind: 'note', path: 'x.md', state: 'waiting' }, title: 'Chase the quote', state: 'waiting',
    meta: [], repeating: false, draggable: false, ariaLabel: 'Chase the quote', progress: { done: 0, total: 1 }, lines: [],
  };
  assert.deepEqual(rowCard(row), { kind: 'story', title: 'Chase the quote', path: 'x.md', state: 'waiting', dates: undefined });
});

test('the header counts what is in the week, and how many are due, with the words in its title and accessible label', () => {
  const root = fresh();
  renderWeek(root, w43, recorder().actions);
  const counts = root.querySelector<HTMLElement>(':scope > .brain-view .brain-head .brain-counts');
  assert.ok(counts);
  assert.equal(counts.getAttribute('aria-label'), '5 in the week, 3 due');
  assert.equal(counts.getAttribute('title'), '5 in the week, 3 due');
  assert.equal(counts.querySelector('.brain-count-plan > b')?.textContent, '5');
  assert.equal(counts.querySelector('.brain-count-due > b')?.textContent, '3');
  assert.equal(counts.querySelector('.brain-count-plan > .brain-tally-icon') !== null, true);
  assert.equal(counts.querySelector('.brain-count-due > .brain-flag-icon') !== null, true);
});
