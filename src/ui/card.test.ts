import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectCardVM, StoryCardVM } from '../model/types.ts';
import { absent, fire, recorder, rowFor, sampleLine, sampleNote } from '../../test/ui.ts';
import { projectCard, storyCard } from './card.ts';
import { viewHead } from './header.ts';

// Choose a contractor (mockup line 779): waiting, due 2026-10-24 (11 days out: "24 Oct"),
// 1 of its 3 lines done; the quote from Bram is chased on 2026-10-15, a Thursday.
function contractor(): StoryCardVM {
  const path = sampleNote('Choose a contractor').path;
  return {
    key: path, path, title: 'Choose a contractor', column: 'waiting',
    meta: [{ text: 'Waiting on Bram', tone: 'strong' }, { text: 'Renovate the kitchen' }, { text: 'Due 24 Oct' }],
    done: 1, total: 3,
    rows: [
      rowFor('Get three quotes'),
      rowFor('Get the written quote from Bram', { meta: [{ text: 'Chase Thu' }], ariaLabel: 'Get the written quote from Bram, waiting' }),
      rowFor('Check references for the shortlisted contractor'),
    ],
  };
}

// Website for Sam (mockup line 844): area Friends, due 2026-11-14, 2 of 8 done, next the doing header line.
function website(): ProjectCardVM {
  const path = sampleNote('Website for Sam').path;
  return {
    key: path, path, title: 'Website for Sam', status: 'active', arrangeKey: 'Website for Sam',
    meta: [{ text: 'Friends' }, { text: 'Due 14 Nov' }],
    done: 2, total: 8,
    next: rowFor('Build the homepage header', { meta: [{ text: 'Today' }], ariaLabel: 'Build the homepage header, in progress' }),
  };
}

const kids = (el: Element) => [...el.children].map((c) => [c.tagName, c.className]);

test('story card: tile, head with title link, meta, ring and count, then its lines', () => {
  const card = contractor();
  const li = storyCard(card, recorder().actions);
  assert.equal(li.tagName, 'LI');
  assert.equal(li.className, 'brain-tile brain-card brain-draggable');
  assert.equal(li.getAttribute('data-state'), 'waiting');
  assert.equal(li.getAttribute('tabindex'), '0');
  assert.equal(li.getAttribute('data-key'), card.key);
  assert.equal(li.hasAttribute('data-menu'), false);
  assert.deepEqual(kids(li), [['HEADER', 'brain-card-head'], ['UL', 'brain-tasks']]);

  const head = li.children[0];
  assert.deepEqual(kids(head), [['DIV', ''], ['DIV', 'brain-card-side']]);   // the ring and count sit in the card's side, with its points
  const title = head.querySelector('h4.brain-card-title > a')!;
  assert.equal(title.className, 'brain-link brain-stretch');
  assert.equal(title.getAttribute('tabindex'), '-1');
  assert.equal(title.textContent, 'Choose a contractor');
  assert.deepEqual([...head.querySelector('.brain-meta')!.children].map((el) => [el.tagName, el.className, el.textContent]), [
    ['SPAN', 'brain-strong', 'Waiting on Bram'],
    ['SPAN', '', 'Renovate the kitchen'],
    ['SPAN', '', 'Due 24 Oct'],
  ]);
  assert.equal(head.querySelector('.brain-ring')?.getAttribute('aria-label'), '1 of 3 done');
  assert.equal(head.querySelector('.brain-progress > span')?.textContent, '1/3');

  const rows = [...li.querySelectorAll('.brain-tasks > .brain-task')];
  assert.deepEqual(rows.map((r) => r.getAttribute('data-state')), ['done', 'waiting', 'todo']);
  assert.deepEqual(rows.map((r) => r.className), ['brain-task', 'brain-task', 'brain-task']);
  // On a draggable card every link refuses the browser's own drag, the lines' links included.
  assert.equal([...li.querySelectorAll('a')].every((a) => a.getAttribute('draggable') === 'false'), true);
});

