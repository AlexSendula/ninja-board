// Folding stories in the upcoming weeks of the Week view (decided 2026-10-18): the story cards of an upcoming week (Planned or due, To plan and
// its Show all list modal) fold as this week's board does, by the one `collapsed` list the view hands to renderWeek, while planning too, and the
// week's page has the Collapse all / Expand all button. Backlog is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, nextFrame, recorder, same } from '../../test/ui.ts';   // first: it installs the DOM
import { renderWeek } from './week.ts';
import { renderBacklog } from './backlog.ts';
import { renderListBody } from './listModal.ts';
import { toPlanSpecs } from './plan.ts';
import { foldStory, listItem, unfoldedKeys } from './card.ts';
import { buildWeek } from '../model/week.ts';
import { buildBacklog } from '../model/backlog.ts';
import { buildSnapshot } from '../model/snapshot.ts';
import { weekPlanPath } from '../model/record.ts';
import { loadSample, readSample } from '../../test/sample.ts';
import type { PastWeekVM, UpcomingWeekVM, WeekVM } from '../model/types.ts';
import type { ListSpec } from './actions.ts';

const TODAY = '2026-10-13';
const HOSTING = "Choose hosting for Sam's site";
const CONTRACTOR = 'Choose a contractor';
const CABINETS = 'Order cabinets';
const sample = loadSample();
const w41Plan = readSample().find((n) => n.path === weekPlanPath('2026-10-05'));

const week = (start?: string): WeekVM => buildWeek(sample, TODAY, { start, plan: start === '2026-10-05' ? w41Plan : undefined });
const upcoming = (start = '2026-10-19'): UpcomingWeekVM => {
  const w = week(start);
  assert.ok(w.kind === 'upcoming', 'expected an upcoming week');
  return w;
};
const past = (start = '2026-10-05'): PastWeekVM => {
  const w = week(start);
  assert.ok(w.kind === 'past', 'expected a past week');
  return w;
};

function draw(model: WeekVM, opts: { collapsed?: string[]; actions?: ReturnType<typeof recorder>['actions']; root?: HTMLElement } = {}): HTMLElement {
  const root = opts.root ?? document.createElement('div');
  renderWeek(root, model, opts.actions ?? recorder().actions, { collapsed: opts.collapsed ?? [] });
  return root;
}

/** The story card drawn for this title, wherever it is on the page. */
function card(within: Element, title: string): HTMLElement {
  const found = [...within.querySelectorAll<HTMLElement>('li.brain-card')].find((el) => el.querySelector('.brain-card-title')?.textContent === title);
  assert.ok(found, `no story card ${title}`);
  return found;
}
const peekOf = (el: Element) => el.querySelector<HTMLElement>(':scope > .brain-card-head > .brain-peek')!;
const linesOf = (el: Element) => el.querySelector<HTMLElement>(':scope > .brain-story-lines');
const foldAll = (root: Element) => root.querySelector<HTMLElement>('.brain-fold-all');
const stateOf = (el: Element) => [peekOf(el).getAttribute('aria-expanded'), linesOf(el)?.hasAttribute('hidden')];
const OPEN = ['true', false];
const FOLDED = ['false', true];
const label = (button: Element | null) => button?.getAttribute('aria-label');
const toggleOf = (root: Element) => root.querySelector<HTMLElement>('.brain-plan-toggle')!;

// ---------- Upcoming weeks ----------

test('an upcoming week\'s story cards (Planned or due, and To plan) are foldable cards that fold by the shared list, open by default', () => {
  const open = draw(upcoming());
  for (const title of [HOSTING, CONTRACTOR, CABINETS]) {
    const el = card(open, title);
    assert.equal(el.classList.contains('brain-foldable'), true, title);
    assert.equal(el.dataset.foldName, title);
    assert.deepEqual(stateOf(el), OPEN, title);
    assert.equal(peekOf(el).hasAttribute('hidden'), false, title);   // the chevron is never taken out: the CSS shows it on hover, on focus, and on touch
  }
  const folded = draw(upcoming(), { collapsed: [HOSTING, CABINETS, 'A story that left the week'] });
  assert.deepEqual([HOSTING, CONTRACTOR, CABINETS].map((title) => stateOf(card(folded, title))), [FOLDED, OPEN, FOLDED]);
  assert.equal(peekOf(card(folded, HOSTING)).getAttribute('aria-label'), `Show the lines of ${HOSTING}`);
  assert.equal(folded.querySelectorAll('.brain-planned li[data-story]').length, 2);   // still the list cards, with their ring and count
  assert.equal(card(folded, HOSTING).querySelector('.brain-card-head .brain-progress') !== null, true);
});

