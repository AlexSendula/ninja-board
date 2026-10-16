import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { renderGuide } from './guide.ts';
import { buildGuide } from '../model/guide.ts';
import type { GuideVM } from '../model/types.ts';
import type { Actions } from './actions.ts';

// The mockup's setup: Tasks on with the Dataview format and the done date set, and no Waiting status yet.
const MOCKUP_SETUP = { on: true, settings: { taskFormat: 'dataview', setDoneDate: true, statusSettings: { customStatuses: [] } } };
const vm = buildGuide(MOCKUP_SETUP);

function rendered(model: GuideVM = vm, actions: Actions = recorder().actions): HTMLElement {
  const root = document.createElement('div');
  renderGuide(root, model, actions);
  return root;
}

function page(root: HTMLElement): HTMLElement {
  const p = root.querySelector<HTMLElement>(':scope > .brain-view > .brain-page[data-view="guide"]');
  assert.ok(p, 'no guide page');
  return p;
}

const tileOf = (root: HTMLElement, area: string) => {
  const t = root.querySelector<HTMLElement>(`.brain-guide > section.brain-tile.brain-area-${area}`);
  assert.ok(t, 'no tile ' + area);
  return t;
};

/**
 * An element as the mockup check reads it: its tag, sorted classes and the attributes that carry meaning,
 * then its children. Neighbouring text is joined and trimmed ("Backlog &amp; Waiting" parses as three
 * text nodes); empty text and comments are skipped.
 */
function shape(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].sort().map((c) => `.${c}`).join('');
  const attrs = ['id', 'data-state', 'data-when', 'role', 'aria-label', 'aria-hidden', 'scope']
    .filter((a) => el.hasAttribute(a)).map((a) => `[${a}=${el.getAttribute(a)}]`).join('');
  const out = [`<${tag}${classes}${attrs}>`];
  let text = '';
  const flush = () => {
    if (text.trim()) out.push(text.trim());
    text = '';
  };
  for (const child of el.childNodes) {
    if (child.nodeType === 3) text += child.textContent;
    else if (child.nodeType === 1) {
      flush();
      out.push(...shape(child as Element));
    }
  }
  flush();
  out.push(`</${tag}>`);
  return out;
}

test("Guide: the page matches the mockup's Guide, element for element and word for word", () => {
  const html = readFileSync(new URL('../../design/mockup.html', import.meta.url), 'utf8');
  const mockup = parseHTML(html).document.querySelector('.brain-page[data-view="guide"]');
  assert.ok(mockup, 'no Guide in the mockup');
  // The mockup's own setup: Tasks on, Dataview, no Waiting status. Its page differs only in `hidden`, not read.
  assert.deepEqual(shape(page(rendered())), shape(mockup));
});

test('Guide: the head says Ninja Board and Guide, with no figure and no ?', () => {
  const p = page(rendered());
  assert.equal(p.querySelector(':scope > .brain-head .brain-label')?.textContent, 'Ninja Board');
  assert.equal(p.querySelector(':scope > .brain-head .brain-title')?.textContent, 'Guide');
  assert.equal(p.querySelectorAll('.brain-figure, .brain-help').length, 0);
});

test('Guide: seven tiles, in order', () => {
  const tiles = [...page(rendered()).querySelectorAll(':scope > .brain-grid.brain-guide > section.brain-tile')];
  assert.deepEqual(tiles.map((t) => [...t.classList].find((c) => c.startsWith('brain-area-'))), [
    'brain-area-marks', 'brain-area-ways', 'brain-area-plan', 'brain-area-views', 'brain-area-words', 'brain-area-who', 'brain-area-setup',
  ]);
});

test('Guide: Marks draws every state with the real marks, and nothing can be pressed', () => {
  const marks = tileOf(rendered(), 'marks');
  const rows = [...marks.querySelectorAll<HTMLElement>(':scope > ul.brain-tasks > li.brain-task')];
  assert.deepEqual(rows.map((r) => r.dataset.state ?? (r.querySelector('.brain-repeat') ? 'repeat' : '?')), [
    'todo', 'doing', 'waiting', 'done', 'dropped', 'repeat', 'todo',
  ]);
  assert.equal(rows[6]?.querySelector('.brain-meta > .brain-overdue')?.textContent, '3 days overdue');
  assert.equal(marks.querySelector('.brain-cal.brain-is-late')?.getAttribute('aria-label'), 'Chase date passed, Monday 12 October');
  assert.equal(marks.querySelector('.brain-card .brain-ring')?.getAttribute('aria-label'), '1 of 3 done');
  assert.equal(marks.querySelectorAll('button, a, [tabindex]').length, 0);
});

