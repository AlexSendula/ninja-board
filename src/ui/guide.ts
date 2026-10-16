import type { GuideVM, MetaPart, SetupLineVM, SetupState, TaskState } from '../model/types.ts';
import type { Actions } from './actions.ts';
import type { Child } from './dom.ts';
import { h, link } from './dom.ts';
import { viewHead } from './header.ts';
import { checkMark, progress, repeatMark } from './marks.ts';
import { mountPage } from './page.ts';
import { metaLine } from './task.ts';

// The five states, each drawn with the real mark and said in a few words.
const MARKS: [TaskState, string, string][] = [
  ['todo', 'To do', 'Click the circle to tick it'],
  ['doing', 'Doing', 'Started, not finished'],
  ['waiting', 'Waiting', 'On someone else, until the chase date'],
  ['done', 'Done', 'Click again to untick'],
  ['dropped', 'Dropped', 'Not doing it after all'],
];

// The planner card in seven steps: what each one does, said in a few words.
const PLANNING: [string, string][] = [
  ['Right-click a task', 'Its card opens, and stays open while you pick'],
  ['This week, any day', 'For the whole week, no particular day'],
  ['Pick a day', "The day you'll do it"],
  ['Pick it again', 'Due that day instead, in red; once more makes it the do day again'],
  ['Right-click a day', 'Due that day, keeping a do day on another day; on the red day, the deadline goes'],
  ['Next week, Later', 'Another week, or No date yet: back to the backlog; a deadline in a week it leaves goes too'],
  ['Plan this week', 'On an upcoming week: drag from To plan onto a day, or onto Planned or due for any day'],
];

// The four views: the name of each link, its dashboard note, and its line.
const VIEWS: [string, string, string][] = [
  ['Today', '01 Today', "What's on now, what's due, and the day's schedule"],
  ['Week', '02 Week', 'The days, the board and Coming up; ‹ › for past weeks and weeks to plan'],
  ['Projects', '03 Projects', 'Every project by status, with its next step'],
  ['Backlog & Waiting', '04 Backlog', 'The inbox, undated tasks, someday, who you wait on'],
];

// The words the views use for time: the word, what it means, and the aside a view shows for it.
const WORDS: [string, string, MetaPart][] = [
  ['Today', 'Due today, planned today or earlier and still open, or a chase that has come', { text: 'Today' }],
  ['Overdue', 'Past its due date, still open', { text: '3 days overdue', tone: 'overdue', when: 'due' }],
  ['This week', 'Planned for the week, no day; Monday to Sunday', { text: 'This week', when: 'plan' }],
  ['Due', 'The deadline, in red', { text: 'Due Thu', when: 'due' }],
  ['Planned', 'The day you mean to do it', { text: 'Planned Wed', when: 'plan' }],
  ['Chase', 'When to ask again about a waiting task', { text: 'Chase Thu', when: 'plan' }],
  ['Moved', 'In a past week: it left that week for a new date', { text: 'moved → Thu 15 Oct' }],
];

const WHO: [string, string[]][] = [
  ['In Ninja Board', ['Tick and untick', 'Repeats', 'Set a state', 'Plan a day or a week', 'Set a deadline', 'Move a card', 'Arrange a board', 'Open a note']],
  ['With the agent', ['Create and plan', 'Archiving', 'Week records', 'Anything with date math']],
];

// A setup line's mark: ticked when fine, open when there is something to change, waiting when Brain can't tell.
const SETUP_MARK: Record<SetupState, TaskState> = { ok: 'done', fix: 'todo', unknown: 'waiting' };

/**
 * The Guide: the marks, how to do things, planning, the views, the time words, who does what, and a
 * live check of the Tasks plugin's setup. Its text lives here; only the setup lines come from the model.
 */