test('an upcoming week\'s chevron folds the card in place and saves; the page is not drawn again', () => {
  const { actions, calls } = recorder();
  const root = draw(upcoming(), { actions });
  const page = root.querySelector('.brain-page');
  const hosting = card(root, HOSTING);
  const peek = peekOf(hosting);
  const lines = linesOf(hosting);
  assert.equal(hosting.querySelector(':scope > .brain-card-head')?.firstElementChild, peek);
  assert.equal(peek.getAttribute('data-key'), `fold-story:${hosting.dataset.key}`);
  fire(peek, 'click');
  same(root.querySelector('.brain-page'), page, 'the page was drawn again');
  same(card(root, HOSTING), hosting);
  same(linesOf(hosting), lines);
  assert.deepEqual(stateOf(hosting), FOLDED);
  assert.deepEqual(stateOf(card(root, CONTRACTOR)), OPEN);
  fire(peek, 'click');
  assert.deepEqual(stateOf(hosting), OPEN);
  assert.deepEqual(calls, [['foldStories', [HOSTING], true], ['foldStories', [HOSTING], false]]);
  assert.equal(calls.some((c) => c[0] === 'open' || c[0] === 'setNoteStatus'), false);   // the chevron is no click on the card
});

test('the icon ends the Planned or due heading row, with the board\'s label, key and icon, and folds every story card of the page', () => {
  const { actions, calls } = recorder();
  const root = draw(upcoming(), { actions });
  const row = root.querySelector('.brain-planned > .brain-label-row')!;
  const button = foldAll(root)!;
  assert.equal(row.lastElementChild, button);
  assert.equal(row.querySelectorAll('.brain-fold-all').length, 1);
  assert.equal(root.querySelectorAll('.brain-fold-all').length, 1);   // To plan has no icon of its own
  assert.deepEqual(
    [button.localName, button.className, button.getAttribute('data-key'), label(button), button.getAttribute('title'), button.querySelector('svg')?.getAttribute('class')],
    ['button', 'brain-quiet brain-fold-all', 'fold-all', 'Collapse all stories', 'Collapse all stories', 'brain-fold-icon'],
  );
  const page = root.querySelector('.brain-page');
  fire(button, 'click');
  same(root.querySelector('.brain-page'), page, 'the page was drawn again');
  // To plan is closed: its card is not on show, so Collapse all leaves it and does not save its name.
  assert.deepEqual([HOSTING, CONTRACTOR, CABINETS].map((title) => stateOf(card(root, title))), [FOLDED, FOLDED, OPEN]);
  assert.deepEqual([label(button), button.querySelectorAll('svg > rect').length], ['Expand all stories', 2]);   // every card that shows is folded
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], true]]);
});

test('the icon reads Expand all once every card that shows is folded, and a click on it opens them all', () => {
  const { actions, calls } = recorder();
  const root = draw(upcoming(), { actions, collapsed: [HOSTING, CONTRACTOR] });   // To plan is closed: Order cabinets is not on show
  const button = foldAll(root)!;
  assert.deepEqual([label(button), button.getAttribute('title'), button.querySelectorAll('svg > rect').length], ['Expand all stories', 'Expand all stories', 2]);
  fire(button, 'click');
  assert.deepEqual([HOSTING, CONTRACTOR].map((title) => stateOf(card(root, title))), [OPEN, OPEN]);
  assert.equal(label(button), 'Collapse all stories');
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], false]]);
  // The chevron brings the icon in line, in place: folding the last open card turns it into Expand all.
  fire(peekOf(card(root, HOSTING)), 'click');
  assert.equal(label(button), 'Collapse all stories');
  fire(peekOf(card(root, CONTRACTOR)), 'click');
  same(foldAll(root), button);
  assert.equal(label(button), 'Expand all stories');
});

