// The browser preview: the real model and UI on the sample vault. Writes change the notes in memory only.
import { buildSnapshot } from '../src/model/snapshot.ts';
import { buildToday } from '../src/model/today.ts';
import { buildWeek } from '../src/model/week.ts';
import { buildProjects } from '../src/model/projects.ts';
import { buildBacklog } from '../src/model/backlog.ts';
import { buildGuide } from '../src/model/guide.ts';
import { mergeArrangement } from '../src/model/arrange.ts';
import { weekPlanPath } from '../src/model/record.ts';
import { isoWeek } from '../src/model/dates.ts';
import { renderToday } from '../src/ui/today.ts';
import { renderWeek } from '../src/ui/week.ts';
import { renderProjects } from '../src/ui/projects.ts';
import { renderBacklog } from '../src/ui/backlog.ts';
import { renderGuide } from '../src/ui/guide.ts';
import { focusedKey, pagerFocus, refocus, refocusPager } from '../src/ui/focus.ts';
import { closeCard } from '../src/ui/popover.ts';
import type { Arrangement, RawNote, ScheduleView, TasksSetup, VaultSnapshot, WaitingView } from '../src/model/types.ts';
import type { Actions } from '../src/ui/actions.ts';
import { History } from '../src/model/history.ts';
import { parseTaskLine } from '../src/model/taskLine.ts';
import { datesUndoLabel, lineTitle, noteTitle, pointsUndoLabel, stateUndoLabel, tickUndoLabel } from '../src/model/undoLabel.ts';
import { isBrainUndoKey } from '../src/ui/undoKey.ts';
import { memoryWrites } from './memoryWrites.ts';
import { openDayModal, openListModal } from './modal.ts';
import { tokensOf } from './tokens.ts';

const TODAY = '2026-10-13';
// The clock is fixed, as TODAY is: 11:10, so the Schedule's now-line and what has ended on the strip read the same on every visit.
const NOW = '11:10';

// Tasks' saved settings as the mockup's Setup tile has them: the Dataview format, the done date set, and no Waiting status yet.
const SETUP: TasksSetup = { on: true, settings: { taskFormat: 'dataview', setDoneDate: true, statusSettings: { customStatuses: [] } } };

type View = 'today' | 'week' | 'projects' | 'backlog' | 'guide';

/** What a view is drawn from: the notes, and the state BrainView keeps in memory (its DrawContext). */
interface Context {
  s: VaultSnapshot;
  actions: Actions;
  weekStart: string | undefined;                              // the shown week; undefined is this week
  plan: RawNote | undefined;                                  // the shown week's plan note, for a past week only
  arrangement: { week: Arrangement; projects: Arrangement };  // in Obsidian: the dashboard note's arrange:
  schedule: ScheduleView;                                     // in Obsidian: the dashboard note's schedule:
  waiting: WaitingView;                                       // in Obsidian: the dashboard note's waiting:
}

const VIEWS: Record<View, (root: HTMLElement, c: Context) => void> = {
  today: (root, c) => renderToday(root, buildToday(c.s, TODAY), c.actions, { now: NOW, schedule: c.schedule }),
  week: (root, c) => renderWeek(root, buildWeek(c.s, TODAY, { start: c.weekStart, arrange: c.arrangement.week, plan: c.plan }), c.actions, { now: NOW, waiting: c.waiting }),
  projects: (root, c) => renderProjects(root, buildProjects(c.s, TODAY, c.arrangement.projects), c.actions),
  backlog: (root, c) => renderBacklog(root, buildBacklog(c.s, TODAY), c.actions),
  guide: (root, c) => renderGuide(root, buildGuide(SETUP), c.actions),
};

start().catch((err: unknown) => {
  say(`Preview failed: ${String(err)}`);
  throw err;
});