export function renderGuide(root: HTMLElement, vm: GuideVM, actions: Actions): void {
  const page = mountPage(root, 'guide');
  page.append(
    viewHead({ label: 'Ninja Board', title: 'Guide' }),
    h('div', 'brain-grid brain-guide', {}, [
      marksTile(actions),
      waysTile(),
      planningTile(actions),
      viewsTile(actions),
      wordsTile(actions),
      whoTile(actions),
      tile('brain-area-setup', 'Setup', [h('ul', 'brain-tasks', {}, vm.setup.map((line) => setupRow(line, actions)))]),
    ]),
  );
}

function tile(area: string, title: string, content: Child[]): HTMLElement {
  return h('section', `brain-tile ${area}`, {}, [h('h3', 'brain-label', {}, [title]), ...content]);
}

/** The marks with the real components, nothing to press; then a passed chase date and a story card with its ring. */
function marksTile(actions: Actions): HTMLElement {
  return tile('brain-area-marks', 'Marks', [
    h('ul', 'brain-tasks', {}, [
      ...MARKS.map(([state, name, means]) => markRow(state, [name], [{ text: means }], actions)),
      markRow('repeat', ['Repeating'], [{ text: 'Ticked, it moves to its next date' }], actions),
      markRow('todo', ['Overdue'], [{ text: '3 days overdue', tone: 'overdue', when: 'due' }, { text: 'past its due date' }], actions),
    ]),
    h('header', 'brain-card-head', {}, [
      h('div', undefined, {}, [
        h('p', 'brain-card-title', {}, ['Chase passed']),
        metaLine([{ text: 'Chase yesterday', tone: 'late', when: 'plan' }, { text: 'time to ask again' }], actions),
      ]),
      h('div', 'brain-cal brain-is-late', { role: 'img', 'aria-label': 'Chase date passed, Monday 12 October' }, [
        h('span', 'brain-label', {}, ['Mon']),
        h('span', 'brain-cal-num', {}, ['12']),
      ]),
    ]),
    h('div', 'brain-tile brain-card', {}, [
      h('header', 'brain-card-head', {}, [
        h('div', undefined, {}, [
          h('p', 'brain-card-title', {}, ['Choose a contractor']),
          metaLine([{ text: 'Renovate the kitchen' }], actions),
        ]),
        progress(1, 3),
      ]),
    ]),
    metaLine([{ text: 'A story: a task with steps; its ring counts the steps done' }], actions),
  ]);
}

/** Each thing to do, with the mouse, by touch and from the keyboard. */
function waysTile(): HTMLElement {
  const key = (name: string) => h('kbd', 'brain-key', {}, [name]);
  const ways: [string, string, string, Child[]][] = [
    ['Tick', 'Click the circle', 'Tap the circle', [key('Space')]],
    ['Plan or set a state', 'Right-click', 'Long-press', [key('Menu'), ' or ', key('Shift'), ' ', key('F10')]],
    ['Move', 'Drag to a column', 'Long-press, then drag', ['Plan or set a state']],
    ['Arrange', 'Drag within a column', 'Long-press, then drag', [key('Alt'), ' ', key('↑'), ' ', key('↓')]],
    ['Open', 'Click the title', 'Tap the title', [key('Enter')]],
  ];
  return tile('brain-area-ways', 'Doing things', [
    h('table', 'brain-ways', {}, [
      h('thead', undefined, {}, [h('tr', undefined, {}, [
        h('td'),
        ...['Mouse', 'Touch', 'Keyboard'].map((way) => h('th', 'brain-label', { scope: 'col' }, [way])),
      ])]),
      h('tbody', undefined, {}, ways.map(([action, mouse, touch, keys]) => h('tr', undefined, {}, [
        h('th', undefined, { scope: 'row' }, [action]),
        h('td', undefined, {}, [mouse]),
        h('td', undefined, {}, [touch]),
        h('td', undefined, {}, keys),
      ]))),
    ]),
  ]);
}