test('a week with no story card has no icon, and a week whose only stories are in To plan has it hidden until To plan opens', () => {
  assert.equal(foldAll(draw(upcoming('2026-10-26')))?.hasAttribute('hidden'), true);   // week 44: Order cabinets is in To plan alone
  const root = draw(upcoming('2026-10-26'));
  const button = foldAll(root)!;
  assert.equal(button.hasAttribute('hidden'), true);
  fire(toggleOf(root), 'click');
  assert.equal(button.hasAttribute('hidden'), false);
  fire(toggleOf(root), 'click');
  assert.equal(button.hasAttribute('hidden'), true);
  const empty = buildWeek(buildSnapshot([]), TODAY, { start: '2026-10-19' });
  absent(foldAll(draw(empty)));
  assert.equal(draw(empty).querySelectorAll('.brain-peek').length, 0);
});

// ---------- Planning ----------

test('opening and closing planning leaves every card as the list says: it folds nothing and opens nothing', () => {
  const { actions, calls } = recorder();
  const root = draw(upcoming(), { actions, collapsed: [HOSTING] });
  const states = () => [HOSTING, CONTRACTOR, CABINETS].map((title) => stateOf(card(root, title)));
  const before = [FOLDED, OPEN, OPEN];
  assert.deepEqual(states(), before);
  fire(toggleOf(root), 'click');   // Plan this week
  assert.deepEqual(states(), before);
  assert.equal([HOSTING, CONTRACTOR, CABINETS].every((title) => !peekOf(card(root, title)).hasAttribute('hidden')), true);
  fire(peekOf(card(root, CONTRACTOR)), 'click');   // the reader folds one while planning
  assert.deepEqual(states(), [FOLDED, FOLDED, OPEN]);
  fire(toggleOf(root), 'click');   // Done planning
  assert.deepEqual(states(), [FOLDED, FOLDED, OPEN]);
  fire(peekOf(card(root, HOSTING)), 'click');
  fire(toggleOf(root), 'click');
  assert.deepEqual(states(), [OPEN, FOLDED, OPEN]);
  assert.deepEqual(calls, [['foldStories', [CONTRACTOR], true], ['foldStories', [HOSTING], false]]);   // planning saved nothing
  // It still shows the To plan tile and makes the planned cards draggable.
  const toPlan = root.querySelector('.brain-to-plan')!;
  assert.deepEqual([toPlan.hasAttribute('hidden'), card(root, HOSTING).classList.contains('brain-draggable')], [false, true]);
  fire(toggleOf(root), 'click');
  assert.deepEqual([toPlan.hasAttribute('hidden'), card(root, HOSTING).classList.contains('brain-draggable')], [true, false]);
});

test('while planning the icon covers both tiles; closed again it covers Planned or due, and it follows the cards that show', () => {
  const { actions, calls } = recorder();
  const root = draw(upcoming(), { actions });
  const button = foldAll(root)!;
  fire(toggleOf(root), 'click');   // To plan shows
  fire(button, 'click');
  assert.deepEqual([HOSTING, CONTRACTOR, CABINETS].map((title) => stateOf(card(root, title))), [FOLDED, FOLDED, FOLDED]);
  assert.equal(label(button), 'Expand all stories');
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR, CABINETS], true]]);
  fire(toggleOf(root), 'click');   // closed: Planned or due is folded too
  assert.equal(label(button), 'Expand all stories');
  fire(button, 'click');
  assert.deepEqual(calls.at(-1), ['foldStories', [HOSTING, CONTRACTOR], false]);   // only what shows; Order cabinets stays folded
  assert.deepEqual([HOSTING, CONTRACTOR, CABINETS].map((title) => stateOf(card(root, title))), [OPEN, OPEN, FOLDED]);
  fire(toggleOf(root), 'click');   // the folded To plan card shows again: the icon says Collapse all
  assert.equal(label(button), 'Collapse all stories');
});

