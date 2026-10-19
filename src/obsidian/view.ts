import { BasesView, Notice, debounce } from 'obsidian';
import type { Plugin, QueryController } from 'obsidian';
import type { Arrangement, RawNote, ScheduleView, TasksSetup, VaultSnapshot, WaitingView } from '../model/types.ts';
import type { Actions, DaySpec } from '../ui/actions.ts';
import { mergeArrangement, readArrangement, readCollapsed, readScheduleView, setFolded, waitingViewOf } from '../model/arrange.ts';
import { isoWeek } from '../model/dates.ts';
import { buildToday } from '../model/today.ts';
import { buildWeek } from '../model/week.ts';
import { buildProjects } from '../model/projects.ts';
import { buildBacklog } from '../model/backlog.ts';
import { buildGuide } from '../model/guide.ts';
import { renderToday } from '../ui/today.ts';
import { renderWeek } from '../ui/week.ts';
import { renderProjects } from '../ui/projects.ts';
import { renderBacklog } from '../ui/backlog.ts';
import { renderGuide } from '../ui/guide.ts';
import { wakeAt } from '../ui/clock.ts';
import { focusedKey, pagerFocus, refocus, refocusPager } from '../ui/focus.ts';
import { markHosts } from '../ui/host.ts';
import { cancelDrags } from '../ui/drag.ts';
import { closeCard } from '../ui/popover.ts';
import { unfoldedKeys } from '../ui/card.ts';
import { tickNow } from '../ui/schedule.ts';
import { CONFIG_PATH, readPointsTarget, readWeekPlan, snapshotFromFiles } from './snapshot.ts';
import { obsidianActions } from './actions.ts';
import { showDay } from './dayModal.ts';
import { arrangementPersists, readTasksSetup } from './edits.ts';
import { now, today } from './writes.ts';
import { history } from './undo.ts';

export type BrainViewType = 'ninja-board-today' | 'ninja-board-week' | 'ninja-board-projects' | 'ninja-board-backlog' | 'ninja-board-guide';

/** What a view is drawn from: the vault, the day, the actions, and what the view's own config holds. */
interface DrawContext {
  snapshot: VaultSnapshot; today: string; actions: Actions;
  now: string;                     // the time of day, HH:MM: injected like today, so the model and the UI never read the clock
  arrange: Arrangement;            // readArrangement(this.config.get('arrange'))
  schedule: ScheduleView;          // which form Today's Schedule takes: the saved `schedule:`, or this session's choice
  waiting: WaitingView;            // which view Waiting takes on the Week board: the saved `waiting:`, or this session's choice
  collapsed: string[];             // the stories folded in the Week view, on every week: the saved `collapsed:`, or this session's list
  weekStart?: string;              // the Monday the Week view shows; undefined: this week
  target: number;                  // the week's points target: points_per_week in the config note, 8 when absent
  plan?: RawNote;                  // that week's plan note, read only for a past week
  setup?: TasksSetup;              // the Guide: what Brain could read of the Tasks plugin
}

type Draw = (root: HTMLElement, ctx: DrawContext) => void;

const DRAW: Record<BrainViewType, Draw> = {
  'ninja-board-today': (root, ctx) => renderToday(root, buildToday(ctx.snapshot, ctx.today), ctx.actions, { now: ctx.now, schedule: ctx.schedule }),
  'ninja-board-week': (root, ctx) => renderWeek(
    root,
    buildWeek(ctx.snapshot, ctx.today, { start: ctx.weekStart, arrange: ctx.arrange, plan: ctx.plan, target: ctx.target }),
    ctx.actions,
    { now: ctx.now, waiting: ctx.waiting, collapsed: ctx.collapsed },
  ),
  'ninja-board-projects': (root, ctx) => renderProjects(root, buildProjects(ctx.snapshot, ctx.today, ctx.arrange), ctx.actions),
  'ninja-board-backlog': (root, ctx) => renderBacklog(root, buildBacklog(ctx.snapshot, ctx.today), ctx.actions),
  // extras() reads the setup for every Guide draw, so the fallback is never drawn.
  'ninja-board-guide': (root, ctx) => renderGuide(root, buildGuide(ctx.setup ?? { on: false }), ctx.actions),
};

/** Undo's name for a Waiting switch: it shows the view the switch was on (undo puts that back). */
function waitingLabel(before: unknown): string {
  return `show Waiting ${waitingViewOf(before) === 'group' ? 'inside Doing' : 'as its own column'}`;
}

/** Whether two lists of folded stories hold the same names, in any order. */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  const names = new Set(b);
  return new Set(a).size === names.size && a.every((name) => names.has(name));
}

