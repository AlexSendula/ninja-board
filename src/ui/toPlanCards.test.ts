// To plan's lists draw a story as a card, as the list modal does: Still open and Due soon as well as No date.
// The story's chevron folds its lines while To plan is open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { planParts, toPlanSpecs } from './plan.ts';
import { renderListBody } from './listModal.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample } from '../../test/sample.ts';
import type { RowVM, UpcomingWeekVM, VaultSnapshot } from '../model/types.ts';

const TODAY = '2026-10-13';
const fresh = (): HTMLElement => document.createElement('div');

function upcoming(s: VaultSnapshot, start: string): UpcomingWeekVM {
  const w = buildWeek(s, TODAY, { start });
  assert.ok(w.kind === 'upcoming', 'expected an upcoming week');
  return w;
}

const w43 = upcoming(loadSample(), '2026-10-19');
const hostingRow = (): RowVM => {
  const row = w43.toPlan.open.find((r) => r.title === "Choose hosting for Sam's site");
  assert.ok(row?.progress, 'the story is in Still open, as a story');
  return row;
};

/** The To plan tile, opened, with its label rows and lists in order. */
function toPlanTile(vm: UpcomingWeekVM): HTMLElement {
  const tile = planParts(vm, fresh(), recorder().actions, true).querySelector<HTMLElement>(':scope > section.brain-to-plan');
  assert.ok(tile);
  return tile;
}

test('To plan: a story in Still open is a folded card in its list, not a row', () => {
  // The story first, so it is among the five rows the list draws; the rest of Still open stays behind Show all.
  const first = { ...w43, toPlan: { ...w43.toPlan, open: [hostingRow(), ...w43.toPlan.open.slice(0, 4)] } };
  const list = toPlanTile(first).querySelector<HTMLElement>(':scope > ul.brain-tasks');
  assert.ok(list);
  const card = list.querySelector<HTMLElement>(':scope > li[data-story]');
  assert.ok(card);
  assert.deepEqual([card.tagName, card.className, card.getAttribute('data-state')], ['LI', 'brain-tile brain-card brain-draggable', 'doing']);
  assert.equal(card.querySelector(':scope > .brain-card-head > .brain-peek')?.getAttribute('aria-expanded'), 'false');
  assert.equal(card.querySelector(':scope > .brain-card-head > .brain-peek')?.getAttribute('aria-label'), "Show the lines of Choose hosting for Sam's site");
  assert.equal(card.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden'), true);
  assert.equal(card.querySelector(':scope > .brain-card-head .brain-card-title')?.textContent, "Choose hosting for Sam's site");
  // The other rows of the list stay rows.
  assert.equal(list.querySelectorAll(':scope > li.brain-task').length, 4);
});

test('To plan: a story in Due soon is a card too, as the list modal draws it', () => {
  const trimmed: UpcomingWeekVM = { ...w43, toPlan: { ...w43.toPlan, dueSoon: [hostingRow()] } };
  const dueSoon = toPlanTile(trimmed).querySelectorAll<HTMLElement>(':scope > ul.brain-tasks')[1];
  assert.ok(dueSoon);
  const card = dueSoon.querySelector<HTMLElement>(':scope > li[data-story]');
  assert.ok(card);
  assert.equal(card.classList.contains('brain-card'), true);
  assert.equal(card.querySelector(':scope > .brain-card-head > .brain-peek')?.getAttribute('aria-expanded'), 'false');
});

test('the list modal and To plan draw Still open\'s story as the same card', () => {
  const root = fresh();
  const spec = toPlanSpecs(w43, root, recorder().actions).find((s) => s.key === 'open');
  assert.ok(spec);
  const content = fresh();
  renderListBody(content, spec, recorder().actions, { close() {}, carry() {} });
  const card = content.querySelector<HTMLElement>('li.brain-card[data-story]');
  assert.ok(card);
  assert.equal(card.querySelector('.brain-card-title')?.textContent, "Choose hosting for Sam's site");
  assert.equal(card.querySelector('.brain-peek')?.getAttribute('aria-expanded'), 'false');
  fire(card.querySelector('.brain-peek')!, 'click');
  assert.equal(card.querySelector('.brain-story-lines')?.hasAttribute('hidden'), false);
});
