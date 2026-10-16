import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProjects } from './projects.ts';
import { parseTaskLine } from './taskLine.ts';
import { loadSample } from '../../test/sample.ts';
import type { Arrangement, NoteInfo, NoteType, ProjectCardVM, TaskLine } from './types.ts';

const TODAY = '2026-10-13';
const vm = buildProjects(loadSample(), TODAY);

function cardNamed(title: string): ProjectCardVM {
  const card = vm.columns.flatMap((c) => c.cards).find((c) => c.title === title);
  if (!card) throw new Error(`no card "${title}"`);
  return card;
}

// The card as plain values, with meta reduced to its texts.
function summary(card: ProjectCardVM) {
  return {
    title: card.title,
    status: card.status,
    done: card.done,
    total: card.total,
    meta: card.meta.map((m) => m.text),
    next: card.next && {
      title: card.next.title,
      state: card.next.state,
      meta: card.next.meta.map((m) => m.text),
    },
  };
}

function note(path: string, type: NoteType, extra: Partial<NoteInfo> = {}): NoteInfo {
  const parts = path.split('/');
  const name = parts[parts.length - 1].replace(/\.md$/, '');
  return { path, name, folder: parts.slice(0, -1).join('/'), type, tasks: [], ...extra };
}

function lines(path: string, raws: string[]): TaskLine[] {
  return raws.map((raw, i) => parseTaskLine(raw, path, i)!);
}

test('projects: header counts active and all shown projects', () => {
  assert.equal(vm.active, 2);
  // 5 in v0.1.0, and eleven someday and four done projects.
  assert.equal(vm.total, 20);
});

test('projects: columns in order; Active and Paused soonest due first, Someday and Done newest first', () => {
  assert.deepEqual(
    vm.columns.map((c) => [c.status, c.title, c.cards.map((card) => card.title)]),
    [
      ['active', 'Active', ['Website for Sam', 'Renovate the kitchen']],
      ['paused', 'Paused', ['Learn Spanish']],
      // By created, newest first: 4 Oct, 12 Sep, 30 Aug, 2 Aug, 11 Jul, 20 Jun, 5 Jun, 24 May, 10 May, 26 Apr, 12 Apr, 29 Mar.
      ['someday', 'Someday', [
        'Organise a reunion weekend', 'Run a half marathon', 'Plan summer vacation', 'Repaint the bedroom',
        'Build a vegetable garden', 'Digitise the family photos', 'Open a holiday savings account',
        'Write a family recipe book', 'Learn to sail', 'Set up a home office', 'Plan a trip to Japan', 'Start a monthly dinner club',
      ]],
      // By done, newest first: 11 Oct, 6 Oct, 2 Oct, 29 Sep, 24 Sep.
      ['done', 'Done', [
        'Paint the garden fence', 'Switch health insurance', 'Move to a new bank', 'File the tax return', 'Clear out the attic',
      ]],
    ],
  );
});

const openCards = [
  {
    title: 'Website for Sam', status: 'active', done: 2, total: 8, meta: ['Friends', 'Due 14 Nov'],
    next: { title: 'Build the homepage header', state: 'doing', meta: ['Planned today'] },
  },
  {
    title: 'Renovate the kitchen', status: 'active', done: 1, total: 6, meta: ['Home', 'Due 20 Dec'],
    next: { title: 'Measure the kitchen walls', state: 'todo', meta: [] },
  },
  {
    title: 'Learn Spanish', status: 'paused', done: 0, total: 1, meta: ['Health'],
    next: { title: 'Finish unit 4 of the course', state: 'todo', meta: [] },
  },
  {
    title: 'Plan summer vacation', status: 'someday', done: 0, total: 2, meta: [],
    next: { title: 'Pick a destination', state: 'todo', meta: [] },
  },
];

for (const want of openCards) {
  test(`projects: ${want.title} card`, () => {
    assert.deepEqual(summary(cardNamed(want.title)), want);
  });
}

test('projects: a done project shows its area and done date, and nothing next', () => {
  const card = cardNamed('Move to a new bank');
  assert.equal(card.status, 'done');
  assert.deepEqual(card.meta.map((m) => m.text), ['Money', 'Done 2 Oct']);
  assert.equal(card.next, undefined);
  assert.equal(card.done, card.total);
});

