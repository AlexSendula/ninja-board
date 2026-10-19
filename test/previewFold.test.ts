// The Week view's fold (decided 2026-10-18, in every week the same day) in design/mockup.html: its Week states draw what the preview draws, as checkView compares them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { recorder } from './ui.ts';   // first: it installs the DOM
import { renderWeek } from '../src/ui/week.ts';
import { buildWeek } from '../src/model/week.ts';
import { tokensOf } from '../preview/tokens.ts';
import { loadSample, readSample } from './sample.ts';
import { weekPlanPath } from '../src/model/record.ts';
import type { WeekVM } from '../src/model/types.ts';

const MOCKUP = parseHTML(readFileSync(new URL('../design/mockup.html', import.meta.url), 'utf8')).document;
const HOSTING = "Choose hosting for Sam's site";

/** The mockup's state of a week: its markup under .brain-page[data-view="week"]. */
const mockWeek = (week: number): Element => {
  const found = MOCKUP.querySelector(`.brain-page[data-view="week"] > .mock-week[data-week="${week}"]`);
  assert.ok(found, `no mockup state for week ${week}`);
  return found;
};

/** The preview's page for this week, drawn from the sample at the preview's fixed day and time, with these stories folded. */
function drawn(collapsed: string[] = []): Element {
  const root = document.createElement('div');
  renderWeek(root, buildWeek(loadSample(), '2026-10-13'), recorder().actions, { now: '11:10', collapsed });
  const page = root.querySelector('.brain-page');
  assert.ok(page);
  return page;
}

const cardOf = (within: Element, title: string): Element | null =>
  [...within.querySelectorAll('.brain-board li.brain-card')].find((c) => c.querySelector('.brain-card-title')?.textContent === title) ?? null;

test('Coming up in the mockup ends with the Collapse all button, as the preview draws the row', () => {
  const part = (page: Element) => tokensOf(page.querySelector('nav.brain-week-line'));
  const want = part(mockWeek(42));
  assert.ok(want.includes('button.brain-fold-all.brain-quiet [Collapse all stories]'));
  assert.deepEqual(part(drawn()), want);
});

test('a story card on the mockup\'s board has its chevron first in its head and its lines in the folding list, as the preview draws one that is open', () => {
  const want = tokensOf(cardOf(mockWeek(42), HOSTING));
  assert.ok(want.length > 20);
  assert.deepEqual(tokensOf(cardOf(drawn(), HOSTING)), want);
});

test('every story card on the mockup\'s Week 42 board folds: the class, the open chevron first in the head, and the lines\' class', () => {
  const cards = [...mockWeek(42).querySelectorAll('.brain-board li.brain-card')];
  assert.equal(cards.length, 4);
  for (const card of cards) {
    const title = card.querySelector('.brain-card-title')?.textContent;
    assert.equal(card.classList.contains('brain-foldable'), true, title ?? '');
    const peek = card.querySelector(':scope > .brain-card-head')?.firstElementChild;
    assert.deepEqual([peek?.localName, peek?.className, peek?.getAttribute('aria-expanded'), peek?.getAttribute('aria-label')], ['button', 'brain-peek', 'true', `Hide the lines of ${title}`], title ?? '');
    const lines = card.querySelector(':scope > .brain-tasks');
    if (lines) assert.equal(lines.classList.contains('brain-story-lines'), true, title ?? '');
  }
});

/** The preview's page for another week of the sample, drawn at the preview's fixed day and time. */
function drawnWeek(start: string): Element {
  const plan = start === '2026-10-05' ? readSample().find((n) => n.path === weekPlanPath(start)) : undefined;
  const model: WeekVM = buildWeek(loadSample(), '2026-10-13', { start, plan });
  const root = document.createElement('div');
  renderWeek(root, model, recorder().actions, { now: '11:10', collapsed: [] });
  const page = root.querySelector('.brain-page');
  assert.ok(page);
  return page;
}

