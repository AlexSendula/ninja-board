// Folding stories in the past weeks of the Week view (decided 2026-10-18): a past week's story is a read-only card that folds as this week's board
// does, by the one `collapsed` list the view hands to renderWeek, and the week's source line ends with the Collapse all / Expand all button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, fire, nextFrame, recorder, same } from '../../test/ui.ts';   // first: it installs the DOM
import { renderWeek } from './week.ts';
import { focusedKey, refocus } from './focus.ts';
import { buildWeek } from '../model/week.ts';
import { buildSnapshot } from '../model/snapshot.ts';
import { weekPlanPath } from '../model/record.ts';
import { loadSample, readSample } from '../../test/sample.ts';
import type { PastWeekVM, UpcomingWeekVM, WeekVM } from '../model/types.ts';

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

// ---------- Past weeks ----------

/** A record or notes week with stories, as past cards. */
const w41 = (collapsed: string[] = [], actions = recorder().actions) => draw(past(), { collapsed, actions });

test('a past week\'s story is a read-only card with its meta, its lines as read-only rows and the same chevron', () => {
  const { actions, calls } = recorder();
  const root = w41([], actions);
  const hosting = card(root, HOSTING);
  assert.deepEqual([hosting.localName, hosting.className, hosting.dataset.foldName, hosting.dataset.state], ['li', 'brain-tile brain-card brain-foldable', HOSTING, 'doing']);
  assert.equal(hosting.closest('.brain-col')?.querySelector('.brain-label')?.textContent, 'In progress');
  const head = hosting.querySelector(':scope > header.brain-card-head')!;
  assert.equal(head.firstElementChild, peekOf(hosting));
  assert.deepEqual([peekOf(hosting).getAttribute('aria-expanded'), peekOf(hosting).getAttribute('aria-label'), peekOf(hosting).getAttribute('data-key')], ['true', `Hide the lines of ${HOSTING}`, `fold-story:${hosting.dataset.key}`]);
  assert.equal(head.querySelector('.brain-card-title > a.brain-link.brain-stretch')?.textContent, HOSTING);
  assert.deepEqual([...head.querySelectorAll('.brain-meta > *')].map((el) => el.textContent), ['Website for Sam']);
  assert.equal(head.querySelectorAll('.brain-progress, .brain-ring, .brain-card-side').length, 0);   // no ring and no count
  const lines = linesOf(hosting)!;
  assert.equal(lines.classList.contains('brain-tasks'), true);
  assert.deepEqual([...lines.querySelectorAll(':scope > li.brain-task')].map((li) => [li.querySelector('.brain-task-text')?.textContent, li.getAttribute('data-state'), li.querySelector('.brain-meta')?.textContent]), [['List three hosting options', 'done', 'Done Sun']]);
  assert.equal(lines.querySelectorAll('button, [tabindex]').length, 0);
  // Each line row has the key of its line, so a redraw gives the focus on its link back to that link.
  const lineKey = past().columns.flatMap((col) => col.rows).find((r) => r.title === HOSTING)?.lines?.[0].key;
  assert.ok(lineKey);
  assert.deepEqual([...lines.querySelectorAll(':scope > li')].map((li) => li.getAttribute('data-key')), [lineKey]);
  assert.notEqual(lineKey, hosting.dataset.key);
  assert.equal(lines.querySelector('.brain-lead')?.localName, 'span');
  // The contractor's card: its story is not listed, so it has no meta and opens the story's note.
  const contractor = card(root, CONTRACTOR);
  assert.equal(contractor.closest('.brain-col')?.querySelector('.brain-label')?.textContent, 'Done');
  absent(contractor.querySelector(':scope > .brain-card-head .brain-meta'));
  contractor.querySelector<HTMLElement>('.brain-card-title a')?.click();
  assert.deepEqual(calls, [['open', '03 Projects/Renovate the kitchen/Choose a contractor.md', undefined]]);
  assert.equal(contractor.querySelectorAll('.brain-story-lines > li').length, 1);
});

test('a past card whose story has no note any more has a plain-text title', () => {
  const base = past();
  const gone: PastWeekVM = {
    ...base,
    columns: [{ title: 'Not done', empty: 'Nothing left open', rows: [{
      key: 'story:Gone', title: 'Gone', state: 'todo', meta: [], inbox: false,
      lines: [{ key: 'notDone#0', title: 'A line', state: 'todo', meta: [], inbox: false }],
    }] }],
  };
  const gonecard = card(draw(gone), 'Gone');
  assert.equal(gonecard.querySelectorAll('a').length, 0);
  assert.equal(gonecard.querySelector('.brain-card-title')?.firstElementChild?.localName, 'span');
});