/** A copy of a config value as JSON holds it, so a later change to the config's own object does not change the step. */
function copyOf(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export class BrainView extends BasesView {
  readonly type: BrainViewType;
  private readonly plugin: Plugin;
  private readonly root: HTMLElement;
  private readonly actions: Actions;
  private shown = new Set<string>();   // paths of the files in the last render
  private renders = 0;                 // only the newest render may draw
  private resolvedSeen = false;
  private day = '';                    // the date of the last render, which Today and Week show
  // The Monday of the week the Week view shows; undefined is this week, so it moves on at midnight.
  // Kept only while the view is open: it always opens on this week.
  private weekStart: string | undefined;
  // The Schedule's form where the config can't hold it (an embed, a hover, a canvas) or refused it: the session's choice.
  private scheduleChoice: ScheduleView | undefined;
  // Waiting's view where the config can't hold it, as for the Schedule: the session's choice.
  private waitingChoice: WaitingView | undefined;
  // The folded stories where the config can't hold them, as for the Schedule: the whole list as this session has it.
  private collapsedChoice: string[] | undefined;
  private foldNoticed = false;         // the Notice about a fold the config can't hold is shown once
  // What the page on screen was drawn from: the signature of every input but the folds (see render), and the folds. A draw from
  // the same inputs would only replace the page with a copy, and blink what is under the pointer, so it is skipped.
  private drawn: { sig: string; collapsed: string[] } | undefined;
  // The strip changes by itself when an appointment ends: one timer, set at each draw, for the next end today.
  private changeAt: string | undefined;
  private stopChange: (() => void) | undefined;
  // Task line edits change the note body, which Bases doesn't always report.
  private readonly rerender = debounce(() => void this.render(), 150, true);
  private stopHistory: (() => void) | undefined;   // the undo history's listener: this page redraws when a step is made or undone
  private unmarkHosts: (() => void) | undefined;   // the marks on the notes and embeds this view is in (ui/host.ts)

  constructor(controller: QueryController, containerEl: HTMLElement, kind: BrainViewType, plugin: Plugin) {
    super(controller);
    this.type = kind;
    this.plugin = plugin;
    // Focusable without a tab stop: a redraw that leaves no item to focus gives the focus to the view, so Cmd/Ctrl+Z still reaches it.
    this.root = containerEl.createDiv({ cls: 'brain-view', attr: { tabindex: '-1' } });
    this.actions = obsidianActions(plugin.app, this);
  }

  /**
   * Draws now. A user's action (a pager, an arrangement, the Schedule's view) can't wait out the debounce the vault
   * events use: a second click before the redraw would act on the old page. run() only calls a pending call, so one is made first.
   */
  private redraw(): void {
    this.rerender();
    this.rerender.run();
  }

  /** Shows the week starting on this Monday. */
  showWeek(start: string): void {
    this.weekStart = start === isoWeek(today()).start ? undefined : start;
    this.redraw();
  }

  /**
   * Saves these columns' lists in this view's `arrange:`, other columns kept. Bases writes the
   * base block back into the dashboard note and calls onDataUpdated, which re-renders; the view
   * draws again here too, so a save that doesn't report back (or one that fails) leaves the board
   * as the vault has it. Where Bases can't write the block back (an embed, a hover, a canvas),
   * nothing is saved, and a Notice says why.
   */
  arrange(lists: Arrangement): void {
    if (!arrangementPersists(this.root)) {
      new Notice('Open the dashboard note itself to arrange this board');
      return;
    }
    try {
      this.saveLayout('arrange', mergeArrangement(this.config.get('arrange'), lists), 'move back');
    } catch (error) {
      console.error(error);
      new Notice("Couldn't save the arrangement");
    }
    this.redraw();
  }

  /**
   * Saves which form Today's Schedule takes in this view's `schedule:`, the way arrange() saves a list: through the
   * config, which Bases writes back into the dashboard note. Where it can't (an embed, a hover, a canvas) or the
   * save fails, the choice lasts for the session and a Notice says so.
   */
  scheduleView(view: ScheduleView): void {
    if (arrangementPersists(this.root)) {
      try {
        this.saveLayout('schedule', view, 'restore the Schedule view');
        this.scheduleChoice = undefined;   // the config holds it now
      } catch (error) {
        console.error(error);
        new Notice("Couldn't save the schedule view");
        this.scheduleChoice = view;
      }
    } else {
      new Notice('Open the dashboard note itself to keep the schedule view');
      this.scheduleChoice = view;
    }
    this.redraw();
  }

  /**
   * Saves which view Waiting takes on the Week board in this view's `waiting:`, the way scheduleView() saves the
   * Schedule's. Where the config can't hold it, the choice lasts for the session and a Notice says so.
   */
  waitingView(view: WaitingView): void {
    if (arrangementPersists(this.root)) {
      try {
        this.saveLayout('waiting', view, waitingLabel(this.config.get('waiting')));
        this.waitingChoice = undefined;   // the config holds it now
      } catch (error) {
        console.error(error);
        new Notice("Couldn't save the waiting view");
        this.waitingChoice = view;
      }
    } else {
      new Notice('Open the dashboard note itself to keep the waiting view');
      this.waitingChoice = view;
    }
    this.redraw();
  }

  /**
   * Folds (or opens) these stories in the Week view, on every week, and saves the list in this view's `collapsed:`, the way scheduleView() saves
   * the Schedule's form: through the config, which Bases writes back into the dashboard note. It is not an undo step: it changes
   * what the board shows, not the board. Where the config can't hold it (an embed, a hover, a canvas) or the save fails, the list
   * lasts for the session and a Notice says so, the first time. It does not draw: the cards (or the page) were folded in place by the
   * click, and a draw would build the chevron again at opacity 0 and fade it in, a flicker. Any later draw is from this list; the
   * one that echoes the save (Bases writes the block, then calls onDataUpdated) draws the page that is there, so `drawn` is told and skips it.
   */
  foldStories(names: string[], folded: boolean): void {
    const next = setFolded(this.collapsedNow(), names, folded);
    if (arrangementPersists(this.root)) {
      try {
        this.config.set('collapsed', next);
        this.collapsedChoice = undefined;   // the config holds it now
      } catch (error) {
        console.error(error);
        this.noticeFold("Couldn't save the folded stories");
        this.collapsedChoice = next;
      }
    } else {
      this.noticeFold('Open the dashboard note itself to keep stories folded');
      this.collapsedChoice = next;
    }
    // The page shows its own folds plus this change, not the saved list (an outside edit of it may not be drawn yet): that is what the
    // record takes, so the draw that echoes the save is skipped, and one for a pending outside edit is made.
    if (this.drawn) this.drawn.collapsed = setFolded(this.drawn.collapsed, names, folded);
  }

  /** The folded stories as the Week view is drawn: this session's list where the config couldn't hold it, else the saved one. */
  private collapsedNow(): string[] {
    return this.collapsedChoice ?? readCollapsed(this.config.get('collapsed'));
  }

  /** A Notice about folding, once per view: a Collapse all would otherwise show one for every click. */
  private noticeFold(message: string): void {
    if (this.foldNoticed) return;
    this.foldNoticed = true;
    new Notice(message);
  }

  /** Opens a day's full view in a modal. */
  showDay(spec: DaySpec): void {
    showDay(this.plugin.app, spec, this.actions, this.root);
  }

  /**
   * Saves `value` under `key` in this view's config, and records the write as an undo step named `label` (it joins an open
   * group instead, see History.group). Undo puts back what the config held: a value Bases had none of comes back as null.
   */
  private saveLayout(key: string, value: unknown, label: string): void {
    const before = copyOf(this.config.get(key));
    this.config.set(key, value);
    history.record(label, { kind: 'layout', config: this.config, key, before, after: copyOf(value) });
  }

  onload(): void {
    this.unmarkHosts = markHosts(this.root);
    const cache = this.plugin.app.metadataCache;
    // Task lines come only from cache-confirmed list items, so a note the cache hasn't indexed yet
    // shows no tasks. Re-render when the cache catches up ('changed'), when a shown note goes
    // ('deleted'), and once when the first full index finishes ('resolved').
    this.registerEvent(
      cache.on('changed', (file) => {
        // The config note's points target is read on every draw, so its change redraws too.
        if (this.shown.has(file.path) || file.path === CONFIG_PATH) this.rerender();
      }),
    );
    this.registerEvent(
      cache.on('deleted', (file) => {
        if (this.shown.has(file.path)) this.rerender();
      }),
    );
    // 'resolved' fires after every later edit too; only the first one is the initial index.
    this.registerEvent(
      cache.on('resolved', () => {
        if (this.resolvedSeen) return;
        this.resolvedSeen = true;
        this.rerender();
      }),
    );
    // A view left open past midnight must move on to the new day. Each minute the Schedule's now-line moves (no
    // redraw), and a strip whose next end has come, though its timer slept with the machine, is drawn again.
    this.registerInterval(window.setInterval(() => {
      if (today() !== this.day || (this.changeAt !== undefined && now() >= this.changeAt)) this.rerender();
      else tickNow(this.root, now());
    }, 60_000));
    // A step made in any Ninja Board view (or undone in one) redraws this page, so its Undo button names the step on top.
    if (this.type !== 'ninja-board-guide') this.stopHistory = history.subscribe(() => this.redraw());
  }

  onunload(): void {
    this.unmarkHosts?.();
    this.stopHistory?.();
    this.stopChange?.();
    closeCard();
    cancelDrags(this.root);   // a drag still in progress in this view (a carry out of a modal included) ends with it, with its listeners
    this.rerender.cancel();
    this.renders++;   // an unfinished render must not draw into a removed view
    this.drawn = undefined;
  }

  onDataUpdated(): void {
    this.rerender();
  }

  /**
   * What a draw needs besides the snapshot. The Week view: the week shown, and for a past week its plan
   * note, read only while that week is shown. An unread or missing plan leaves the week to From your notes.
   * The Guide: what Ninja Board can read of the Tasks plugin, read again on every draw.
   */
  private async extras(): Promise<Pick<DrawContext, 'weekStart' | 'plan' | 'setup'>> {
    if (this.type === 'ninja-board-guide') return { setup: await readTasksSetup(this.plugin.app) };
    const start = this.weekStart;
    if (this.type !== 'ninja-board-week' || start === undefined) return {};
    if (start >= isoWeek(today()).start) return { weekStart: start };
    try {
      return { weekStart: start, plan: await readWeekPlan(this.plugin.app, start) };
    } catch (error) {
      console.error(error);   // an unreadable plan is no plan: the week falls back to From your notes
      return { weekStart: start };
    }
  }

  /** Draws the view again at this time ("HH:MM"), when an appointment on the strip ends; undefined: nothing to wait for. */
  private armChange(at: string | undefined): void {
    this.stopChange?.();
    this.changeAt = at;
    this.stopChange = at === undefined ? undefined : wakeAt(at, new Date(), () => this.rerender());
  }

  private async render(): Promise<void> {
    if (!this.data) return;
    const run = ++this.renders;
    try {
      // The Guide reads no notes (spec §2): none are read for it, and an edit elsewhere doesn't redraw it.
      const files = this.type === 'ninja-board-guide' ? [] : this.data.data.map((entry) => entry.file);
      this.shown = new Set(files.map((file) => file.path));
      const snapshot = await snapshotFromFiles(this.plugin.app, files);
      const extras = await this.extras();
      if (run !== this.renders) return;   // a newer render started while this one was reading
      this.day = today();
      this.root.dataset.today = this.day;
      // The Week view's upcoming week: its cards plan that week by default.
      if (this.type === 'ninja-board-week' && this.weekStart !== undefined && this.weekStart > isoWeek(this.day).start) {
        this.root.dataset.week = this.weekStart;
      } else {
        delete this.root.dataset.week;
      }
      const inputs: Omit<DrawContext, 'actions' | 'collapsed'> = {
        snapshot,
        today: this.day,
        now: now(),
        arrange: readArrangement(this.config.get('arrange')),
        target: readPointsTarget(this.plugin.app),
        schedule: this.scheduleChoice ?? readScheduleView(this.config.get('schedule')),
        waiting: this.waitingChoice ?? waitingViewOf(this.config.get('waiting')),
        ...extras,
      };
      const collapsed = this.collapsedNow();
      // Everything a draw reads that is not on the page already, but the folds: those are the page's own (a fold changes it in place,
      // and `drawn` is told). What a draw reads off the page (an open Done today or To plan, the Schedule's scroll, the focus) is kept
      // with the page, so it is no input. unfoldedKeys: the story cards opened on any page, a list card.ts keeps for the next draw; only
      // Backlog's planner cards read it (the Week view's story cards fold by `collapsed:`), so only Backlog's draw has it as an input.
      const sig = JSON.stringify({
        view: this.type,
        inputs,
        week: this.root.dataset.week,
        undo: this.actions.undoLabel(),
        mac: this.actions.mac,
        unfolded: this.type === 'ninja-board-backlog' ? unfoldedKeys() : [],
      });
      if (this.drawn?.sig === sig && sameNames(this.drawn.collapsed, collapsed)) {
        this.armChange(this.root.dataset.changeAt);   // the page and its changeAt are kept; the timer is set again, as a draw would
        return;
      }
      const key = focusedKey(this.root);
      // A pager control (‹, ›, This week, a Coming up chip) is replaced by the draw too: keep the focus on it.
      const pager = pagerFocus(this.root);
      delete this.root.dataset.changeAt;   // the Week view sets it again if the strip will change
      this.drawn = undefined;   // a draw that fails midway leaves a page that no later render may take for the one drawn before
      DRAW[this.type](this.root, { ...inputs, actions: this.actions, collapsed });
      this.drawn = { sig, collapsed: [...collapsed] };
      this.armChange(this.root.dataset.changeAt);
      if (key !== undefined) refocus(this.root, key);
      refocusPager(this.root, pager);
    } catch (error) {
      // E.g. a note was deleted between selection and read. Keep what is on screen; the next
      // data update or cache event renders again.
      console.error(error);
    }
  }
}