/** Every story card of a mockup week or view: a foldable one, its chevron first in its head and open, its lines in the folding list and shown. */
function assertFoldable(within: Element, count: number): void {
  const cards = [...within.querySelectorAll('li.brain-card')];
  assert.equal(cards.length, count);
  for (const card of cards) {
    const title = card.querySelector('.brain-card-title')?.textContent;
    assert.equal(card.classList.contains('brain-foldable'), true, title ?? '');
    const peek = card.querySelector(':scope > .brain-card-head')?.firstElementChild;
    assert.deepEqual([peek?.localName, peek?.className, peek?.getAttribute('aria-expanded'), peek?.getAttribute('aria-label')], ['button', 'brain-peek', 'true', `Hide the lines of ${title}`], title ?? '');
    const lines = card.querySelector(':scope > .brain-tasks');
    if (lines) assert.deepEqual([lines.classList.contains('brain-story-lines'), lines.hasAttribute('hidden')], [true, false], title ?? '');
  }
}

test('week 43 in the mockup: Planned or due\'s heading row ends with the Collapse all button, as the preview draws the row', () => {
  const part = (page: Element) => tokensOf(page.querySelector('.brain-planned > .brain-label-row'));
  const want = part(mockWeek(43));
  assert.ok(want.includes('button.brain-fold-all.brain-quiet [Collapse all stories]'));
  assert.equal(want.at(-3), 'button.brain-fold-all.brain-quiet [Collapse all stories]');   // the last thing in the row: the button, its icon, the icon's path
  assert.deepEqual(part(drawnWeek('2026-10-19')), want);
});

test('every story card in the mockup\'s Week 43 folds, open: Planned or due\'s and To plan\'s, with their chevron first in the head', () => {
  assertFoldable(mockWeek(43), 6);
  assertFoldable(mockWeek(43).querySelector('.brain-planned')!, 2);
});

test('week 41 in the mockup: the record\'s line ends with the Collapse all button, and its stories are cards, as the preview draws them', () => {
  const week = drawnWeek('2026-10-05');
  const mock = mockWeek(41);
  const want = tokensOf(mock.querySelector('.brain-week-line'));
  assert.ok(want.includes('button.brain-fold-all.brain-quiet [Collapse all stories]'));
  assert.deepEqual(tokensOf(week.querySelector('.brain-week-line')), want);
  assert.deepEqual(tokensOf(week.querySelector('.brain-board')), tokensOf(mock.querySelector('.brain-board')));
  assert.deepEqual(tokensOf(week.querySelector('.brain-fold')), tokensOf(mock.querySelector('.brain-fold')));   // the Backlog stays a flat fold
  assertFoldable(mock.querySelector('.brain-board')!, 2);
  assert.equal(mock.querySelectorAll('.brain-fold .brain-card, .brain-fold .brain-peek').length, 0);
  assert.equal(mock.querySelectorAll('.brain-board .brain-draggable, .brain-board [tabindex], .brain-board .brain-progress').length, 0);   // read-only: no drag, no focus stop, no ring
});

test('week 40 in the mockup, from your notes, has no story card and so no fold button, as the preview draws it', () => {
  const mock = mockWeek(40);
  assert.equal(mock.querySelectorAll('.brain-foldable, .brain-fold-all, .brain-peek').length, 0);
  assert.deepEqual(tokensOf(drawnWeek('2026-09-28').querySelector('.brain-week-line')), tokensOf(mock.querySelector('.brain-week-line')));
  assert.deepEqual(tokensOf(drawnWeek('2026-09-28').querySelector('.brain-board')), tokensOf(mock.querySelector('.brain-board')));
});

test('Backlog in the mockup is unchanged: its story cards fold behind a chevron that is always there, closed, with no foldable class', () => {
  const backlog = MOCKUP.querySelector('.brain-page[data-view="backlog"]');
  assert.ok(backlog);
  const cards = [...backlog.querySelectorAll('li.brain-card[data-story]')];
  assert.equal(cards.length, 2);
  for (const card of cards) {
    assert.equal(card.classList.contains('brain-foldable'), false);
    const peek = card.querySelector(':scope > .brain-card-head > .brain-peek');
    assert.deepEqual([peek?.getAttribute('aria-expanded'), peek?.hasAttribute('hidden'), card.querySelector(':scope > .brain-story-lines')?.hasAttribute('hidden')], ['false', false, true]);
  }
  assert.equal(backlog.querySelectorAll('.brain-fold-all').length, 0);
});
