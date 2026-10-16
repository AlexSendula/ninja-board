import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent, recorder, same } from '../../test/ui.ts';   // first: it installs the DOM
import { dropOnProjects, renderProjects } from './projects.ts';
import type { DropTarget } from './drag.ts';
import { buildProjects } from '../model/projects.ts';
import { loadSample } from '../../test/sample.ts';
import type { ProjectCardVM, ProjectsVM } from '../model/types.ts';
import type { Actions, ListSpec } from './actions.ts';

const TODAY = '2026-10-13';
const vm = buildProjects(loadSample(), TODAY);

function rendered(model: ProjectsVM, actions: Actions = recorder().actions): HTMLElement {
  const root = document.createElement('div');
  renderProjects(root, model, actions);
  return root;
}

function columns(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.brain-page > .brain-board.brain-board-projects > section.brain-col')];
}

function card(title: string): ProjectCardVM {
  const found = vm.columns.flatMap((c) => c.cards).find((c) => c.title === title);
  assert.ok(found, 'no card ' + title);
  return found;
}

function elementFor(root: HTMLElement, c: ProjectCardVM): HTMLElement {
  const el = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((e) => e.dataset.key === c.key);
  assert.ok(el, 'no element for ' + c.key);
  return el;
}

test('Projects: header says 2 active and 20 in total', () => {
  const root = rendered(vm);
  assert.equal(root.querySelector('.brain-view > .brain-page > .brain-head .brain-label')?.textContent, 'Projects');
  assert.equal(root.querySelector('.brain-head .brain-title')?.textContent, '2 active');
  // 5 in v0.1.0, and eleven someday and four done projects.
  assert.equal(root.querySelector('.brain-head .brain-figure')?.textContent, '20 in total');
});

test('Projects: four visible columns, and the active cards show 2/8 and 1/6', () => {
  const cols = columns(rendered(vm));
  assert.deepEqual(cols.map((c) => [c.dataset.column, c.hidden]), [
    ['active', false], ['paused', false], ['someday', false], ['done', false],
  ]);
  assert.deepEqual(cols.map((c) => c.querySelector('h3.brain-label')?.textContent), ['Active', 'Paused', 'Someday', 'Done']);
  // Someday draws its 5 newest and Done its 3 newest; Show all holds the rest.
  assert.deepEqual(cols.map((c) => c.querySelectorAll(':scope > .brain-col-items > [data-key]').length), [2, 1, 5, 3]);
  const progress = [...cols[0].querySelectorAll('.brain-progress > span')].map((s) => s.textContent);
  assert.deepEqual(progress, ['2/8', '1/6']);
});

/** A drop on a column; no place: Done, or a call that only changes the status. */
const onto = (column: string, index: number | null = null): DropTarget => ({ kind: 'column', column, index });

test('Projects: a drop on another column sets the project status', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  const drop = dropOnProjects(vm, actions);
  drop(elementFor(root, card('Learn Spanish')), onto('active'));
  drop(elementFor(root, card('Plan summer vacation')), onto('done'));
  // No change: the same column, or one that is not on the board.
  drop(elementFor(root, card('Website for Sam')), onto('active'));
  drop(elementFor(root, card('Website for Sam')), onto('dropped'));
  // A move also saves the column it left; the arranging tests below check those lists.
  assert.deepEqual(calls.filter(([name]) => name !== 'arrange'), [
    ['setNoteStatus', '03 Projects/Learn Spanish/Learn Spanish.md', 'active'],
    ['setNoteStatus', '03 Projects/Plan summer vacation/Plan summer vacation.md', 'done'],
  ]);
});

test('Projects: no projects gives four calm columns and no figure', () => {
  const root = rendered(buildProjects({ notes: [] }, TODAY));
  assert.equal(root.querySelector('.brain-title')?.textContent, '0 active');
  assert.equal(root.querySelectorAll('.brain-figure').length, 0);
  assert.deepEqual(
    columns(root).map((c) => c.querySelector('.brain-col-items > li.brain-empty')?.textContent),
    ['No active projects', 'Nothing paused', 'Nothing for someday', 'Nothing done yet'],
  );
});

// ---------- Long lists: the order of Someday and Done (Task 9) ----------

test('Projects: Someday and Done are drawn newest first, Someday 5 and Done 3', () => {
  const [, , someday, done] = columns(rendered(vm));
  // A column's card titles, in order.
  const titles = (col: HTMLElement) => [...col.querySelectorAll<HTMLElement>(':scope > .brain-col-items > [data-key]')]
    .map((li) => li.querySelector('.brain-card-title')?.textContent);
  assert.deepEqual(titles(someday), [
    'Organise a reunion weekend', 'Run a half marathon', 'Plan summer vacation', 'Repaint the bedroom', 'Build a vegetable garden',
  ]);
  assert.deepEqual(titles(done), ['Paint the garden fence', 'Switch health insurance', 'Move to a new bank']);
});

// ---------- Arranging ----------

test('Projects: Active, Paused and Someday can be arranged; Done keeps its time order', () => {
  assert.deepEqual(columns(rendered(vm)).map((c) => c.hasAttribute('data-arrange')), [true, true, true, false]);
});

test('Projects: a paused card dropped second in Active is active there; Paused, with no saved list, is not written', () => {
  const { actions, calls } = recorder();
  const root = rendered(vm, actions);
  dropOnProjects(vm, actions)(elementFor(root, card('Learn Spanish')), onto('active', 1));
  assert.deepEqual(calls, [
    ['setNoteStatus', '03 Projects/Learn Spanish/Learn Spanish.md', 'active'],
    ['arrange', { active: ['Website for Sam', 'Learn Spanish', 'Renovate the kitchen'] }],
  ]);
});