test('Guide: Doing things has five ways; Plan or set a state opens with the menu key, and Arrange is Alt ↑ ↓', () => {
  const rows = [...tileOf(rendered(), 'ways').querySelectorAll('table.brain-ways > tbody > tr')];
  assert.deepEqual(rows.map((r) => r.querySelector('th')?.textContent), ['Tick', 'Plan or set a state', 'Move', 'Arrange', 'Open']);
  assert.deepEqual([...rows[3]!.querySelectorAll('kbd.brain-key')].map((k) => k.textContent), ['Alt', '↑', '↓']);
  assert.equal(rows[2]?.querySelectorAll('td')[2]?.textContent, 'Plan or set a state');
});

test('Guide: Planning has the seven steps of the planner card, in order, each with its line', () => {
  const steps = [...tileOf(rendered(), 'plan').querySelectorAll<HTMLElement>(':scope > ul.brain-tasks > li.brain-task')];
  assert.deepEqual(steps.map((li) => li.querySelector('.brain-task-text')?.textContent), [
    'Right-click a task', 'This week, any day', 'Pick a day', 'Pick it again', 'Right-click a day', 'Next week, Later', 'Plan this week',
  ]);
  assert.equal(steps[3]?.querySelector('.brain-meta > span')?.textContent,
    'Due that day instead, in red; once more makes it the do day again');
  assert.equal(steps[4]?.querySelector('.brain-meta > span')?.textContent,
    'Due that day, keeping a do day on another day; on the red day, the deadline goes');
});

test('Guide: the four views each have their line, and each link opens its dashboard note', () => {
  const { actions, calls } = recorder();
  const links = [...tileOf(rendered(vm, actions), 'views').querySelectorAll<HTMLElement>('a.brain-task-text')];
  assert.deepEqual(links.map((a) => a.textContent), ['Today', 'Week', 'Projects', 'Backlog & Waiting']);
  for (const a of links) a.click();
  assert.deepEqual(calls, [
    ['open', '01 Dashboard/01 Today.md', undefined],
    ['open', '01 Dashboard/02 Week.md', undefined],
    ['open', '01 Dashboard/03 Projects.md', undefined],
    ['open', '01 Dashboard/04 Backlog.md', undefined],
  ]);
});

test('Guide: no ? and no found line anywhere on the page', () => {
  assert.equal(rendered().querySelectorAll('.brain-help, .brain-help-icon, .brain-is-found, .brain-help-dot').length, 0);
});

/** Each setup row as its state, its text and its meta. */
function setupRows(root: HTMLElement): [string | undefined, string | null | undefined, string[]][] {
  return [...tileOf(root, 'setup').querySelectorAll<HTMLElement>('li.brain-task')].map((li) => [
    li.dataset.state,
    li.querySelector('.brain-task-text')?.textContent,
    [...li.querySelectorAll('.brain-meta > span')].map((s) => (s.className ? `${s.textContent} (${s.className})` : s.textContent ?? '')),
  ]);
}

test("Guide: the mockup's setup, three lines OK and the Waiting status to fix", () => {
  const root = rendered();
  assert.deepEqual(setupRows(root), [
    ['done', 'Tasks plugin on: OK', []],
    ['done', 'Task Format is Dataview: OK', []],
    ['done', 'Tasks sets the done date: OK', []],
    ['todo', 'Add a Waiting status: symbol w, type ON_HOLD', ['To fix (brain-late)', 'Tasks settings, Task Statuses']],
  ]);
  const fix = tileOf(root, 'setup').querySelectorAll('li.brain-task')[3];
  assert.deepEqual([...(fix?.querySelectorAll('.brain-task-text > .brain-strong') ?? [])].map((s) => s.textContent), ['w', 'ON_HOLD']);
  assert.equal(tileOf(root, 'setup').querySelectorAll('.brain-sr').length, 3);
});

test("Guide: with Tasks off, a line to fix and three Brain can't check, drawn with the waiting mark", () => {
  assert.deepEqual(setupRows(rendered(buildGuide({ on: false }))), [
    ['todo', 'Turn on the Tasks plugin', ['To fix (brain-late)', 'Settings, Community plugins']],
    ['waiting', 'Task Format is Dataview', ["Can't check", 'Tasks settings, Task Format']],
    ['waiting', 'Tasks sets the done date', ["Can't check", 'Tasks settings']],
    ['waiting', 'Waiting status: symbol w, type ON_HOLD', ["Can't check", 'Tasks settings, Task Statuses']],
  ]);
});

test('Guide: a Set done date that is off is a line to fix, with its setting named', () => {
  const off = { on: true, settings: { taskFormat: 'dataview', setDoneDate: false, statusSettings: { customStatuses: [] } } };
  const row = setupRows(rendered(buildGuide(off)))[2];
  assert.deepEqual(row, ['todo', 'Turn on Set done date on every completed task', ['To fix (brain-late)', 'Tasks settings']]);
});
