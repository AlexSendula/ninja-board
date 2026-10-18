// Folding stories on the Week board (decided 2026-10-18): a story card on this week's board has a chevron that folds its task
// lines away, and the Coming up row has Collapse all / Expand all. What is folded is the `collapsed` list the view hands to renderWeek.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { renderWeek } from './week.ts';
import { storyCard } from './card.ts';
import { buildWeek } from '../model/week.ts';
import { loadSample } from '../../test/sample.ts';
import type { StoryCardVM, ThisWeekVM, WeekVM } from '../model/types.ts';
import type { Actions } from './actions.ts';

const TODAY = '2026-10-13';   // Tuesday of week 42; the board's story cards are Choose hosting for Sam's site (Doing) and Choose a contractor (Waiting)
const HOSTING = "Choose hosting for Sam's site";
const CONTRACTOR = 'Choose a contractor';

function thisWeek(model: WeekVM): ThisWeekVM {
  assert.ok(model.kind === 'this', 'expected this week');
  return model;
}
const vm = thisWeek(buildWeek(loadSample(), TODAY));

function draw(opts: { collapsed?: string[]; model?: WeekVM; actions?: Actions } = {}): HTMLElement {
  const root = document.createElement('div');
  renderWeek(root, opts.model ?? vm, opts.actions ?? recorder().actions, opts.collapsed === undefined ? {} : { collapsed: opts.collapsed });
  return root;
}

/** The card drawn for this story title on the board. */
function card(root: Element, title: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('.brain-board li.brain-card')].find((el) => el.querySelector('.brain-card-title')?.textContent === title);
  assert.ok(found, `no story card ${title}`);
  return found;
}
const peekOf = (el: Element) => el.querySelector<HTMLElement>(':scope > .brain-card-head > .brain-peek')!;
const linesOf = (el: Element) => el.querySelector<HTMLElement>(':scope > .brain-story-lines');
const foldAll = (root: Element) => root.querySelector<HTMLElement>('nav.brain-week-line > button.brain-fold-all');

/** The week with every story card taken off its board. */
function withoutStories(model: ThisWeekVM): ThisWeekVM {
  const columns = Object.fromEntries(Object.entries(model.columns).map(([column, items]) => [column, items.filter((i) => i.kind === 'row')]));
  return { ...model, columns: columns as ThisWeekVM['columns'] };
}

test('a story card on the board starts open: its chevron comes first in the head, and its lines show', () => {
  const root = draw();
  const hosting = card(root, HOSTING);
  assert.equal(hosting.classList.contains('brain-foldable'), true);
  const head = hosting.querySelector(':scope > header.brain-card-head')!;
  assert.equal(head.firstElementChild, peekOf(hosting));
  const peek = peekOf(hosting);
  assert.deepEqual(
    [peek.tagName, peek.getAttribute('aria-expanded'), peek.getAttribute('aria-label'), peek.querySelector('svg.brain-peek-icon') !== null],
    ['BUTTON', 'true', `Hide the lines of ${HOSTING}`, true],
  );
  const lines = linesOf(hosting);
  assert.ok(lines);
  assert.equal(lines.classList.contains('brain-tasks'), true);
  assert.equal(lines.hasAttribute('hidden'), false);
  assert.equal(lines.querySelectorAll(':scope > li.brain-task').length, 3);
});

test('a folded story keeps its head (title, meta, ring and count) and hides its lines; the others stay open', () => {
  const root = draw({ collapsed: [HOSTING] });
  const hosting = card(root, HOSTING);
  assert.deepEqual(
    [peekOf(hosting).getAttribute('aria-expanded'), peekOf(hosting).getAttribute('aria-label'), linesOf(hosting)?.hasAttribute('hidden')],
    ['false', `Show the lines of ${HOSTING}`, true],
  );
  const head = hosting.querySelector(':scope > .brain-card-head')!;
  assert.equal(head.querySelector('.brain-card-title')?.textContent, HOSTING);
  assert.equal(head.querySelector('.brain-meta')?.textContent, card(draw(), HOSTING).querySelector('.brain-meta')?.textContent);   // the meta is drawn as before
  assert.ok(head.querySelector('.brain-meta'));
  assert.equal(head.querySelector('.brain-progress > span')?.textContent, '1/3');
  const contractor = card(root, CONTRACTOR);
  assert.deepEqual([peekOf(contractor).getAttribute('aria-expanded'), linesOf(contractor)?.hasAttribute('hidden')], ['true', false]);
});

test('a name in the list that is not on the board folds nothing, and a folded name is a story title: nothing else is folded', () => {
  const root = draw({ collapsed: ['A story that left the week', 'Book a physio session'] });
  assert.deepEqual([...root.querySelectorAll('.brain-board .brain-peek')].map((p) => p.getAttribute('aria-expanded')), ['true', 'true']);
  assert.equal(root.querySelectorAll('.brain-board [hidden]').length, 0);
});