async function start(): Promise<void> {
  const res = await fetch('sample.json');
  if (!res.ok) throw new Error(`sample.json: HTTP ${res.status}. Start the preview with npm run preview.`);
  const notes = (await res.json()) as RawNote[];
  const root = $('.brain-view');
  // The list modal goes over the stage, beside the frame: the frame is made inert while a modal is open.
  const stage = $('.mock-stage');
  let view: View = 'today';
  // The view state BrainView keeps: the shown week (undefined is this week, so the midnight refresh still moves
  // along), the boards' arrangements, the Schedule's form and Waiting's view on the Week board.
  let weekStart: string | undefined;
  let schedule: ScheduleView = 'large';
  let waiting: WaitingView = 'column';
  const arrangement: { week: Arrangement; projects: Arrangement } = { week: {}, projects: {} };

  // Undo in the preview: each action is one step, whose before and after are the whole page state (the notes, the
  // arrangements, the Schedule and Waiting views). The plugin restores the notes it wrote; here the state is restored whole.
  type Snapshot = string;
  const history = new History<{ before: Snapshot; after: Snapshot }>();
  const snap = (): Snapshot => JSON.stringify({ notes, arrangement, schedule, waiting });
  const restoreSnap = (s: Snapshot): void => {
    const state = JSON.parse(s) as { notes: RawNote[]; arrangement: typeof arrangement; schedule: ScheduleView; waiting: WaitingView };
    notes.splice(0, notes.length, ...state.notes);
    arrangement.week = state.arrangement.week;
    arrangement.projects = state.arrangement.projects;
    schedule = state.schedule;
    waiting = state.waiting;
  };
  // A write as one step, when it changed the page. Its name is worked out first, from the page as it was.
  const recorded = <A extends unknown[], R>(fn: (...args: A) => R, label: (...args: A) => string) =>
    (...args: A): R => {
      const name = label(...args);
      const before = snap();
      const out = fn(...args);
      const after = snap();
      if (after !== before) history.record(name, { before, after });
      return out;
    };
  type Target = Parameters<Actions['toggle']>[0];
  const titleOf = (t: Target): string => (t.kind === 'line' ? lineTitle(t.raw, t.path, t.line) : noteTitle(t.path));
  const stateOf = (t: Target): string => (t.kind === 'line' ? parseTaskLine(t.raw, t.path, t.line)?.state ?? 'todo' : t.state);
  const writes = memoryWrites(notes, TODAY, render);
  const arrangeNow = (lists: Arrangement): void => {
    if (view !== 'week' && view !== 'projects') return;
    arrangement[view] = mergeArrangement(arrangement[view], lists);
    render();
  };
  const setScheduleNow = (choice: ScheduleView): void => {
    schedule = choice;
    render();
  };
  const setWaitingNow = (choice: WaitingView): void => {
    waiting = choice;
    render();
  };

  const actions: Actions = {
    toggle: recorded(writes.toggle, (t) => tickUndoLabel(titleOf(t), stateOf(t))),
    setState: recorded(writes.setState, (t) => stateUndoLabel(titleOf(t), stateOf(t))),
    setNoteStatus: recorded(writes.setNoteStatus, (path, status) => {
      const before = notes.find((n) => n.path === path)?.frontmatter?.status;
      return stateUndoLabel(noteTitle(path), typeof before === 'string' ? before : 'open');
    }),
    plan: recorded(writes.plan, (t) => datesUndoLabel(titleOf(t))),
    due: recorded(writes.due, (t) => datesUndoLabel(titleOf(t))),
    points: recorded(writes.points, (t) => pointsUndoLabel(titleOf(t))),
    open: (path, line) => say(`Opens “${nameOf(path)}”${line === undefined ? '' : ` at line ${line + 1}`}`),
    arrange: recorded(arrangeNow, () => 'move back'),
    scheduleView: recorded(setScheduleNow, () => 'restore the Schedule view'),
    waitingView: recorded(setWaitingNow, () => `show Waiting ${waiting === 'group' ? 'inside Doing' : 'as its own column'}`),
    showWeek: (start) => {
      weekStart = start === isoWeek(TODAY).start ? undefined : start;
      render();
    },
    showAll: (spec) => openListModal(stage, spec, actions),
    showDay: (spec) => openDayModal(stage, spec, actions),
    group: (label, run) => history.group(label, run),
    undo: () => {
      void history.undo(async (steps) => {
        for (const step of [...steps].reverse()) {
          if (snap() !== step.after) return false;
          restoreSnap(step.before);
        }
        return true;
      }).then((result) => {
        if (result === 'changed') say('Changed since: not undone');
      });
    },
    undoLabel: () => history.label(),
  };
  history.subscribe(() => render());
  document.addEventListener('keydown', (e) => {
    if (!isBrainUndoKey({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, target: e.target as Element | null })) return;
    e.preventDefault();
    actions.undo();
  });

  // Like the plugin: every change rebuilds the snapshot from the notes and redraws the view, then gives the focus back
  // to the row or card that had it, so Alt+↑/↓ can go on. The root carries today, and the week when it is upcoming.
  function render(): void {
    const key = focusedKey(root);
    const pager = pagerFocus(root);
    const shown = isoWeek(weekStart ?? TODAY).start;
    root.dataset.today = TODAY;
    if (view === 'week' && shown > isoWeek(TODAY).start) root.dataset.week = shown;
    else delete root.dataset.week;
    VIEWS[view](root, { s: buildSnapshot(notes), actions, weekStart, plan: pastPlan(notes, weekStart), arrangement, schedule, waiting });
    if (key !== undefined) refocus(root, key);
    refocusPager(root, pager);
  }

  bindBar((next) => {
    if (next !== view) closeCard();   // BrainView.onunload closes a card when its view goes
    view = next;
    render();
  });
  render();
}

