import { h, svg } from './dom.ts';

/** The 18px check mark. The CSS shows one part per data-state: ring, half (doing), tick (done), dash (dropped). */
export function checkMark(): SVGSVGElement {
  return svg('svg', { class: 'brain-mark', viewBox: '0 0 18 18', 'aria-hidden': 'true' }, [
    markRing(),
    svg('path', { class: 'brain-mark-half', d: 'M9 3a6 6 0 0 0 0 12z' }),
    svg('path', { class: 'brain-mark-tick', d: 'M5 9.25l2.5 2.5L13 6.25' }),
    svg('path', { class: 'brain-mark-dash', d: 'M5.5 9h7' }),
  ]);
}

/** The repeating mark: a ring the CSS draws dotted, and a centre dot. Its wrapper hides it from screen readers. */
export function repeatMark(): SVGSVGElement {
  return svg('svg', { class: 'brain-mark', viewBox: '0 0 18 18' }, [
    markRing(),
    svg('circle', { class: 'brain-mark-dot', cx: '9', cy: '9', r: '3' }),
  ]);
}

function markRing(): SVGCircleElement {
  // pathLength 60 lets the CSS cut the ring into 12 dashes (waiting) or 15 dots (repeating).
  return svg('circle', { class: 'brain-mark-ring', cx: '9', cy: '9', r: '8', pathLength: '60' });
}

