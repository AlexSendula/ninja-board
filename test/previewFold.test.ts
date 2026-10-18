// The Week board's fold (decided 2026-10-18) in design/mockup.html: its Week 42 state draws what the preview draws, as checkView compares them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { recorder } from './ui.ts';   // first: it installs the DOM
import { renderWeek } from '../src/ui/week.ts';
import { buildWeek } from '../src/model/week.ts';
import { tokensOf } from '../preview/tokens.ts';
import { loadSample } from './sample.ts';

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

test('only Week 42 folds in the mockup: the other weeks have no foldable card and no fold button', () => {
  for (const week of [40, 41, 43]) {
    assert.equal(mockWeek(week).querySelectorAll('.brain-board .brain-foldable, .brain-fold-all').length, 0, `week ${week}`);
  }
});