/** The planner card's seven steps, one line each. */
function planningTile(actions: Actions): HTMLElement {
  return tile('brain-area-plan', 'Planning', [
    h('ul', 'brain-tasks', {}, PLANNING.map(([step, means]) => h('li', 'brain-task', {}, [body([step], [{ text: means }], actions)]))),
  ]);
}

function viewsTile(actions: Actions): HTMLElement {
  return tile('brain-area-views', 'The views', [
    h('ul', 'brain-tasks', {}, VIEWS.map(([name, note, about]) => h('li', 'brain-task', {}, [
      h('div', 'brain-task-body', {}, [
        link(name, 'brain-task-text brain-link brain-stretch', () => actions.open(`01 Dashboard/${note}.md`)),
        metaLine([{ text: about }], actions),
      ]),
    ]))),
  ]);
}

function wordsTile(actions: Actions): HTMLElement {
  return tile('brain-area-words', 'Time words', [
    h('ul', 'brain-tasks', {}, WORDS.map(([word, means, aside]) => h('li', 'brain-task', {}, [
      body([word], [{ text: means }], actions),
      h('span', 'brain-aside', {}, [asideChild(aside)]),
    ]))),
  ]);
}

function whoTile(actions: Actions): HTMLElement {
  return tile('brain-area-who', 'Who does what', [
    h('div', 'brain-pair', {}, WHO.map(([who, jobs]) => h('div', 'brain-group', {}, [
      h('h4', 'brain-group-name', {}, [who]),
      h('ul', 'brain-tasks', {}, jobs.map((job) => h('li', 'brain-task', {}, [body([job], [], actions)]))),
    ]))),
    metaLine([{ text: 'The agent can also do everything Ninja Board does, with the same result' }], actions),
  ]);
}

/** OK: ticked, and "OK" for screen readers. Otherwise "To fix" or "Can't check", and where to look. */
function setupRow(line: SetupLineVM, actions: Actions): HTMLLIElement {
  const text = textParts(line.text);
  if (line.state === 'ok') return markRow(SETUP_MARK.ok, [...text, h('span', 'brain-sr', {}, [': OK'])], [], actions);
  const status: MetaPart = line.state === 'fix' ? { text: 'To fix', tone: 'late' } : { text: "Can't check" };
  return markRow(SETUP_MARK[line.state], text, line.where ? [status, { text: line.where }] : [status], actions);
}

/** A row with a mark that does nothing when pressed: the guide shows what marks mean, it changes no task. */
function markRow(mark: TaskState | 'repeat', text: Child[], meta: MetaPart[], actions: Actions): HTMLLIElement {
  if (mark === 'repeat') {
    return h('li', 'brain-task', {}, [h('span', 'brain-lead brain-repeat', { 'aria-hidden': 'true' }, [repeatMark()]), body(text, meta, actions)]);
  }
  return h('li', 'brain-task', { 'data-state': mark }, [
    h('span', 'brain-lead brain-check', { 'aria-hidden': 'true' }, [checkMark()]),
    body(text, meta, actions),
  ]);
}

function body(text: Child[], meta: MetaPart[], actions: Actions): HTMLDivElement {
  return h('div', 'brain-task-body', {}, [h('p', 'brain-task-text', {}, text), meta.length > 0 ? metaLine(meta, actions) : null]);
}

/** Text with its toned parts as spans: "symbol <span class="brain-strong">w</span>". */
function textParts(parts: MetaPart[]): Child[] {
  return parts.map((p) => (p.tone ? h('span', `brain-${p.tone}`, {}, [p.text]) : p.text));
}

/** An aside as a time word shows it: plain text, or the span metaLine draws a part as (its tone, its data-when). */
function asideChild(part: MetaPart): Child {
  if (!part.tone && !part.when) return part.text;
  return h('span', part.tone ? `brain-${part.tone}` : undefined, part.when ? { 'data-when': part.when } : {}, [part.text]);
}