test('projects: a done project with an open line still has no next', () => {
  const p = '03 Projects/Old thing/Old thing.md';
  const s = { notes: [note(p, 'project', { status: 'done', done: '2026-10-02', tasks: lines(p, ['- [ ] Tidy up']) })] };
  const [card] = buildProjects(s, TODAY).columns[3].cards;
  assert.equal(card.next, undefined);
});

test('projects: an empty snapshot gives four empty columns', () => {
  assert.deepEqual(buildProjects({ notes: [] }, TODAY), {
    active: 0,
    total: 0,
    columns: [
      { status: 'active', title: 'Active', cards: [] },
      { status: 'paused', title: 'Paused', cards: [] },
      { status: 'someday', title: 'Someday', limit: 5, cards: [] },
      { status: 'done', title: 'Done', limit: 3, cards: [] },
    ],
    saved: {},
  });
});

test('projects: saved holds the lists of Active, Paused and Someday, and nothing else', () => {
  const s = loadSample();
  assert.deepEqual(buildProjects(s, TODAY).saved, {});
  assert.deepEqual(
    buildProjects(s, TODAY, { paused: ['Learn Spanish'], active: ['Renovate the kitchen'], todo: ['Home › Clean the gutters'] }).saved,
    { active: ['Renovate the kitchen'], paused: ['Learn Spanish'] },
  );
});

test('projects: a project with no lines counts 0 of 0 and has nothing next', () => {
  const p = '03 Projects/Write a will/Write a will.md';
  const [card] = buildProjects({ notes: [note(p, 'project', { status: 'active' })] }, TODAY).columns[0].cards;
  assert.deepEqual(summary(card), {
    title: 'Write a will', status: 'active', done: 0, total: 0, meta: [], next: undefined,
  });
});

test('projects: pointers and dropped lines are not counted, next falls back to a story, dropped projects are hidden', () => {
  const p = '03 Projects/Garden/Garden.md';
  const story = '03 Projects/Garden/Dig the beds.md';
  const old = '03 Projects/Old plan/Old plan.md';
  const s = {
    notes: [
      note(p, 'project', {
        status: 'active',
        tasks: lines(p, ['- [x] Buy seeds', '- [-] Rent a tiller', '- [ ] [[Dig the beds]]']),
      }),
      note(story, 'task', {
        status: 'open', projectPath: p, parentName: 'Garden',
        tasks: lines(story, ['- [-] Hire help', '- [ ] Dig the north bed']),
      }),
      note(old, 'project', { status: 'dropped', tasks: lines(old, ['- [ ] Never mind']) }),
      note('03 Projects/Draft/Draft.md', 'project'),
    ],
  };
  const projects = buildProjects(s, TODAY);
  assert.equal(projects.total, 1);
  // Counted: Buy seeds (done) and Dig the north bed. The pointer is skipped, even though it is the first open line.
  assert.deepEqual(summary(projects.columns[0].cards[0]), {
    title: 'Garden', status: 'active', done: 1, total: 2, meta: [],
    next: { title: 'Dig the north bed', state: 'todo', meta: [] },
  });
});

test('projects: a dropped story counts nothing and is never next', () => {
  const p = '03 Projects/Garden/Garden.md';
  const story = '03 Projects/Garden/Dig the beds.md';
  const s = {
    notes: [
      note(p, 'project', { status: 'active' }),
      note(story, 'task', { status: 'dropped', projectPath: p, parentName: 'Garden', tasks: lines(story, ['- [ ] Dig the north bed']) }),
    ],
  };
  const [card] = buildProjects(s, TODAY).columns[0].cards;
  assert.deepEqual(summary(card), { title: 'Garden', status: 'active', done: 0, total: 0, meta: [], next: undefined });
});

// ---------- Arranging (Task 4) ----------

const cardTitles = (cards: ProjectCardVM[]) => cards.map((c) => c.title);

test("projects: every card's arrangement key is its note's name", () => {
  const cards = vm.columns.flatMap((c) => c.cards);
  assert.ok(cards.length > 0);
  for (const card of cards) assert.equal(card.arrangeKey, card.title);
});