/** Progress ring. Its viewBox equals its size, so --brain-p on pathLength 100 is the same percentage everywhere. */
export function ring(done: number, total: number, size: 16 | 18 | 24, label: string): SVGSVGElement {
  const c = String(size / 2);
  const r = String(size / 2 - 1);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 1000) / 10) : 0;
  const circles = [svg('circle', { class: 'brain-ring-track', cx: c, cy: c, r })];
  if (pct > 0) {
    const fill = svg('circle', { class: 'brain-ring-fill', cx: c, cy: c, r, pathLength: '100' });
    fill.setCssProps({ '--brain-p': String(pct) });
    circles.push(fill);
  }
  return svg('svg', { class: 'brain-ring', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': label }, circles);
}

/**
 * The week's points ring (deviation 5): the outer ring is the target. The done arc, the planned-but-not-done arc, and the
 * overflow past the target as a thin inner circle: half a lap for +4, a full lap for +8, capped at one. Its arcs are the
 * mockup's: --brain-p is a percentage of a lap, and --brain-off the start of the planned arc.
 */
export function pointsRing(planned: number, done: number, target: number, label: string): SVGSVGElement {
  const pct = (n: number): number => Math.min(n, target) / target * 100;
  const arc = (name: string, r: string, p: number, off = 0): SVGCircleElement => {
    const el = svg('circle', { class: name, cx: '12', cy: '12', r, pathLength: '100' });
    el.setCssProps({ '--brain-p': String(p), '--brain-off': String(off) });
    return el;
  };
  return svg('svg', { class: 'brain-ring', viewBox: '0 0 24 24', role: 'img', 'aria-label': label }, [
    svg('circle', { class: 'brain-ring-track', cx: '12', cy: '12', r: '11' }),
    arc('brain-ring-plan', '11', pct(planned) - pct(done), pct(done)),
    arc('brain-ring-fill', '11', pct(done)),
    arc('brain-ring-over', '7', pct(Math.max(0, planned - target))),
    arc('brain-ring-over-done', '7', pct(Math.max(0, done - target))),
  ]);
}

/** A story's points as text: "3 pts", "1 pt". */
export function pointsText(n: number): string {
  return `${n} ${n === 1 ? 'pt' : 'pts'}`;
}

/** A story's points, quiet, under its ring (a card) or after its count (a row). */
export function pointsSpan(n: number): HTMLSpanElement {
  return h('span', 'brain-pts', {}, [pointsText(n)]);
}

/** A card's 16px ring and its "1/3" count. */
export function progress(done: number, total: number): HTMLSpanElement {
  return h('span', 'brain-progress', {}, [
    ring(done, total, 16, `${done} of ${total} done`),
    h('span', undefined, { 'aria-hidden': 'true' }, [`${done}/${total}`]),
  ]);
}

/** The plan icons, 16px: the calendar of Plan this week, the back and forward arrows, the clock of Later. */
export function planIcon(name: 'cal' | 'back' | 'fwd' | 'clock'): SVGSVGElement {
  const shapes: Record<'cal' | 'back' | 'fwd' | 'clock', SVGElement[]> = {
    cal: [svg('rect', { x: '2', y: '3', width: '12', height: '11', rx: '2' }), svg('path', { d: 'M2 6.75h12M5.25 1.75v2.5M10.75 1.75v2.5' })],
    back: [svg('path', { d: 'M13 8H3M7 3.5 2.5 8 7 12.5' })],
    fwd: [svg('path', { d: 'M3 8h10M9 3.5 13.5 8 9 12.5' })],
    clock: [svg('circle', { cx: '8', cy: '8', r: '6' }), svg('path', { d: 'M8 4.75V8l2.25 1.5' })],
  };
  return svg('svg', { class: 'brain-plan-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, shapes[name]);
}

/** Waiting's switch icon, 16px: the rows of Column view's switch, the columns of Group view's. Its button carries the label. */
export function switchIcon(name: 'rows' | 'columns'): SVGSVGElement {
  const line = name === 'rows' ? 'M2 6h12M2 10h12' : 'M6 2v12M10 2v12';
  return svg('svg', { class: 'brain-switch-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
    svg('rect', { x: '2', y: '2', width: '12', height: '12', rx: '2' }),
    svg('path', { d: line }),
  ]);
}

/** A story card's chevron, 16px: it turns down (the CSS) when the card's lines are open. Its button carries the label. */
export function peekIcon(): SVGSVGElement {
  return svg('svg', { class: 'brain-peek-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [svg('path', { d: 'M6 3.5l4.5 4.5L6 12.5' })]);
}

/**
 * Collapse all's and Expand all's icon, 16px. Collapse all is a compact list: three short lines, each with a dot before it. Expand
 * all is a detailed list: two small squares, each with two lines beside it. The dots are zero-length strokes with round caps.
 * The button carries the label.
 */
export function foldAllIcon(name: 'collapse' | 'expand'): SVGSVGElement {
  const shapes: Record<'collapse' | 'expand', SVGElement[]> = {
    collapse: [svg('path', { d: 'M2.5 3.5h.01M6 3.5h8.5M2.5 8h.01M6 8h8.5M2.5 12.5h.01M6 12.5h8.5' })],
    expand: [
      svg('rect', { x: '1.75', y: '1.75', width: '4.5', height: '4.5', rx: '1' }),
      svg('rect', { x: '1.75', y: '9.75', width: '4.5', height: '4.5', rx: '1' }),
      svg('path', { d: 'M9 2.5h5.5M9 5.5h5.5M9 10.5h5.5M9 13.5h5.5' }),
    ],
  };
  return svg('svg', { class: 'brain-fold-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, shapes[name]);
}

/** A checklist, 16px. Beside the tasks figure it is an image with its words; in the planning header its count carries them. */
export function tallyIcon(label?: string): SVGSVGElement {
  const words: Record<string, string> = label === undefined ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': label };
  return svg('svg', { class: 'brain-tally-icon', viewBox: '0 0 16 16', ...words }, [
    svg('path', { d: 'M2 4.67l1.33 1.33L6 3.33' }),
    svg('path', { d: 'M8.67 4H14' }),
    svg('path', { d: 'M8.67 8H14' }),
    svg('path', { d: 'M2 11.33l1.33 1.34L6 10' }),
    svg('path', { d: 'M8.67 12H14' }),
  ]);
}

/** Planned or due's due count, 16px: a flag, drawn in the danger colour by the CSS. */
export function flagIcon(): SVGSVGElement {
  return svg('svg', { class: 'brain-flag-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
    svg('path', { d: 'M3 14V2' }),
    svg('path', { d: 'M3 2.5h9l-2 2.5 2 2.5H3' }),
  ]);
}

/** The undo arrow of the head's Undo button: one stroke in currentColor, round caps, on the 16px grid (the mockup's brain-undo-icon). */
export function undoIcon(): SVGSVGElement {
  return svg('svg', { class: 'brain-undo-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
    svg('path', { d: 'M6 4.5 2.5 8 6 11.5' }),
    svg('path', { d: 'M2.5 8h6.5a3.5 3.5 0 0 1 0 7H6' }),
  ]);
}

/** The pager's 16px chevron, ‹ or ›. Its button carries the label. */
export function stepIcon(dir: 'prev' | 'next'): SVGSVGElement {
  return svg('svg', { class: 'brain-step-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
    svg('path', { d: dir === 'prev' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5l4.5 4.5L6 12.5' }),
  ]);
}

const SOMEDAY_D = 'M6.657 18c-2.572 0-4.657-2.007-4.657-4.483 0-2.475 2.085-4.482 4.657-4.482.393-1.762 1.794-3.2 3.675-3.773 1.88-.572 3.956-.193 5.444 1 1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486 0 1.927-1.551 3.487-3.465 3.487H6.657';

/** A project's state icon on its card: the mockup's outlines in the marks' 18px box. */
export function projectIcon(status: 'active' | 'paused' | 'someday' | 'done' | 'dropped'): SVGSVGElement {
  return svg('svg', { class: 'brain-mark brain-state-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true' }, projectShapes(status));
}

function projectShapes(status: 'active' | 'paused' | 'someday' | 'done' | 'dropped'): SVGElement[] {
  switch (status) {
    case 'active': return [svg('path', { d: 'M5.5 3.5v11L14 9z' })];
    case 'paused': return [
      svg('rect', { x: '4.5', y: '3.5', width: '3', height: '11', rx: '1' }),
      svg('rect', { x: '10.5', y: '3.5', width: '3', height: '11', rx: '1' }),
    ];
    case 'someday': return [svg('path', { transform: 'translate(0 .6) scale(.75)', d: SOMEDAY_D })];
    case 'done': return [svg('circle', { cx: '9', cy: '9', r: '8' }), svg('path', { d: 'M5 9.25l2.5 2.5L13 6.25' })];
    case 'dropped': return [svg('circle', { cx: '9', cy: '9', r: '8' }), svg('path', { d: 'M5.5 9h7' })];
  }
}
