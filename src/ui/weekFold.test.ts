// Folding stories on the Week board (decided 2026-10-18): a story card on this week's board has a chevron that folds its task
// lines away, and the Coming up row has Collapse all / Expand all. What is folded is the `collapsed` list the view hands to renderWeek.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, nextFrame, recorder, same } from '../../test/ui.ts';   // first: it installs the DOM
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

// A fold changes the page in place (2026-10-18): a redraw rebuilds the chevron at opacity 0, and it fades back in, a flicker.

const pageOf = (root: Element) => root.querySelector('.brain-page');
const lineStates = (root: Element, title: string) => [peekOf(card(root, title)).getAttribute('aria-expanded'), linesOf(card(root, title))?.hasAttribute('hidden')];
const buttonState = (root: Element) => {
  const button = foldAll(root)!;
  return [button.getAttribute('aria-label'), button.getAttribute('title'), button.querySelectorAll('svg > rect').length];
};

test('a click on the chevron folds that card in place: the same chevron, its lines hidden, its label and state changed, the action called to save it, and no redraw', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions });
  const page = pageOf(root);
  const hosting = card(root, HOSTING);
  const peek = peekOf(hosting);
  const lines = linesOf(hosting);
  fire(peek, 'click');
  same(pageOf(root), page, 'the page was drawn again');
  same(card(root, HOSTING), hosting);
  same(peekOf(hosting), peek);
  same(linesOf(hosting), lines);
  assert.deepEqual(
    [peek.getAttribute('aria-expanded'), peek.getAttribute('aria-label'), lines?.hasAttribute('hidden')],
    ['false', `Show the lines of ${HOSTING}`, true],
  );
  assert.deepEqual(lineStates(root, CONTRACTOR), ['true', false]);   // the other story is as it was
  assert.deepEqual(calls, [['foldStories', [HOSTING], true]]);
  // A draw from the list that the click saved is what the click left on the page.
  const saved = draw({ collapsed: [HOSTING] });
  assert.deepEqual([lineStates(saved, HOSTING), buttonState(saved)], [lineStates(root, HOSTING), buttonState(root)]);
});

test('a second click opens it again in place', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions });
  const hosting = card(root, HOSTING);
  const peek = peekOf(hosting);
  fire(peek, 'click');
  fire(peek, 'click');
  same(peekOf(card(root, HOSTING)), peek);
  assert.deepEqual(lineStates(root, HOSTING), ['true', false]);
  assert.equal(peek.getAttribute('aria-label'), `Hide the lines of ${HOSTING}`);
  assert.deepEqual(calls, [['foldStories', [HOSTING], true], ['foldStories', [HOSTING], false]]);
});

test('folding the last open story turns the button into Expand all at once, in place; opening one turns it back', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions });
  const button = foldAll(root)!;
  fire(peekOf(card(root, HOSTING)), 'click');
  assert.deepEqual(buttonState(root), ['Collapse all stories', 'Collapse all stories', 0]);   // one story is still open
  fire(peekOf(card(root, CONTRACTOR)), 'click');
  same(foldAll(root), button);
  assert.deepEqual(buttonState(root), ['Expand all stories', 'Expand all stories', 2]);
  assert.equal(button.getAttribute('data-key'), 'fold-all');
  assert.equal(button.querySelectorAll('svg > path').length, 1);
  assert.equal(button.querySelectorAll('svg').length, 1);
  fire(peekOf(card(root, HOSTING)), 'click');
  assert.deepEqual(buttonState(root), ['Collapse all stories', 'Collapse all stories', 0]);
  assert.equal(button.querySelectorAll('svg').length, 1);
  assert.deepEqual(calls, [['foldStories', [HOSTING], true], ['foldStories', [CONTRACTOR], true], ['foldStories', [HOSTING], false]]);
});

test('Collapse all folds every story on the board in place and turns into Expand all; Expand all opens them all and turns back', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions });
  const page = pageOf(root);
  const cards = [card(root, HOSTING), card(root, CONTRACTOR)];
  const button = foldAll(root)!;
  fire(button, 'click');
  same(pageOf(root), page, 'the page was drawn again');
  same(foldAll(root), button);
  cards.forEach((el, i) => same(card(root, [HOSTING, CONTRACTOR][i]), el));
  assert.deepEqual([lineStates(root, HOSTING), lineStates(root, CONTRACTOR)], [['false', true], ['false', true]]);
  assert.deepEqual(buttonState(root), ['Expand all stories', 'Expand all stories', 2]);
  fire(button, 'click');
  assert.deepEqual([lineStates(root, HOSTING), lineStates(root, CONTRACTOR)], [['true', false], ['true', false]]);
  assert.deepEqual(buttonState(root), ['Collapse all stories', 'Collapse all stories', 0]);
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], true], ['foldStories', [HOSTING, CONTRACTOR], false]]);
});