// Escape with a card open closes the card and nothing else. The capture listener notes whether a card is open before
// the card's own Escape keys close it; the bubble listener, added before the modal stand-in's, stops the modal from
// closing as well.
let cardOpenAtEscape = false;
document.addEventListener('keydown', (e) => {
  cardOpenAtEscape = e.key === 'Escape' && document.querySelector('.brain-popover') !== null;
}, true);
document.addEventListener('keydown', (e) => {
  if (!cardOpenAtEscape) return;
  cardOpenAtEscape = false;
  closeCard();
  e.stopImmediatePropagation();
});

/** The mockup's scaffold bar: view, theme, surface and width. */
function bindBar(showView: (view: View) => void): void {
  const frame = $('.mock-frame');
  $('#mock-bar').addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (!b?.parentElement) return;
    for (const other of b.parentElement.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === b));
    const { view, theme, surface, width } = b.dataset;
    if (view) {
      $('.bases-view-name').textContent = b.textContent;
      showView(view as View);
    }
    if (theme) document.body.className = theme;
    if (surface) frame.classList.toggle('mod-sidedock', surface === 'sidebar');
    if (width) frame.style.width = `${width}px`;
  });
}

// ---------- Console check: await checkView() ----------

/** What checkView reports when the page differs: the first token that differs, and the next six on each side. */
type Diff = { at: number; of: [number, number]; mockup: string[]; preview: string[] };

/**
 * Compares the page on screen with its markup in design/mockup.html, token by token (see tokens.ts), and lists what
 * sticks out on the right. Week has one mockup state per week shown: 42 (this week), 41, 40 and 43, whether To plan
 * is open or closed. With `part`, a selector, it compares only what matches it on both sides: a tile without the
 * head's pill, say, or the rows of one group.
 *
 * `dom` is 'same' only when something was compared and matched. A week the mockup has no state for says
 * 'no mockup state'; a `part` that matches nothing on either side says 'nothing compared', so a typo in the
 * selector can't read as a pass.
 */
async function checkView(part?: string): Promise<{ dom: 'same' | 'nothing compared' | 'no mockup state' | Diff; overflow: string[] }> {
  const view = document.querySelector<HTMLElement>('#mock-bar [aria-pressed="true"][data-view]')?.dataset.view ?? '';
  const html = await (await fetch('../design/mockup.html')).text();
  const mock = new DOMParser().parseFromString(html, 'text/html');
  const root = $('.brain-view');
  const page = root.querySelector('.brain-page');
  const right = root.getBoundingClientRect().right;
  const overflow = [...root.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().right > right + 0.5)
    .map((el) => el.getAttribute('class') ?? el.localName);
  const mockPage = mockupState(mock, view, page);
  if (!mockPage) return { dom: 'no mockup state', overflow };
  // A whole page compares from inside: for Week its own element is the mockup's .mock-week wrapper.
  const tokens = (el: Element | null): string[] =>
    part ? [...(el?.querySelectorAll(part) ?? [])].flatMap((match) => tokensOf(match)) : tokensOf(el).slice(1);
  const want = tokens(mockPage);
  const got = tokens(page);
  if (part && want.length === 0 && got.length === 0) return { dom: 'nothing compared', overflow };
  let at = 0;
  while (at < want.length && want[at] === got[at]) at++;
  const dom = at === want.length && at === got.length
    ? 'same'
    : { at, of: [want.length, got.length] as [number, number], mockup: want.slice(at, at + 6), preview: got.slice(at, at + 6) };
  return { dom, overflow };
}

/** The mockup's markup for what the preview shows: the view's page, and for Week the state of the week shown (its number is in the pager). */
function mockupState(mock: Document, view: string, page: Element | null): Element | null {
  const mockPage = mock.querySelector(`.brain-page[data-view="${view}"]`);
  if (view !== 'week') return mockPage;
  const week = page?.querySelector('.brain-pager .brain-label')?.textContent?.match(/\d+/)?.[0];
  return mockPage?.querySelector(`:scope > .mock-week[data-week="${week}"]`) ?? null;
}

Object.assign(window, { checkView });

// ---------- Small helpers ----------

/** The shown week's plan note, when that week is past: BrainView reads one (readWeekPlan) only then. */
function pastPlan(notes: RawNote[], weekStart: string | undefined): RawNote | undefined {
  const start = isoWeek(weekStart ?? TODAY).start;
  return start < isoWeek(TODAY).start ? notes.find((n) => n.path === weekPlanPath(start)) : undefined;
}

let toastTimer: number | undefined;

/** What the plugin would do in Obsidian, said in a toast. */
function say(text: string): void {
  const toast = $('#mock-toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1600);
}

function $(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`index.html has no ${selector}`);
  return el;
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
}