test('projects: an Active list puts Renovate the kitchen before Website for Sam', () => {
  const projects = buildProjects(loadSample(), TODAY, { active: ['Renovate the kitchen'] });
  assert.deepEqual(cardTitles(projects.columns[0].cards), ['Renovate the kitchen', 'Website for Sam']);
  assert.deepEqual([projects.active, projects.total], [vm.active, vm.total]);
});

test('projects: Paused and Someday follow their lists; Done keeps its order, even when given a list', () => {
  const project = (name: string, extra: Partial<NoteInfo>) => note(`03 Projects/${name}/${name}.md`, 'project', extra);
  const s = {
    notes: [
      project('Alpha', { status: 'someday', due: '2026-11-01' }),
      project('Beta', { status: 'someday', due: '2026-12-01' }),
      project('Gamma', { status: 'someday' }),
      project('Pause one', { status: 'paused' }),
      project('Pause two', { status: 'paused' }),
      project('Old one', { status: 'done', done: '2026-09-01' }),
      project('Older', { status: 'done', done: '2026-08-01' }),
    ],
  };
  const plain = buildProjects(s, TODAY);
  assert.deepEqual(plain.columns.map((c) => cardTitles(c.cards)), [
    [], ['Pause one', 'Pause two'], ['Alpha', 'Beta', 'Gamma'], ['Old one', 'Older'],
  ]);
  // Arrangement has no done column; the cast stands in for a hand-edited arrange: that has one anyway.
  const lists = { paused: ['Pause two'], someday: ['Gamma', 'Alpha'], done: ['Older', 'Old one'] } as Arrangement;
  assert.deepEqual(buildProjects(s, TODAY, lists).columns.map((c) => cardTitles(c.cards)), [
    [], ['Pause two', 'Pause one'], ['Gamma', 'Alpha', 'Beta'], ['Old one', 'Older'],
  ]);
});

// ---------- Long lists and their order (Task 9) ----------

test("projects: Someday's limit is 5 and Done's 3; Active and Paused have no limit", () => {
  assert.deepEqual(vm.columns.map((c) => [c.status, c.limit]), [
    ['active', undefined], ['paused', undefined], ['someday', 5], ['done', 3],
  ]);
  // No limit key at all, so a column compared whole stays as it was.
  assert.deepEqual(vm.columns.map((c) => 'limit' in c), [false, false, true, true]);
});

test('projects: undated someday and done projects go last, and a tie goes by name', () => {
  const project = (name: string, extra: Partial<NoteInfo>) => note(`03 Projects/${name}/${name}.md`, 'project', extra);
  const s = {
    notes: [
      project('Bee', { status: 'someday', created: '2026-01-01' }),
      project('Ant', { status: 'someday' }),
      project('Dog', { status: 'someday', created: '2026-05-01' }),
      project('Aardvark', { status: 'someday' }),
      project('Cat', { status: 'someday', created: '2026-05-01' }),
      project('Zed', { status: 'done', done: '2026-02-01' }),
      project('Yak', { status: 'done' }),
      project('Xen', { status: 'done', done: '2026-03-01' }),
    ],
  };
  const [, , someday, done] = buildProjects(s, TODAY).columns;
  assert.deepEqual(cardTitles(someday.cards), ['Cat', 'Dog', 'Bee', 'Aardvark', 'Ant']);
  assert.deepEqual(cardTitles(done.cards), ['Xen', 'Zed', 'Yak']);
});

test('projects: an arranged Someday list goes first, then the rest newest first; the limit stays 5', () => {
  const someday = buildProjects(loadSample(), TODAY, { someday: ['Open a holiday savings account', 'Build a vegetable garden'] }).columns[2];
  assert.deepEqual(cardTitles(someday.cards), [
    'Open a holiday savings account', 'Build a vegetable garden',
    'Organise a reunion weekend', 'Run a half marathon', 'Plan summer vacation', 'Repaint the bedroom',
    'Digitise the family photos', 'Write a family recipe book', 'Learn to sail', 'Set up a home office',
    'Plan a trip to Japan', 'Start a monthly dinner club',
  ]);
  assert.equal(someday.limit, 5);
});