test('Collapse all with one story already folded folds the rest, and Expand all keeps a name that is not on the board folded', () => {
  const { actions, calls } = recorder();
  const root = draw({ actions, collapsed: [HOSTING] });
  fire(foldAll(root)!, 'click');
  assert.deepEqual([lineStates(root, HOSTING), lineStates(root, CONTRACTOR)], [['false', true], ['false', true]]);
  fire(foldAll(root)!, 'click');
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], true], ['foldStories', [HOSTING, CONTRACTOR], false]]);
});

test('a story card on its own (no page, no button) folds in place too', () => {
  const { actions, calls } = recorder();
  const story: StoryCardVM = { key: 'k', path: 'k.md', title: 'Alone', column: 'todo', meta: [], done: 0, total: 1, rows: [] };
  const li = storyCard(story, actions, { name: 'Alone', folded: true });
  const peek = li.querySelector('.brain-peek')!;
  fire(peek, 'click');
  assert.equal(peek.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(calls, [['foldStories', ['Alone'], false]]);
});

test('two cards of the same name fold together: a chevron click folds the twin in place too, and a second click opens both', () => {
  const { actions, calls } = recorder();
  const doing = vm.columns.doing.find((i) => i.kind === 'card');
  assert.ok(doing);
  const twin = { ...vm, columns: { ...vm.columns, todo: [...vm.columns.todo, { ...doing, card: { ...doing.card, key: 'Elsewhere/' + doing.card.key } }] } };
  const root = draw({ model: twin, actions });
  const page = pageOf(root);
  const both = [...root.querySelectorAll<HTMLElement>('.brain-board li.brain-card')].filter((el) => el.querySelector('.brain-card-title')?.textContent === HOSTING);
  assert.deepEqual(both.map((el) => el.dataset.foldName), [HOSTING, HOSTING]);   // the saved name is on the card, to find the twin by
  assert.equal(root.querySelector<HTMLElement>(`.brain-board li.brain-card[data-fold-name="${CONTRACTOR}"]`)?.dataset.foldName, CONTRACTOR);
  fire(peekOf(both[0]), 'click');
  same(pageOf(root), page, 'the page was drawn again');
  assert.deepEqual(both.map((el) => [peekOf(el).getAttribute('aria-expanded'), linesOf(el)?.hasAttribute('hidden')]), [['false', true], ['false', true]]);
  assert.deepEqual(lineStates(root, CONTRACTOR), ['true', false]);   // another name is as it was
  assert.deepEqual(buttonState(root), ['Collapse all stories', 'Collapse all stories', 0]);
  fire(peekOf(both[1]), 'click');
  assert.deepEqual(both.map((el) => [peekOf(el).getAttribute('aria-expanded'), linesOf(el)?.hasAttribute('hidden')]), [['true', false], ['true', false]]);
  assert.deepEqual(calls, [['foldStories', [HOSTING], true], ['foldStories', [HOSTING], false]]);
});

/** The card as the pointer is on it: matches(':hover') says so, as a browser would, and linkedom cannot. */
function hover(el: Element, over: boolean | 'throws' = true): void {
  Object.assign(el, { matches: (selector: string) => {
    if (selector !== ':hover') return false;
    if (over === 'throws') throw new Error('no :hover');
    return over;
  } });
}
/** A pointerleave as a browser sends it: it does not bubble, so a leave of the chevron is no leave of its card. */
const leave = (el: Element) => el.dispatchEvent(new (document.defaultView!.Event)('pointerleave'));
const kept = (root: Element) => [...root.querySelectorAll('.brain-hover-kept')].map((el) => el.getAttribute('data-key'));

test('a redraw keeps the chevron of the card under the pointer: the new card with its key carries brain-hover-kept, until the pointer leaves it', () => {
  const root = draw();
  const old = card(root, HOSTING);
  hover(old);
  renderWeek(root, vm, recorder().actions, {});
  const now = card(root, HOSTING);
  assert.notEqual(now, old);   // it was drawn again
  assert.deepEqual(kept(root), [old.dataset.key]);
  assert.equal(now.classList.contains('brain-hover-kept'), true);
  assert.equal(card(root, CONTRACTOR).classList.contains('brain-hover-kept'), false);
  // Bases (and the undo step) draw a second time soon after the first, before the browser has put :hover on the new card: it is kept still.
  renderWeek(root, vm, recorder().actions, {});
  assert.deepEqual(kept(root), [old.dataset.key]);
  assert.notEqual(card(root, HOSTING), now);
  const again = card(root, HOSTING);
  fire(again, 'pointerleave');
  assert.deepEqual(kept(root), []);
  fire(again, 'pointerleave');   // a leave without the class is nothing
  assert.deepEqual(kept(root), []);
  hover(again);
  renderWeek(root, vm, recorder().actions, {});
  fire(now, 'pointerleave');   // a card that a draw has replaced no longer matters
  assert.deepEqual(kept(root), [old.dataset.key]);
  fire(card(root, HOSTING), 'pointerleave');
  assert.deepEqual(kept(root), []);
  renderWeek(root, vm, recorder().actions, {});   // the pointer is not on any card now (the new cards have no :hover): nothing is kept
  assert.deepEqual(kept(root), []);
});

test('with no card under the pointer, or a browser that cannot say, a redraw keeps nothing', () => {
  const root = draw();
  hover(card(root, HOSTING), false);
  renderWeek(root, vm, recorder().actions, {});
  assert.deepEqual(kept(root), []);
  hover(card(root, HOSTING), 'throws');
  renderWeek(root, vm, recorder().actions, {});
  assert.deepEqual(kept(root), []);
});

test('the kept chevron follows the draw it is made in: a draw of a week without that story after a hovered chevron draws nothing kept and does not fail', () => {
  const root = draw();
  hover(peekOf(card(root, HOSTING)));
  const elsewhere = buildWeek(loadSample(), TODAY, { start: '2026-09-28' });   // week 40: neither story is in it
  renderWeek(root, elsewhere, recorder().actions, {});
  assert.deepEqual(kept(root), []);
});

test('a redraw keeps what the pointer is on, not only the card: the chevron and the Collapse all button carry brain-hover-kept too, each until its own pointerleave', () => {
  const root = draw();
  const hosting = card(root, HOSTING);
  hover(hosting);
  hover(peekOf(hosting));
  hover(foldAll(root)!);
  renderWeek(root, vm, recorder().actions, {});
  const now = card(root, HOSTING);
  const keys = ['fold-all', hosting.dataset.key, `fold-story:${hosting.dataset.key}`];   // page order: Coming up, then the card, then its chevron
  assert.deepEqual(kept(root), keys);
  assert.equal(peekOf(now).classList.contains('brain-hover-kept'), true);
  assert.equal(foldAll(root)!.classList.contains('brain-hover-kept'), true);
  leave(peekOf(now));   // the pointer went from the chevron to the card: the card stays kept
  assert.deepEqual(kept(root), ['fold-all', hosting.dataset.key]);
  leave(foldAll(root)!);
  assert.deepEqual(kept(root), [hosting.dataset.key]);
  leave(now);
  assert.deepEqual(kept(root), []);
});

test('with the pointer on the chevron alone (a click on it) the redraw that follows keeps the chevron: it does not blink', () => {
  const root = draw();
  const peek = peekOf(card(root, CONTRACTOR));
  hover(peek);
  renderWeek(root, vm, recorder().actions, {});
  assert.deepEqual(kept(root), [peek.getAttribute('data-key')]);
  assert.equal(peekOf(card(root, CONTRACTOR)).classList.contains('brain-hover-kept'), true);
});

test('a kept card that the pointer is not on does not win over the card it is on, wherever the card is on the page', () => {
  const root = draw();
  card(root, HOSTING).classList.add('brain-hover-kept');   // left over: an earlier column, which the pointer never entered
  const contractor = card(root, CONTRACTOR);
  hover(contractor);
  renderWeek(root, vm, recorder().actions, {});
  assert.deepEqual(kept(root), [contractor.dataset.key]);
});

test('two frames after the draw, a kept element the pointer is not on loses the class; one it is on keeps it', () => {
  nextFrame();   // frames left by other tests
  const root = draw();
  const hosting = card(root, HOSTING);
  hover(hosting);
  hover(peekOf(hosting));
  renderWeek(root, vm, recorder().actions, {});
  const now = card(root, HOSTING);
  assert.deepEqual(kept(root), [hosting.dataset.key, `fold-story:${hosting.dataset.key}`]);
  nextFrame();   // the first frame: the browser has not yet put :hover on the new elements, and nothing is checked
  assert.equal(kept(root).length, 2);
  hover(now);   // by the second, :hover is on the card, and not on its chevron (it is no longer under the pointer)
  hover(peekOf(now), false);
  nextFrame();
  assert.deepEqual(kept(root), [hosting.dataset.key]);
  // The pointer left the card without a pointerleave for it (a layout shift moved the card away): two frames cut the class, and a later draw keeps nothing.
  hover(now);
  renderWeek(root, vm, recorder().actions, {});
  hover(card(root, HOSTING), false);
  nextFrame();
  nextFrame();
  assert.deepEqual(kept(root), []);
  renderWeek(root, vm, recorder().actions, {});
  assert.deepEqual(kept(root), []);
});

test('a card that a draw has replaced before the check is nothing to the check, and a browser that cannot say :hover keeps the class', () => {
  nextFrame();
  const root = draw();
  hover(card(root, HOSTING));
  renderWeek(root, vm, recorder().actions, {});
  const now = card(root, HOSTING);
  hover(now, 'throws');
  nextFrame();
  nextFrame();
  assert.deepEqual(kept(root), [now.dataset.key]);
  root.replaceChildren();
  nextFrame();
});

