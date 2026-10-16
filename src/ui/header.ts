import type { Child } from './dom.ts';
import { h } from './dom.ts';
import { flagIcon, pointsRing, ring, stepIcon, tallyIcon, undoIcon } from './marks.ts';
import type { PointsVM } from '../model/types.ts';
import type { Actions } from './actions.ts';

export interface HeadOpts {
  label: string;
  title: string;
  accent?: boolean;    // Today: the weekday label in the accent colour
  header?: boolean;    // Backlog & Waiting: each part's head is a <header>
  pager?: {            // Week: ‹ and › around the label, and This week while another week is shown
    onPrev(): void;
    onNext(): void;
    onThisWeek?: () => void;
  };
  titleAside?: HTMLElement;   // Week: the Plan this week pill, beside the title
  figure?: {
    ring?: { done: number; total: number; label: string };
    before?: string;   // text before the bold part: "next chase" in "next chase Thu"
    strong: string;
    rest: string;      // text after it: "left" in "4 left"
  };
  tally?: { inWeek: number; due: number };    // Week's planning head: what is in the week, then how many of it is due
  tasks?: { done: number; total: number };    // Week: done out of all its tasks, "2/16", with the checklist icon
  points?: PointsVM;                         // Week: the story points ring and its label, when the week has points
  record?: boolean;                          // Week: a past week's record: its tasks ring says "that week", its points are marked
  undo?: Pick<Actions, 'undo' | 'undoLabel'>;   // the page's Undo button, top right above the figures; the Guide has none
}

/** A view's head: label, the title that is the summary, and a quiet figure. */
export function viewHead(opts: HeadOpts): HTMLElement {
  const { figure } = opts;
  const label = h('p', opts.accent ? 'brain-label brain-label-accent' : 'brain-label', {}, [opts.label]);
  return h(opts.header ? 'header' : 'div', 'brain-head', {}, [
    h('div', undefined, {}, [
      opts.pager ? pager(label, opts.pager) : label,
      opts.titleAside
        ? h('div', 'brain-title-row', {}, [h('h2', 'brain-title', {}, [opts.title]), opts.titleAside])
        : h('h2', 'brain-title', {}, [opts.title]),
    ]),
    figures(opts),
  ]);
}

/**
 * The head's end, as the mockup has it: the Undo button, then the figures, one alone or the week's in a figures row (the
 * tasks, the planning counts, the points, as the week has them). At 320 and 360px the CSS sets them on the head's own row.
 */
function figures(opts: HeadOpts): HTMLElement | null {
  const { figure, tally, tasks, points, record, undo } = opts;
  const button = undo ? undoButton(undo) : null;
  if (!tally && !tasks && !points) return figure || button ? h('div', 'brain-head-end', {}, [button, figure ? figureOf(figure) : null]) : null;
  return h('div', 'brain-head-end', {}, [button, h('div', 'brain-figures', {}, [
    figure ? figureOf(figure) : null,
    tasks ? tasksFigure(tasks, record === true) : null,
    tally ? tallyFigure(tally) : null,
    points ? pointsFigure(points, record === true) : null,
  ])]);
}

// Whether the last draw showed the Undo button. Every step redraws the page with a new button, and a new button would fade in
// again (the CSS fade runs when an element is drawn), so a button shown straight after a shown one is marked steady.
let undoShown = false;

/**
 * The Undo button: hidden when there is nothing to undo, and otherwise named for the step on top, with the shortcut in its
 * tooltip (⌘Z on a Mac, Ctrl+Z elsewhere). The accessible label is the same without the shortcut. It is keyed, as a row is,
 * so a redraw (every step redraws the page) gives the focus back to it, and Cmd/Ctrl+Z goes on from there.
 */