test('Projects: a card that leaves a column with a saved list is taken out of that list only, or the column is saved empty', () => {
  const [first, second, third] = cardsOf('someday');
  const arranged = buildProjects(loadSample(), TODAY, { paused: ['Learn Spanish'], someday: [first.arrangeKey, second.arrangeKey] });
  const { actions, calls } = recorder();
  const root = rendered(arranged, actions);
  const drop = dropOnProjects(arranged, actions);
  drop(elementFor(root, card('Learn Spanish')), onto('active', 1));
  // Paused held only this card: it is saved empty, which makes Paused automatic again.
  assert.deepEqual(calls, [
    ['setNoteStatus', '03 Projects/Learn Spanish/Learn Spanish.md', 'active'],
    ['arrange', { active: ['Website for Sam', 'Learn Spanish', 'Renovate the kitchen'], paused: [] }],
  ]);

  calls.length = 0;
  drop(elementFor(root, first), onto('paused', 0));
  // Someday's saved list loses only that card; the unlisted cards keep their automatic order.
  assert.deepEqual(calls, [
    ['setNoteStatus', first.path, 'paused'],
    ['arrange', { paused: [first.arrangeKey, 'Learn Spanish'], someday: [second.arrangeKey] }],
  ]);

  calls.length = 0;
  // A card the saved list does not hold leaves it alone: Someday is not written.
  drop(elementFor(root, third), onto('active', 0));
  assert.deepEqual(calls, [
    ['setNoteStatus', third.path, 'active'],
    ['arrange', { active: [third.arrangeKey, 'Website for Sam', 'Renovate the kitchen'] }],
  ]);
});

// ---------- Show all and the list modal (Task 11) ----------

/** The Show all button in a column's label row. */
function moreButton(col: HTMLElement): HTMLButtonElement | null {
  return col.querySelector<HTMLButtonElement>(':scope > .brain-label-row > button.brain-more');
}

/** The keys of the cards a column draws, in the order drawn. */
function drawn(col: HTMLElement): (string | undefined)[] {
  return [...col.querySelectorAll<HTMLElement>(':scope > .brain-col-items > [data-key]')].map((el) => el.dataset.key);
}

function cardsOf(status: string): ProjectCardVM[] {
  return vm.columns.find((c) => c.status === status)?.cards ?? [];
}

test('Projects: Done draws its 3 newest and Someday its 5, each with Show all in its label row', () => {
  const [, , someday, done] = columns(rendered(vm));
  assert.deepEqual(drawn(done), cardsOf('done').slice(0, 3).map((c) => c.key));
  assert.deepEqual(drawn(someday), cardsOf('someday').slice(0, 5).map((c) => c.key));
  assert.equal(moreButton(done)?.textContent, 'Show all 5');
  assert.equal(moreButton(someday)?.textContent, 'Show all 12');
  assert.equal(done.querySelector(':scope > .brain-label-row > h3.brain-label')?.textContent, 'Done');
  absent(done.querySelector(':scope > h3.brain-label'));   // the label row replaces the plain heading
});

test('Projects: a Someday of exactly its limit has no Show all, and draws all five', () => {
  const trimmed = { ...vm, columns: vm.columns.map((c) => (c.status === 'someday' ? { ...c, cards: c.cards.slice(0, c.limit) } : c)) };
  const [, , someday] = columns(rendered(trimmed));
  absent(moreButton(someday));
  assert.equal(drawn(someday).length, 5);
});

test('Projects: Active and Paused have no limit, so a plain heading and no Show all', () => {
  const [active, paused] = columns(rendered(vm));
  for (const col of [active, paused]) {
    absent(moreButton(col));
    assert.ok(col.querySelector(':scope > h3.brain-label'));
    assert.equal(drawn(col).length, cardsOf(col.dataset.column ?? '').length);
  }
});

test('Projects: Show all on Someday opens the list with its 12 cards, draggable, zones on the board', () => {
  const specs: ListSpec[] = [];
  const actions: Actions = {
    ...recorder().actions,
    showAll(spec) {
      specs.push(spec);
      return { update() {}, close() {}, isOpen: () => true };
    },
  };
  const root = rendered(vm, actions);
  moreButton(columns(root)[2])?.click();
  assert.equal(specs.length, 1);
  assert.deepEqual([specs[0].key, specs[0].title, specs[0].noun, specs[0].count, specs[0].drag], ['someday', 'Someday', 'someday projects', 12, true]);
  assert.equal(specs[0].entries.length, 12);
  same(specs[0].zones, root);
});

test('Projects: a re-render hands an open list modal its list again, so a card that left is gone from it', () => {
  const updates: [string, number][] = [];
  const actions: Actions = {
    ...recorder().actions,
    showAll() {
      return { update: (next) => { updates.push([next.key, next.count]); }, close() {}, isOpen: () => true };
    },
  };
  const root = rendered(vm, actions);
  moreButton(columns(root)[2])?.click();
  const gone = { ...vm, columns: vm.columns.map((c) => (c.status === 'someday' ? { ...c, cards: c.cards.slice(1) } : c)) };
  renderProjects(root, gone, actions);
  assert.deepEqual(updates, [['someday', 11]]);
});