test('the chevron calls foldStories with that story\'s name: it folds an open story and opens a folded one', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions, collapsed: [CONTRACTOR] });
  fire(peekOf(card(root, HOSTING)), 'click');
  fire(peekOf(card(root, CONTRACTOR)), 'click');
  assert.deepEqual(calls, [['foldStories', [HOSTING], true], ['foldStories', [CONTRACTOR], false]]);
});

test('the chevron is no click on the card: it does not open the note, and a click on the card still does nothing else', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions });
  fire(peekOf(card(root, HOSTING)), 'click');
  assert.equal(calls.some((c) => c[0] === 'open' || c[0] === 'setNoteStatus'), false);
});

test('the chevron keeps its own key, so a redraw gives the focus back to it and not to the card', () => {
  const root = draw();
  const hosting = card(root, HOSTING);
  assert.equal(peekOf(hosting).getAttribute('data-key'), `fold-story:${hosting.dataset.key}`);
});

test('Coming up ends with a quiet button, after the chips, that collapses every story on the board', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions });
  const nav = root.querySelector('nav.brain-week-line')!;
  const button = foldAll(root);
  assert.ok(button);
  assert.equal(nav.lastElementChild, button);
  assert.equal(button.previousElementSibling?.classList.contains('brain-week-chips'), true);
  assert.equal(button.classList.contains('brain-quiet'), true);
  assert.deepEqual(
    [button.getAttribute('aria-label'), button.getAttribute('title'), button.getAttribute('data-key'), button.querySelector('svg')?.getAttribute('class')],
    ['Collapse all stories', 'Collapse all stories', 'fold-all', 'brain-fold-icon'],
  );
  assert.equal(button.querySelectorAll('svg > path').length, 1);   // the compact list: one path of dots and lines
  fire(button, 'click');
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], true]]);   // the board's stories, each once, column by column
});

test('with some stories folded, the button still says Collapse all; with every story folded it says Expand all, in the detailed list', () => {
  const some = foldAll(draw({ collapsed: [HOSTING] }))!;
  assert.deepEqual([some.getAttribute('aria-label'), some.getAttribute('title'), some.querySelectorAll('svg > rect').length], ['Collapse all stories', 'Collapse all stories', 0]);
  const { actions, calls } = recorder();
  const every = foldAll(draw({ actions, collapsed: [HOSTING, CONTRACTOR, 'A story that left the week'] }))!;
  assert.deepEqual([every.getAttribute('aria-label'), every.getAttribute('title'), every.getAttribute('data-key')], ['Expand all stories', 'Expand all stories', 'fold-all']);
  assert.deepEqual([every.querySelectorAll('svg > rect').length, every.querySelectorAll('svg > path').length], [2, 1]);   // two squares, and their four lines
  fire(every, 'click');
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], false]]);   // only the board's names: the others stay folded
});

test('with no story on the board there is no button, and no chevron', () => {
  const root = draw({ model: withoutStories(vm) });
  absent(foldAll(root));
  assert.equal(root.querySelectorAll('.brain-peek').length, 0);
  assert.equal(root.querySelectorAll('nav.brain-week-line > *').length, 2);   // the label and the chips
});

test('a story listed in two columns by two notes of the same name gets one name in the button\'s list', () => {
  const { actions, calls } = recorder();
  const doing = vm.columns.doing.find((i) => i.kind === 'card');
  assert.ok(doing);
  const twin = { ...vm, columns: { ...vm.columns, todo: [...vm.columns.todo, { ...doing, card: { ...doing.card, key: 'Elsewhere/' + doing.card.key } }] } };
  fire(foldAll(draw({ model: twin, actions }))!, 'click');
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], true]]);
});

test('only this week\'s board folds: a past week and an upcoming week have no chevron on a card and no button', () => {
  const snapshot = loadSample();
  for (const start of ['2026-10-05', '2026-10-19']) {
    const root = draw({ model: buildWeek(snapshot, TODAY, { start }), collapsed: [HOSTING, CONTRACTOR] });
    assert.equal(root.querySelectorAll('.brain-board .brain-foldable').length, 0, start);
    absent(foldAll(root), start);
  }
});

test('a story card drawn without a fold (storyCard on its own) has no chevron: the fold is the board\'s', () => {
  const story: StoryCardVM = { key: 'k', path: 'k.md', title: 'Alone', column: 'todo', meta: [], done: 0, total: 0, rows: [] };
  const li = storyCard(story, recorder().actions);
  assert.equal(li.classList.contains('brain-foldable'), false);
  absent(li.querySelector('.brain-peek'));
});

test('a story with no lines has a chevron too, and folding it hides nothing', () => {
  const { actions, calls } = recorder();
  const story: StoryCardVM = { key: 'k', path: 'k.md', title: 'No lines', column: 'todo', meta: [], done: 0, total: 1, rows: [] };
  const li = storyCard(story, actions, { name: 'No lines', folded: false });
  absent(li.querySelector('.brain-story-lines'));
  fire(li.querySelector('.brain-peek')!, 'click');
  assert.deepEqual(calls, [['foldStories', ['No lines'], true]]);
});