test('a past card cannot be dragged and has no menu; folding is not an edit: a click on the chevron folds it in place and saves', () => {
  const { actions, calls } = recorder();
  const root = w41([], actions);
  const hosting = card(root, HOSTING);
  assert.equal(hosting.classList.contains('brain-draggable'), false);
  assert.equal(hosting.querySelectorAll('.brain-draggable, [data-plannable], [tabindex]').length, 0);
  for (const target of [hosting, ...hosting.querySelectorAll<HTMLElement>('li.brain-task')]) {
    fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
    fire(target, 'keydown', { key: 'Enter' });
    fire(target, 'keydown', { key: ' ' });
    fire(target, 'keydown', { key: 'ContextMenu' });
  }
  assert.deepEqual(calls, []);
  assert.equal(document.querySelectorAll('.brain-popover').length, 0);
  const page = root.querySelector('.brain-page');
  const peek = peekOf(hosting);
  fire(peek, 'click');
  same(root.querySelector('.brain-page'), page, 'the page was drawn again');
  same(card(root, HOSTING), hosting);
  assert.deepEqual(stateOf(hosting), FOLDED);
  assert.equal(peek.getAttribute('aria-label'), `Show the lines of ${HOSTING}`);
  assert.deepEqual(stateOf(card(root, CONTRACTOR)), OPEN);
  fire(peek, 'click');
  assert.deepEqual(stateOf(hosting), OPEN);
  assert.deepEqual(calls, [['foldStories', [HOSTING], true], ['foldStories', [HOSTING], false]]);
  assert.equal(document.querySelectorAll('.brain-popover').length, 0);
});

test('a past card folds by the shared list, and a title with a card is folded in the list or not', () => {
  const root = w41([HOSTING]);
  assert.deepEqual([HOSTING, CONTRACTOR].map((title) => stateOf(card(root, title))), [FOLDED, OPEN]);
  assert.equal(label(foldAll(root)), 'Collapse all stories');
  const every = w41([HOSTING, CONTRACTOR]);
  assert.equal(label(foldAll(every)), 'Expand all stories');
});