test('Collapse all and Expand all fold every card of a story that shows, the same story in the closed To plan tile too', () => {
  const { actions, calls } = recorder();
  const vm = upcoming();
  const hosting = vm.toPlan.open.find((r) => r.title === HOSTING)!;
  // The hosting story is Planned or due and also still open: put it among the first five of Still open, so To plan draws its card.
  const both: UpcomingWeekVM = { ...vm, toPlan: { ...vm.toPlan, open: [hosting, ...vm.toPlan.open.filter((r) => r !== hosting)] } };
  const root = draw(both, { actions });
  const hostings = () => [...root.querySelectorAll<HTMLElement>('li.brain-card')].filter((el) => el.dataset.foldName === HOSTING);
  const button = foldAll(root)!;
  assert.equal(hostings().length, 2);
  fire(button, 'click');   // To plan is closed
  fire(toggleOf(root), 'click');
  assert.deepEqual(hostings().map(stateOf), [FOLDED, FOLDED]);   // the card in To plan is folded as the one in Planned or due is
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], true]]);
  assert.equal(label(button), 'Collapse all stories');   // Order cabinets, in To plan alone, is open
  fire(toggleOf(root), 'click');
  fire(button, 'click');   // Expand all
  fire(toggleOf(root), 'click');
  assert.deepEqual(hostings().map(stateOf), [OPEN, OPEN]);
  assert.deepEqual(calls.at(-1), ['foldStories', [HOSTING, CONTRACTOR], false]);
});

test('To plan\'s cards fold by the shared list too, and a card the list folds stays folded when To plan opens', () => {
  const root = draw(upcoming(), { collapsed: [CABINETS] });
  const cabinets = card(root.querySelector('.brain-to-plan')!, CABINETS);
  assert.deepEqual(stateOf(cabinets), FOLDED);
  assert.equal(cabinets.classList.contains('brain-foldable'), true);
  fire(toggleOf(root), 'click');
  assert.deepEqual(stateOf(cabinets), FOLDED);
});

test('the Show all list modal folds its cards by the shared list, and a fold in it folds the same story on the page behind it', () => {
  const { actions, calls } = recorder();
  const vm = upcoming();
  const root = draw(vm, { actions });
  const modal = (key: 'open' | 'noDate', collapsed: string[]) => {
    const spec = toPlanSpecs(vm, root, actions, new Set(collapsed)).find((s) => s.key === key);
    assert.ok(spec);
    const content = document.createElement('div');
    renderListBody(content, spec, actions, { close() {}, carry() {} });
    return content;
  };
  // No date holds Order cabinets in a group; Still open holds the hosting story, which Planned or due has too.
  assert.deepEqual(stateOf(card(modal('noDate', []), CABINETS)), OPEN);
  assert.deepEqual(stateOf(card(modal('noDate', [CABINETS]), CABINETS)), FOLDED);
  assert.deepEqual(stateOf(card(modal('open', [HOSTING]), HOSTING)), FOLDED);
  const content = modal('open', []);
  const inModal = card(content, HOSTING);
  assert.equal(inModal.classList.contains('brain-foldable'), true);
  assert.equal(inModal.dataset.foldName, HOSTING);
  const onPage = card(root.querySelector('.brain-planned')!, HOSTING);
  const button = foldAll(root)!;
  fire(peekOf(inModal), 'click');
  assert.deepEqual(stateOf(inModal), FOLDED);
  assert.deepEqual(stateOf(onPage), FOLDED);   // the page behind the modal
  assert.deepEqual(stateOf(card(root, CONTRACTOR)), OPEN);
  assert.equal(label(button), 'Collapse all stories');
  assert.deepEqual(calls, [['foldStories', [HOSTING], true]]);   // saved once
  fire(peekOf(card(modal('open', [HOSTING]), HOSTING)), 'click');   // a second modal, drawn folded, opens it
  assert.deepEqual(stateOf(onPage), OPEN);
  assert.deepEqual(calls.at(-1), ['foldStories', [HOSTING], false]);
});

/** A recorder that also keeps the list specs the page hands to showAll, as the plugin hands them to its modal. */
function withSpecs() {
  const { actions, calls } = recorder();
  const specs: ListSpec[] = [];
  const spied = { ...actions, showAll: (spec: ListSpec) => (specs.push(spec), actions.showAll(spec)) };
  return { actions: spied, calls, specs };
}
/** Clicks the page's Show all button of this list, and draws the modal's body from the spec it handed over. */
function showAll(root: HTMLElement, specs: ListSpec[], actions: ReturnType<typeof recorder>['actions']): HTMLElement {
  fire(root.querySelector<HTMLElement>('[data-key="show-all:open"]')!, 'click');
  const content = document.createElement('div');
  renderListBody(content, specs.at(-1)!, actions, { close() {}, carry() {} });
  return content;
}