function undoButton(undo: Pick<Actions, 'undo' | 'undoLabel'>): HTMLButtonElement {
  const label = undo.undoLabel();
  const shortcut = /Mac|iPhone|iPad/.test(typeof navigator === 'undefined' ? '' : navigator.platform) ? '⌘Z' : 'Ctrl+Z';
  const shown = !!label;
  const steady = undoShown && shown;   // shown on the last draw too: no fade
  undoShown = shown;
  const button = h('button', 'brain-undo', {
    type: 'button',
    'data-key': 'undo',
    ...(steady ? { 'data-steady': '' } : {}),
    'aria-label': label ? `Undo: ${label}` : 'Undo',
    title: label ? `Undo: ${label} (${shortcut})` : 'Undo',
    ...(label ? {} : { hidden: '' }),
  }, [undoIcon()]);
  button.addEventListener('click', () => undo.undo());
  return button;
}

/** A figure alone: its ring, then its words in bold and the rest. */
function figureOf(figure: NonNullable<HeadOpts['figure']>): HTMLElement {
  return h('p', 'brain-figure', {}, [
    figure.ring ? ring(figure.ring.done, figure.ring.total, 24, figure.ring.label) : null,
    h('span', undefined, {}, [
      figure.before ? `${figure.before} ` : null,
      h('b', undefined, {}, [figure.strong]),
      figure.rest ? ` ${figure.rest}` : null,
    ]),
  ]);
}

/** The week's tasks: a ring of done out of all, "2/16", then the checklist icon. A record's ring says "that week". */
function tasksFigure({ done, total }: { done: number; total: number }, record: boolean): HTMLElement {
  return h('p', 'brain-figure', {}, [
    ring(done, total, 24, `${done} of ${total} done ${record ? 'that' : 'this'} week`),
    h('span', undefined, {}, [h('b', undefined, {}, [String(done)]), `/${total}`]),
    tallyIcon('tasks done of total'),
  ]);
}

/**
 * The week's story points: a ring of planned against the target, and the label "12/8+4 pts": the raised +N is the overflow
 * past the target (see pointsRing). Its words are the ring's label. A past week's record is marked as the record.
 */
function pointsFigure({ planned, done, target }: PointsVM, record: boolean): HTMLElement {
  const over = Math.max(0, planned - target);
  const words = `${planned} of ${target} points planned, ${done} done${record ? ' (the record)' : ''}`;
  return h('p', record ? 'brain-figure brain-points brain-record' : 'brain-figure brain-points', {}, [
    pointsRing(planned, done, target, words),
    h('span', 'brain-pts-label', {}, [
      h('b', undefined, {}, [String(planned)]),
      `/${target}`,
      over > 0 ? h('sup', 'brain-over', {}, [`+${over}`]) : null,
      ' pts',
    ]),
  ]);
}

/**
 * The planning header's two counts: what is in the week (Planned or due), its number then the checklist; due, the red flag
 * then its number. The words are in the title and the label, so a reader who hears them knows which is which.
 */
function tallyFigure({ inWeek, due }: { inWeek: number; due: number }): HTMLElement {
  const words = `${inWeek} in the week, ${due} due`;
  return h('p', 'brain-figure brain-counts', { role: 'img', 'aria-label': words, title: words }, [
    h('span', 'brain-count-plan', {}, [h('b', undefined, {}, [String(inWeek)]), tallyIcon()]),
    h('span', 'brain-count-due', {}, [flagIcon(), h('b', undefined, {}, [String(due)])]),
  ]);
}

/** The label between ‹ and ›, then This week when there is a way back. */
function pager(label: HTMLElement, on: NonNullable<HeadOpts['pager']>): HTMLElement {
  return h('div', 'brain-pager', {}, [
    button('brain-step', [stepIcon('prev')], on.onPrev, 'Previous week'),
    label,
    button('brain-step', [stepIcon('next')], on.onNext, 'Next week'),
    on.onThisWeek ? button('brain-quiet', ['This week'], on.onThisWeek) : null,
  ]);
}

function button(cls: string, children: Child[], onClick: () => void, label?: string): HTMLButtonElement {
  const b = h('button', cls, label ? { 'aria-label': label } : {}, children);
  b.addEventListener('click', onClick);
  return b;
}
