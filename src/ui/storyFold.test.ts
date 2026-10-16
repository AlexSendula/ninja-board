// A story card's lines fold behind its chevron while To plan is open. The fold is kept across a redraw, so a line
// ticked on an open card leaves the card open; opening To plan folds every card again, and its chevron's label
// says what the chevron does.
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

test('reopening To plan folds a story card again, and its chevron reads Show with the folded lines', () => {
  const root = fresh();
  renderWeek(root, w43, recorder().actions);
  fire(toggleOf(root), 'click');   // To plan opens
  fire(peekOf(card(root, HOSTING)), 'click');   // the card's lines open
  fire(toggleOf(root), 'click');   // Done planning: the card is whole
  fire(toggleOf(root), 'click');   // Plan this week again
  const again = card(root, HOSTING);
  assert.deepEqual(
    [peekOf(again).getAttribute('aria-expanded'), peekOf(again).getAttribute('aria-label'), linesHidden(again)],
    ['false', `Show the lines of ${HOSTING}`, true],
  );
});

test('a line ticked on an open story card leaves the card open through the redraw that the write makes', () => {
  const { actions, calls } = recorder();
  const root = fresh();
  renderWeek(root, w43, actions);
  fire(toggleOf(root), 'click');
  fire(peekOf(card(root, HOSTING)), 'click');   // open
  const line = card(root, HOSTING).querySelector<HTMLElement>('.brain-story-lines > li .brain-check')!;
  fire(line, 'click');
  assert.equal(calls.filter((c) => c[0] === 'toggle').length, 1);
  renderWeek(root, w43, actions);   // what the vault change does: the view draws again
  const after = card(root, HOSTING);
  assert.deepEqual(
    [peekOf(after).getAttribute('aria-expanded'), peekOf(after).getAttribute('aria-label'), linesHidden(after)],
    ['true', `Hide the lines of ${HOSTING}`, false],
  );
  fire(peekOf(after), 'click');   // back to folded, for the other tests
});

test('the list modal keeps a card open when its list is drawn again', () => {
  const root = fresh();
  renderWeek(root, w43, recorder().actions);
  const spec = toPlanSpecs(w43, root, recorder().actions).find((s) => s.key === 'open');
  assert.ok(spec);
  const content = fresh();
  const draw = renderListBody(content, spec, recorder().actions, { close() {}, carry() {} });
  fire(peekOf(card(content, HOSTING)), 'click');
  draw(spec);   // the modal's list is drawn again, as after a write
  assert.equal(peekOf(card(content, HOSTING)).getAttribute('aria-expanded'), 'true');
  assert.equal(linesHidden(card(content, HOSTING)), false);
  fire(peekOf(card(content, HOSTING)), 'click');
});