test('the Show all list modal draws the folds the page has now, not the ones it was drawn with', () => {
  const { actions, calls, specs } = withSpecs();
  const root = draw(upcoming(), { actions });   // nothing is folded when the page is drawn
  assert.deepEqual(stateOf(card(showAll(root, specs, actions), HOSTING)), OPEN);
  fire(peekOf(card(root.querySelector('.brain-planned')!, HOSTING)), 'click');   // folded on the page, in place: no redraw
  assert.deepEqual(stateOf(card(showAll(root, specs, actions), HOSTING)), FOLDED);
  fire(peekOf(card(root.querySelector('.brain-planned')!, HOSTING)), 'click');   // and open again
  assert.deepEqual(stateOf(card(showAll(root, specs, actions), HOSTING)), OPEN);
  fire(foldAll(root)!, 'click');   // Collapse all
  assert.deepEqual(stateOf(card(showAll(root, specs, actions), HOSTING)), FOLDED);
  fire(foldAll(root)!, 'click');   // Expand all
  assert.deepEqual(stateOf(card(showAll(root, specs, actions), HOSTING)), OPEN);
  assert.deepEqual(calls.filter((c) => c[0] === 'foldStories').length, 4);   // each fold saved once
});

test('a fold made in the Show all list modal is still there when the modal is opened again', () => {
  const { actions, calls, specs } = withSpecs();
  const root = draw(upcoming(), { actions });
  const first = showAll(root, specs, actions);
  fire(peekOf(card(first, HOSTING)), 'click');
  assert.deepEqual(stateOf(card(root.querySelector('.brain-planned')!, HOSTING)), FOLDED);   // the page behind it
  assert.deepEqual(stateOf(card(showAll(root, specs, actions), HOSTING)), FOLDED);
  fire(peekOf(card(showAll(root, specs, actions), HOSTING)), 'click');
  assert.deepEqual(stateOf(card(showAll(root, specs, actions), HOSTING)), OPEN);
  assert.deepEqual(calls.filter((c) => c[0] === 'foldStories'), [['foldStories', [HOSTING], true], ['foldStories', [HOSTING], false]]);
});

// ---------- Backlog ----------

test('Backlog is unchanged: its No date cards fold behind an always-shown chevron, closed, in the planner\'s session; nothing is saved', () => {
  const { actions, calls } = recorder();
  const root = document.createElement('div');
  renderBacklog(root, buildBacklog(sample, TODAY), actions);
  const cabinets = card(root, CABINETS);
  assert.equal(cabinets.classList.contains('brain-foldable'), false);
  assert.equal('foldName' in cabinets.dataset, false);
  assert.equal(root.querySelectorAll('.brain-foldable, .brain-fold-all').length, 0);
  const peek = peekOf(cabinets);
  assert.deepEqual([peek.hasAttribute('hidden'), ...stateOf(cabinets)], [false, 'false', true]);
  assert.equal(peek.hasAttribute('data-key'), false);
  const key = cabinets.dataset.key!;
  try {
    fire(peek, 'click');
    assert.deepEqual(stateOf(cabinets), OPEN);
    assert.deepEqual(unfoldedKeys(), [key]);   // the planner's own session list, as before
    fire(peek, 'click');
    assert.deepEqual(stateOf(cabinets), FOLDED);
    assert.deepEqual(unfoldedKeys(), []);
  } finally {
    foldStory(cabinets, false);
  }
  assert.deepEqual(calls, []);
});