test('the icon ends the "Record · frozen …" line of a record and the "From your notes" line, and folds every card of the page', () => {
  const { actions, calls } = recorder();
  const root = w41([], actions);
  const line = root.querySelector('.brain-page > .brain-week-line')!;
  assert.equal(line.querySelector(':scope > p.brain-meta')?.textContent, 'Recordfrozen Mon 12 Oct');
  const button = foldAll(root)!;
  assert.equal(line.lastElementChild, button);
  assert.equal(root.querySelectorAll('.brain-fold-all').length, 1);
  assert.deepEqual([button.className, button.getAttribute('data-key'), label(button)], ['brain-quiet brain-fold-all', 'fold-all', 'Collapse all stories']);
  fire(button, 'click');
  assert.deepEqual([HOSTING, CONTRACTOR].map((title) => stateOf(card(root, title))), [FOLDED, FOLDED]);
  assert.equal(label(button), 'Expand all stories');
  assert.deepEqual(calls, [['foldStories', [HOSTING, CONTRACTOR], true]]);   // in board order: In progress, then Done
  fire(button, 'click');
  assert.deepEqual([HOSTING, CONTRACTOR].map((title) => stateOf(card(root, title))), [OPEN, OPEN]);
  assert.deepEqual(calls.at(-1), ['foldStories', [HOSTING, CONTRACTOR], false]);

  const notes = buildSnapshot([
    { path: '03 Projects/Site/Site.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: '03 Projects/Site/Write copy.md', frontmatter: { type: 'task', status: 'open' }, lines: ['- [x] Draft [completion:: 2026-10-02]', '- [x] Proofread [completion:: 2026-10-02]'] },
  ]);
  const fromNotes = draw(buildWeek(notes, TODAY, { start: '2026-09-28' }), { actions });
  const notesLine = fromNotes.querySelector('.brain-page > .brain-week-line')!;
  assert.equal(notesLine.querySelector(':scope > p.brain-meta')?.textContent, 'From your notes');
  assert.equal(notesLine.lastElementChild, foldAll(fromNotes));
  assert.equal(card(fromNotes, 'Write copy').querySelectorAll('.brain-story-lines > li').length, 2);
});

test('a past week with no story card has no icon and no chevron', () => {
  const root = draw(past('2026-09-28'));
  absent(foldAll(root));
  assert.equal(root.querySelectorAll('.brain-peek, .brain-card').length, 0);
  absent(draw(past('2026-10-05')).querySelector('.brain-fold .brain-card'));   // the Backlog stays a flat fold
});

/** The key `focusedKey` reads while `el` has the focus, as a browser would give it. */
function keyWhileFocused(root: HTMLElement, el: HTMLElement): string | undefined {
  Object.defineProperty(document, 'activeElement', { value: el, configurable: true });
  try {
    return focusedKey(root);
  } finally {
    delete (document as unknown as Record<string, unknown>).activeElement;
  }
}

/** Draws the page again, hands `key` to refocus, and says which controls of the card then took the focus, by class. */
function refocused(vm: PastWeekVM, root: HTMLElement, key: string, title: string): string[] {
  draw(vm, { root });
  const focused: string[] = [];
  for (const el of card(root, title).querySelectorAll<HTMLElement>('a, button')) el.focus = () => void focused.push(el.className || el.localName);
  refocus(root, key);
  return focused;
}

test('a redraw gives the focus on a past card\'s title back to the title, and on a line\'s link back to that link, not to the chevron before them', () => {
  const vm = past();
  const root = draw(vm);
  const title = card(root, HOSTING).querySelector<HTMLElement>('.brain-card-title a')!;
  const titleKey = keyWhileFocused(root, title);
  assert.ok(titleKey);
  assert.notEqual(titleKey, card(root, HOSTING).dataset.key);   // the card is no focus stop here: its key would send the focus to the first control, the chevron
  assert.deepEqual(refocused(vm, root, titleKey, HOSTING), ['brain-link brain-stretch']);
  // A line's link: the card's key would send the focus to the chevron, so the line row has a key of its own.
  const line = card(root, HOSTING).querySelector<HTMLElement>('.brain-story-lines a')!;
  const lineKey = keyWhileFocused(root, line);
  assert.ok(lineKey);
  assert.notEqual(lineKey, card(root, HOSTING).dataset.key);
  assert.notEqual(lineKey, titleKey);
  assert.deepEqual(refocused(vm, root, lineKey, HOSTING), ['brain-task-text brain-link brain-stretch']);
  // A chevron keeps its own key too, as before.
  const now = card(root, HOSTING);
  assert.equal(peekOf(now).getAttribute('data-key'), `fold-story:${now.dataset.key}`);
});

// ---------- One list ----------

test('a fold on one week shows folded on every other week\'s page: this week, an upcoming week and a past week share the list', () => {
  const { actions, calls } = recorder();
  const thisWeek = draw(week(), { actions });
  fire(peekOf(card(thisWeek, HOSTING)), 'click');
  const names = (c: unknown[][]) => c.flatMap((call) => (call[0] === 'foldStories' ? (call[1] as string[]) : []));
  const collapsed = names(calls);
  assert.deepEqual(collapsed, [HOSTING]);
  for (const model of [week(), upcoming(), past()]) {
    const root = draw(model, { collapsed });
    assert.deepEqual(stateOf(card(root, HOSTING)), FOLDED, model.kind);
  }
  assert.deepEqual(stateOf(card(draw(upcoming(), { collapsed }), CONTRACTOR)), OPEN);
  assert.deepEqual(stateOf(card(draw(past(), { collapsed }), CONTRACTOR)), OPEN);
});

// ---------- Keep hover ----------

/** The element as the pointer is on it: matches(':hover') says so, as a browser would, and linkedom cannot. */
function hover(el: Element): void {
  Object.assign(el, { matches: (selector: string) => selector === ':hover' });
}
const kept = (root: Element) => [...root.querySelectorAll('.brain-hover-kept')].map((el) => el.getAttribute('data-key'));

test('a redraw of a past week keeps what the pointer is on: the card, its chevron and the icon', () => {
  nextFrame();   // frames left by other tests
  const vm = past();
  const root = draw(vm);
  const contractor = card(root, CONTRACTOR);
  hover(contractor);
  hover(peekOf(contractor));
  draw(vm, { root });
  const now = card(root, CONTRACTOR);
  assert.notEqual(now, contractor);
  assert.deepEqual(kept(root), [contractor.dataset.key, `fold-story:${contractor.dataset.key}`]);
  hover(foldAll(root)!);
  draw(vm, { root });
  assert.deepEqual(kept(root), ['fold-all']);   // the pointer was on the icon alone this time
  hover(foldAll(root)!);   // the browser puts :hover on the new icon within a frame
  nextFrame();
  nextFrame();
  assert.deepEqual(kept(root), ['fold-all']);   // so the class stays
});

