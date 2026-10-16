import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// styles.css is the mockup's #brain-css block with two differences, and only these: every rule is
// scoped under .brain-view, and the note-context reset stands in for the mockup's one-line reset
// (see the comment at the top of styles.css).
const STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const MOCKUP = readFileSync(new URL('../design/mockup.html', import.meta.url), 'utf8');

const OPEN = '<style id="brain-css">';
const MOCKUP_RESET = '.brain-view :where(h2, h3, h4, p, ul, ol, li)';
const NOTE_RESET_FIRST = '/* Bases views sit inside a note';
const NOTE_RESET_LAST = '::before { content: none; }';

/** The mockup's #brain-css block, without its one-line reset. */
function mockupCss(): string {
  const from = MOCKUP.indexOf(OPEN);
  assert.ok(from >= 0, 'the mockup has a <style id="brain-css"> block');
  const lines = MOCKUP.slice(from + OPEN.length, MOCKUP.indexOf('</style>', from)).split('\n');
  const kept = lines.filter((l) => !l.startsWith(MOCKUP_RESET));
  assert.equal(lines.length - kept.length, 1, 'the mockup has one reset line');
  return kept.join('\n');
}

/** styles.css without the note-context reset: from its comment through the indentation-guide rule. */
function stylesCss(): string {
  const lines = STYLES.split('\n');
  const from = lines.findIndex((l) => l.startsWith(NOTE_RESET_FIRST));
  const to = lines.findIndex((l, i) => i > from && l.includes(NOTE_RESET_LAST));
  assert.ok(from >= 0 && to > from, 'styles.css has the note-context reset');
  return [...lines.slice(0, from), ...lines.slice(to + 1)].join('\n');
}

/**
 * Whitespace collapsed, then the scope taken off. Three scoping forms: `.brain-view ` (by descent, and the
 * rules that already start with .brain-view), `.brain-view.brain-` (the planner card and the list modal's
 * content, which carry .brain-view themselves) and `:has(> .brain-view)` (the list modal's frame).
 */
function unscoped(css: string): string {
  return css.replace(/\s+/g, ' ').replaceAll('.brain-view ', '').replaceAll('.brain-view.brain-', '.brain-').replaceAll(':has(> .brain-view)', '').trim();
}

/** Every selector of every style rule, split at top-level commas. Rules inside @keyframes are left out. */
function selectors(css: string): string[] {
  const found: string[] = [];
  const open: string[] = [];   // the prelude of each block we are inside
  let text = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      const prelude = text.trim();
      if (!prelude.startsWith('@') && !open.some((p) => p.includes('keyframes'))) found.push(...topLevel(prelude));
      open.push(prelude);
      text = '';
    } else if (ch === '}') {
      open.pop();
      text = '';
    } else if (ch === ';') {
      text = '';   // the end of a declaration
    } else {
      text += ch;
    }
  }
  return found;
}

/** A selector list split at the commas outside parentheses: `:is(a, b), c` gives `:is(a, b)` and `c`. */
function topLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const ch of list) {
    if (ch === ',' && depth === 0) {
      parts.push(part.trim());
      part = '';
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    part += ch;
  }
  parts.push(part.trim());
  return parts;
}

test('styles.css is the mockup #brain-css block, scoped under .brain-view', () => {
  const plugin = unscoped(stylesCss());
  const mockup = unscoped(mockupCss());
  if (plugin === mockup) return;
  let at = 0;
  while (plugin[at] === mockup[at]) at++;
  const near = (s: string) => s.slice(Math.max(0, at - 40), at + 80);
  assert.fail(`styles.css and #brain-css part at character ${at}:\n  styles.css: …${near(plugin)}\n  mockup:     …${near(mockup)}`);
});

test('styles.css has no colour literals', () => {
  assert.doesNotMatch(STYLES, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(STYLES, /(?:rgba?|hsla?)\(/);
});

test('every selector in styles.css is scoped under .brain-view', () => {
  const all = selectors(STYLES);
  assert.ok(all.length > 100, `only ${all.length} selectors found: the parser is off`);
  assert.deepEqual(all.filter((s) => !/\.brain-view(?![\w-])/.test(s)), []);
});

test('the scope forms: the card and the modal content are compound, the frame is :has', () => {
  assert.doesNotMatch(STYLES, /\.brain-view \.brain-(popover|modal-body)\b/);
  assert.doesNotMatch(STYLES, /\.brain-modal(?![\w:-])/);
});

test('the list and day modals lay their content out as a flex column, so the grid scrolls beneath the search', () => {
  // Obsidian makes .modal-content a block on a desktop; only the plugin's own rule makes the grid and the day scroller shrink.
  assert.match(STYLES, /\.brain-view\.brain-modal-body \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;/);
  assert.match(STYLES, /\.brain-day-modal:has\(> \.brain-view\) > \.brain-view \{[^}]*display: flex;[^}]*min-height: 0;/);
});

test('Waiting on the Week board: one view below 720px, and Group view is a three-up grid only at 720px and up', () => {
  // Below 720px the board is Column view whatever is saved, and the switch is out of the way: display none, out of the tab order.
  assert.match(STYLES, /@container brain \(max-width: 719px\) \{ \.brain-view button\.brain-switch, \.brain-view button\.brain-switch:is\(:hover, :active, :focus, :focus-visible\) \{ display: none; \} \}/);
  // Group view: To do and Done span both rows; Doing is row 1 beside To do, and Waiting is row 2 under Doing, taking the rest of the height.
  assert.match(STYLES, /@container brain \(min-width: 720px\) \{\n  \.brain-view \.brain-board-week\[data-waiting="group"\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-template-rows: auto 1fr;/);
  assert.match(STYLES, /\.brain-view \.brain-board-week\[data-waiting="group"\] > \.brain-col\[data-states~="todo"\] \{ grid-column: 1; grid-row: 1 \/ 3; \}/);
  assert.match(STYLES, /\.brain-view \.brain-board-week\[data-waiting="group"\] > \.brain-col\[data-states~="doing"\] \{ grid-column: 2; grid-row: 1; \}/);
  assert.match(STYLES, /\.brain-view \.brain-board-week\[data-waiting="group"\] > \.brain-col\[data-states~="waiting"\] \{ grid-column: 2; grid-row: 2;/);
  assert.match(STYLES, /\.brain-view \.brain-board-week\[data-waiting="group"\] > \.brain-col\[data-states~="done"\] \{ grid-column: 3; grid-row: 1 \/ 3; \}/);
  // Waiting is a column in both views: the group is no nested box any more.
  assert.doesNotMatch(STYLES, /brain-waiting-group/);
});

test('Group view from 560px is two columns below 720px, as Column view; the three-up grid overrides it from 720px', () => {
  // The 560px rule leaves Group view out, so the 880px rule can't override the three-up grid; this rule gives it two columns below 720px.
  assert.match(STYLES, /@container brain \(min-width: 560px\) \{ \.brain-view \.brain-board-week\[data-waiting="group"\] \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \} \}/);
  assert.ok(STYLES.indexOf('[data-waiting="group"] { grid-template-columns: repeat(2') < STYLES.indexOf('[data-waiting="group"] { grid-template-columns: repeat(3'), 'the 720px grid comes after the 560px rule, so it wins from 720px');
});

test('Group view puts Waiting right under Doing: the 720px layout has no row gap', () => {
  // The board's base gap is 24px between rows, so the layout sets its own row gap: none, so Waiting sits under Doing's last row.
  assert.match(STYLES, /\.brain-view \.brain-board-week\[data-waiting="group"\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-template-rows: auto 1fr; row-gap: 0; \}/);
});