test('a list without the Week view\'s list folds as the planner does, and a list card without a fold too', () => {
  const { actions, calls } = recorder();
  const vm = upcoming();
  const root = draw(vm, { actions });
  const spec = toPlanSpecs(vm, root, actions).find((s) => s.key === 'noDate')!;
  const content = document.createElement('div');
  renderListBody(content, { ...spec, collapsed: undefined }, actions, { close() {}, carry() {} });
  const cabinets = card(content, CABINETS);
  assert.equal(cabinets.classList.contains('brain-foldable'), false);
  assert.deepEqual([peekOf(cabinets).hasAttribute('hidden'), ...stateOf(cabinets)], [false, 'false', true]);
  const row = vm.toPlan.open.find((r) => r.title === HOSTING)!;
  const planning = listItem(row, actions, true);
  assert.deepEqual([planning.classList.contains('brain-foldable'), peekOf(planning).hasAttribute('hidden'), ...stateOf(planning)], [false, false, 'false', true]);
  const reading = listItem(row, actions, false);
  assert.deepEqual([reading.classList.contains('brain-foldable'), peekOf(reading).hasAttribute('hidden'), ...stateOf(reading)], [false, true, 'false', false]);
  try {
    fire(peekOf(cabinets), 'click');
    assert.deepEqual(stateOf(cabinets), OPEN);
  } finally {
    foldStory(cabinets, false);
  }
  assert.deepEqual(calls, []);
});

// ---------- Keep hover ----------

/** The element as the pointer is on it: matches(':hover') says so, as a browser would, and linkedom cannot. */
function hover(el: Element): void {
  Object.assign(el, { matches: (selector: string) => selector === ':hover' });
}
const kept = (root: Element) => [...root.querySelectorAll('.brain-hover-kept')].map((el) => el.getAttribute('data-key'));

test('a redraw of an upcoming week keeps what the pointer is on: the card, its chevron and the icon', () => {
  const vm = upcoming();
  const root = draw(vm);
  const hosting = card(root, HOSTING);
  hover(hosting);
  hover(peekOf(hosting));
  hover(foldAll(root)!);
  draw(vm, { root });
  const now = card(root, HOSTING);
  assert.notEqual(now, hosting);   // it was drawn again
  assert.deepEqual(kept(root), ['fold-all', hosting.dataset.key, `fold-story:${hosting.dataset.key}`]);
  assert.equal(now.classList.contains('brain-hover-kept'), true);
  assert.equal(peekOf(now).classList.contains('brain-hover-kept'), true);
  assert.equal(foldAll(root)!.classList.contains('brain-hover-kept'), true);
  fire(peekOf(now), 'pointerleave');
  fire(foldAll(root)!, 'pointerleave');
  fire(now, 'pointerleave');
  assert.deepEqual(kept(root), []);
});


test('a story drawn twice on an upcoming week (Planned or due and To plan) keeps the hover look on the copy the pointer is on', () => {
  nextFrame();   // frames left by other tests
  nextFrame();
  const vm = upcoming();
  const hosting = vm.toPlan.open.find((r) => r.title === HOSTING)!;
  // The hosting story is Planned or due and also among the first five of Still open: To plan draws a card of it too, with the same key.
  const both: UpcomingWeekVM = { ...vm, toPlan: { ...vm.toPlan, open: [hosting, ...vm.toPlan.open.filter((r) => r !== hosting)] } };
  const root = draw(both);
  const copies = () => [...root.querySelectorAll<HTMLElement>('li.brain-card')].filter((el) => el.dataset.foldName === HOSTING);
  const [planned, toPlan] = copies();
  assert.equal(copies().length, 2);
  assert.equal(planned.dataset.key, toPlan.dataset.key);
  hover(toPlan);   // the pointer is on the To plan copy
  hover(peekOf(toPlan));
  draw(both, { root });
  const [plannedNow, toPlanNow] = copies();
  assert.notEqual(toPlanNow, toPlan);   // it was drawn again
  const hoverKept = (el: Element) => el.classList.contains('brain-hover-kept');
  // Until the browser says where the pointer is, both copies and their chevrons keep the look: the copy it is on is one of them.
  assert.deepEqual([plannedNow, toPlanNow, peekOf(plannedNow), peekOf(toPlanNow)].map(hoverKept), [true, true, true, true]);
  hover(toPlanNow);   // the browser puts :hover on the new To plan copy within a frame
  hover(peekOf(toPlanNow));
  nextFrame();
  nextFrame();
  assert.deepEqual([plannedNow, toPlanNow, peekOf(plannedNow), peekOf(toPlanNow)].map(hoverKept), [false, true, false, true]);
});