test('story card in To do: data-state todo, and a ring with no fill (Order cabinets, 0 of 2)', () => {
  const path = sampleNote('Order cabinets').path;
  const li = storyCard({
    key: path, path, title: 'Order cabinets', column: 'todo', meta: [{ text: 'Renovate the kitchen' }],
    done: 0, total: 2, rows: [rowFor('Re-measure the corner under the sink'), rowFor('Pick the cabinet colour and handles')],
  }, recorder().actions);
  assert.equal(li.getAttribute('data-state'), 'todo');
  assert.equal(li.querySelector('.brain-ring')?.children.length, 1);
  assert.equal(li.querySelector('.brain-progress > span')?.textContent, '0/2');
});

test('story card: a doing one has no strong part; its card writes Waiting, and Space on a done one opens it again', async () => {
  const { actions, calls } = recorder();
  const path = sampleNote("Choose hosting for Sam's site").path;
  const doing = storyCard({
    key: path, path, title: "Choose hosting for Sam's site", column: 'doing', meta: [{ text: 'Website for Sam' }], done: 0, total: 1, rows: [],
  }, actions);
  assert.equal(doing.getAttribute('data-state'), 'doing');
  assert.equal(doing.querySelector('.brain-tasks')?.outerHTML, undefined);   // no lines, no list
  document.body.append(doing);
  fire(doing, 'keydown', { key: 'F10', shiftKey: true });
  assert.equal(document.querySelector('.brain-popover')?.getAttribute('data-kind'), 'story');
  fire(document.querySelector('[data-set="waiting"]')!, 'click');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const done = storyCard({ key: path, path, title: 'x', column: 'done', meta: [], done: 1, total: 1, rows: [] }, actions);
  assert.equal(done.getAttribute('data-state'), 'done');
  assert.equal(done.querySelector('.brain-meta')?.outerHTML, undefined);     // no meta, no empty line
  fire(done, 'keydown', { key: ' ' });
  assert.deepEqual(calls, [
    ['setNoteStatus', path, 'waiting'],
    ['setNoteStatus', path, 'open'],
  ]);
  document.querySelector('.brain-popover')?.remove();
});

test('project card: Space completes an active project and reopens a done one, and the other keys open no card', () => {
  const { actions, calls } = recorder();
  const active = projectCard(website(), actions);
  const done = projectCard({ ...website(), status: 'done' }, actions);
  document.body.append(active, done);
  fire(active, 'keydown', { key: ' ' });
  fire(done, 'keydown', { key: ' ' });
  assert.deepEqual(calls, [['setNoteStatus', website().path, 'done'], ['setNoteStatus', website().path, 'active']]);
  fire(active, 'keydown', { key: 'Tab', shiftKey: true });
  absent(document.querySelector('.brain-popover'));
  done.remove();
  active.remove();
});

test('story card: Enter opens, Space marks it done, its card writes a story status; its lines keep their own keys', async () => {
  const { actions, calls } = recorder();
  const card = contractor();
  const li = storyCard(card, actions);
  document.body.append(li);
  fire(li, 'keydown', { key: 'Enter' });
  fire(li, 'keydown', { key: ' ' });
  fire(li.querySelector('.brain-card-title a')!, 'contextmenu', { clientX: 40, clientY: 48 });
  fire(document.querySelector('[data-set="done"]')!, 'click');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const quotes = sampleLine('Get three quotes');
  fire(li.querySelector('.brain-tasks > li')!, 'keydown', { key: 'Enter' });
  assert.deepEqual(calls, [
    ['open', card.path, undefined],
    ['setNoteStatus', card.path, 'done'],
    ['setNoteStatus', card.path, 'done'],
    ['open', quotes.path, quotes.line],
  ]);
  document.querySelector('.brain-popover')?.remove();
});

