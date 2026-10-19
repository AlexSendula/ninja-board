// A story card's lines fold behind its chevron by the Week view's remembered list (`collapsed`), planning or not. Opening and closing To plan
// leaves every card as the list says, and a line ticked on an open card leaves the card open through the redraw the write makes. A folded
// card's chevron says what it does. The planner's own list modal (Backlog's, with no list) folds as the planner does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { renderWeek } from './week.ts';
import { toPlanSpecs } from './plan.ts';
import { renderListBody } from './listModal.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample } from '../../test/sample.ts';
import type { UpcomingWeekVM, VaultSnapshot } from '../model/types.ts';

const TODAY = '2026-10-13';
const HOSTING = "Choose hosting for Sam's site";
const CONTRACTOR = 'Choose a contractor';
const fresh = (): HTMLElement => document.createElement('div');

function upcoming(s: VaultSnapshot, start: string): UpcomingWeekVM {
  const w = buildWeek(s, TODAY, { start });
  assert.ok(w.kind === 'upcoming', 'expected an upcoming week');
  return w;
}

const w43 = upcoming(loadSample(), '2026-10-19');

/** The story card drawn for this title, under `within`. */
function card(within: Element, title: string): HTMLElement {
  const found = [...within.querySelectorAll<HTMLElement>('li.brain-card[data-story]')]
    .find((el) => el.querySelector('.brain-card-title')?.textContent === title);
  assert.ok(found, `no story card ${title}`);
  return found;
}

const peekOf = (el: Element) => el.querySelector<HTMLElement>('.brain-peek')!;
const linesHidden = (el: Element) => el.querySelector('.brain-story-lines')?.hasAttribute('hidden');
const toggleOf = (root: Element) => root.querySelector<HTMLElement>('.brain-plan-toggle')!;

test('opening and closing To plan leaves every story card as the remembered list says, and a folded card\'s chevron reads Show with the folded lines', () => {
  const { actions, calls } = recorder();
  const root = fresh();
  renderWeek(root, w43, actions, { collapsed: [HOSTING] });
  const states = () => [HOSTING, CONTRACTOR].map((title) => [peekOf(card(root, title)).getAttribute('aria-expanded'), linesHidden(card(root, title))]);
  const before = [['false', true], ['true', false]];
  assert.deepEqual(states(), before);
  fire(toggleOf(root), 'click');   // Plan this week: To plan opens
  assert.deepEqual(states(), before);
  fire(toggleOf(root), 'click');   // Done planning
  assert.deepEqual(states(), before);
  fire(toggleOf(root), 'click');   // Plan this week again
  assert.deepEqual(states(), before);
  const folded = card(root, HOSTING);
  assert.deepEqual([peekOf(folded).getAttribute('aria-label'), linesHidden(folded)], [`Show the lines of ${HOSTING}`, true]);
  assert.equal(calls.some((c) => c[0] === 'foldStories'), false);   // planning saves nothing
});

test('a line ticked on an open story card leaves the card open through the redraw that the write makes', () => {
  const { actions, calls } = recorder();
  const root = fresh();
  renderWeek(root, w43, actions, { collapsed: [] });
  const open = card(root, HOSTING);   // open by default: no click on its chevron
  assert.deepEqual([peekOf(open).getAttribute('aria-expanded'), linesHidden(open)], ['true', false]);
  fire(open.querySelector<HTMLElement>('.brain-story-lines > li .brain-check')!, 'click');
  assert.equal(calls.filter((c) => c[0] === 'toggle').length, 1);
  renderWeek(root, w43, actions, { collapsed: [] });   // what the vault change does: the view draws again
  const after = card(root, HOSTING);
  assert.deepEqual(
    [peekOf(after).getAttribute('aria-expanded'), peekOf(after).getAttribute('aria-label'), linesHidden(after)],
    ['true', `Hide the lines of ${HOSTING}`, false],
  );
  assert.equal(calls.some((c) => c[0] === 'foldStories'), false);   // the tick folded and saved nothing
});

test('the planner\'s list modal (a list with no Week view set, as Backlog\'s) keeps a card open when its list is drawn again', () => {
  const root = fresh();
  renderWeek(root, w43, recorder().actions);
  const spec = toPlanSpecs(w43, root, recorder().actions).find((s) => s.key === 'open');
  assert.ok(spec);
  const content = fresh();
  const draw = renderListBody(content, { ...spec, collapsed: undefined }, recorder().actions, { close() {}, carry() {} });
  fire(peekOf(card(content, HOSTING)), 'click');
  draw({ ...spec, collapsed: undefined });   // the modal's list is drawn again, as after a write
  assert.equal(peekOf(card(content, HOSTING)).getAttribute('aria-expanded'), 'true');
  assert.equal(linesHidden(card(content, HOSTING)), false);
  fire(peekOf(card(content, HOSTING)), 'click');
});

test('the Week view\'s list modal keeps a card folded when its list is drawn again: the fold is in the page\'s set', () => {
  const root = fresh();
  renderWeek(root, w43, recorder().actions);
  const spec = toPlanSpecs(w43, root, recorder().actions).find((s) => s.key === 'open');
  assert.ok(spec);
  const content = fresh();
  const draw = renderListBody(content, spec, recorder().actions, { close() {}, carry() {} });
  fire(peekOf(card(content, HOSTING)), 'click');   // open by default: this folds it
  draw(spec);
  assert.equal(peekOf(card(content, HOSTING)).getAttribute('aria-expanded'), 'false');
  assert.equal(linesHidden(card(content, HOSTING)), true);
});