test('project card: data-menu project, ring 2 of 8, and the Next block', async () => {
  const { actions, calls } = recorder();
  const card = website();
  const li = projectCard(card, actions);
  assert.equal(li.className, 'brain-tile brain-card brain-draggable');
  assert.equal(li.getAttribute('data-state'), 'active');
  assert.equal(li.getAttribute('data-menu'), 'project');
  assert.equal(li.getAttribute('tabindex'), '0');
  assert.deepEqual(kids(li), [['HEADER', 'brain-card-head'], ['P', 'brain-label'], ['UL', 'brain-tasks']]);
  assert.equal(li.children[1].textContent, 'Next');
  assert.deepEqual([...li.querySelector('.brain-card-head .brain-meta')!.children].map((el) => [el.tagName, el.textContent]),
    [['SPAN', 'Friends'], ['SPAN', 'Due 14 Nov']]);
  const fill = li.querySelector<SVGElement>('.brain-ring-fill')!;
  assert.equal(fill.style.getPropertyValue('--brain-p'), '25');
  assert.equal(li.querySelector('.brain-progress > span')?.textContent, '2/8');

  const next = li.querySelector('.brain-tasks > .brain-task')!;
  assert.equal(next.getAttribute('data-state'), 'doing');
  assert.equal(next.className, 'brain-task');
  assert.equal(next.querySelector('.brain-meta')?.textContent, 'Today');

  fire(li.querySelector('.brain-card-title a')!, 'contextmenu', { clientX: 40, clientY: 48 });
  fire(document.querySelector('[data-set="paused"]')!, 'click');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [['setNoteStatus', card.path, 'paused']]);
  document.querySelector('.brain-popover')?.remove();
});

test('a done project: no ring and no Next (Move to a new bank, done 2026-10-02)', () => {
  const note = sampleNote('Move to a new bank');
  const all = note.tasks.length;   // everything is done
  const li = projectCard({
    key: note.path, path: note.path, title: 'Move to a new bank', status: 'done', arrangeKey: 'Move to a new bank',
    meta: [{ text: 'Money' }, { text: 'Done 2 Oct' }], done: all, total: all,
  }, recorder().actions);
  assert.equal(li.getAttribute('data-state'), 'done');
  assert.deepEqual(kids(li), [['HEADER', 'brain-card-head']]);
  assert.deepEqual(kids(li.children[0]), [['DIV', '']]);
});

test('viewHead: Today, with an accent label, a ring and "4 left"', () => {
  const head = viewHead({
    label: 'Tuesday', title: '13 October', accent: true,
    figure: { ring: { done: 0, total: 4, label: '0 of 4 done today' }, strong: '4', rest: 'left' },
  });
  assert.equal(head.tagName, 'DIV');
  assert.equal(head.className, 'brain-head');
  const label = head.querySelector('p.brain-label')!;
  assert.equal(label.className, 'brain-label brain-label-accent');
  assert.equal(label.textContent, 'Tuesday');
  assert.equal(head.querySelector('h2.brain-title')?.textContent, '13 October');
  const end = head.children[1];   // the figure sits in the head's end, as the mockup has it
  assert.equal(end.className, 'brain-head-end');
  const figure = end.children[0];
  assert.equal(figure.tagName, 'P');
  assert.equal(figure.className, 'brain-figure');
  const ringEl = figure.children[0];
  assert.equal(ringEl.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(ringEl.getAttribute('aria-label'), '0 of 4 done today');
  assert.equal(ringEl.children.length, 1);   // 0 of 4: only the track
  assert.equal(figure.children[1].innerHTML, '<b>4</b> left');
});

test('viewHead: a ring of 0 of 0 is a track and no NaN (an empty day)', () => {
  const head = viewHead({
    label: 'Tuesday', title: '13 October', accent: true,
    figure: { ring: { done: 0, total: 0, label: '0 of 0 done today' }, strong: '0', rest: 'left' },
  });
  assert.equal(head.querySelector('.brain-ring')?.children.length, 1);
  assert.doesNotMatch(head.outerHTML, /NaN|Infinity/);
});

test('viewHead: Waiting, a <header> whose figure reads "next chase Thu"', () => {
  const head = viewHead({ label: 'Waiting', title: '2 open', header: true, figure: { before: 'next chase', strong: 'Thu', rest: '' } });
  assert.equal(head.tagName, 'HEADER');
  assert.equal(head.querySelector('p.brain-label')?.className, 'brain-label');
  absent(head.querySelector('.brain-ring'));
  assert.equal(head.querySelector('.brain-figure > span')?.innerHTML, 'next chase <b>Thu</b>');
});

test('viewHead without a figure: Backlog, "2 to sort"', () => {
  const head = viewHead({ label: 'Backlog', title: '2 to sort', header: true });
  assert.deepEqual(kids(head), [['DIV', '']]);
  assert.equal(head.querySelector('.brain-title')?.textContent, '2 to sort');
});
