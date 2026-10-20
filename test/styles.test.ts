import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

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
 * Whitespace collapsed, then the scope taken off. Two scoping forms: `.brain-view ` (by descent, and the rules
 * that already start with .brain-view) and `.brain-view.brain-` (the planner card and the list modal's content,
 * which carry .brain-view themselves).
 */
function unscoped(css: string): string {
  return css.replace(/\s+/g, ' ').replaceAll('.brain-view ', '').replaceAll('.brain-view.brain-', '.brain-').trim();
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

test('every selector in styles.css is scoped under .brain-view, or is a modal frame', () => {
  const all = selectors(STYLES);
  assert.ok(all.length > 100, `only ${all.length} selectors found: the parser is off`);
  // A modal's frame is the element Obsidian opens around the view, so it is outside .brain-view: its own class scopes it.
  // The carry's class is set on that container too (src/obsidian/listModal.ts).
  // A base block or embed that holds a view is marked by src/ui/host.ts, and its mark scopes the rule. A board page carries the
  // class its own frontmatter names (cssclasses: ninja-board), which Obsidian sets on the note as it draws it.
  const frames = ['.brain-modal', '.brain-day-modal', '.brain-carrying'];
  const scoped = /\.brain-view(?![\w-])|\.brain-embed-host(?![\w-])|(?<![\w-])\.ninja-board(?![\w-])/;
  assert.deepEqual(all.filter((s) => !scoped.test(s) && !frames.includes(s)), []);
});

test('the embed rule is keyed to the mark src/ui/host.ts sets', () => {
  const host = readFileSync(new URL('../src/ui/host.ts', import.meta.url), 'utf8');
  assert.match(STYLES, /\.brain-embed-host\b/);
  assert.match(host, /'brain-embed-host'/);
});

test('the board-page rules are keyed to the class a board page carries: cssclasses ninja-board, which isBoardPage matches and the dashboard notes hold', () => {
  const classes = (STYLES.match(/(?<![\w-])\.ninja-board(?![\w-])/g) ?? []).length;
  assert.ok(classes >= 2, 'the variables rule and the title rule');
  assert.match(readFileSync(new URL('../src/model/isBoardPage.ts', import.meta.url), 'utf8'), /BOARD_CLASS = 'ninja-board'/);
  const dir = new URL('../sample-vault/01 Dashboard/', import.meta.url);
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    assert.match(readFileSync(new URL(name, dir), 'utf8'), /\ncssclasses:\n {2}- ninja-board\n---\n/, name);
  }
});

test('the scope forms: the card and the modal content are compound, and the modal frames are their own classes', () => {
  assert.doesNotMatch(STYLES, /\.brain-view \.brain-(popover|modal-body)\b/);
  // The frames carry the class the modal is opened with (src/obsidian), and only a brain view is in them: no :has needed.
  assert.match(STYLES, /\n\.brain-modal \{ --dialog-width/);
  assert.match(STYLES, /\n\.brain-day-modal \{ --dialog-width/);
});

test('styles.css uses none of the features Obsidian review flags: :has, !important, clip-path, multicolumn or display: contents', () => {
  assert.doesNotMatch(STYLES, /:has\(/);
  assert.doesNotMatch(STYLES, /!important/);
  assert.doesNotMatch(STYLES, /clip-path/);
  // column-gap is a multicolumn property to the scanner, even in grid and flex: the plugin uses the gap shorthand.
  assert.doesNotMatch(STYLES, /(?<![-\w])columns?\s*:|column-(?:count|width|rule|span|fill|gap)/);
  assert.doesNotMatch(STYLES, /display:\s*contents/);
});

test('the list and day modals lay their content out as a flex column, so the grid scrolls beneath the search', () => {
  // Obsidian makes .modal-content a block on a desktop; only the plugin's own rule makes the grid and the day scroller shrink.
  assert.match(STYLES, /\.brain-view\.brain-modal-body \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;/);
  assert.match(STYLES, /\.brain-day-modal > \.brain-view \{[^}]*display: flex;[^}]*min-height: 0;/);
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

test('a carried list modal hides its container by class, in styles.css and in the mockup', () => {
  // The carry sets the class on the modal's container, the element that holds the backdrop; the board beneath then takes the pointer.
  assert.match(STYLES, /\n\.brain-carrying \{ visibility: hidden; \}/);
  assert.match(MOCKUP, /\n\.brain-carrying \{ visibility: hidden; \}/);
});

test('no source writes an element style directly: a run-time value goes through setCssProps or setCssStyles, a fixed one to a class', () => {
  // Obsidian's review flags a literal written to .style, and passes one computed at run time, so this reads the source for both.
  // The preview's shim is the one place that writes the style: it is what setCssProps and setCssStyles stand for.
  const base = new URL('../src/', import.meta.url);
  const previewBase = new URL('../preview/', import.meta.url);
  const sources = [
    ...readdirSync(base, { recursive: true, encoding: 'utf8' }).map((f) => new URL(f, base)),
    ...readdirSync(previewBase, { recursive: true, encoding: 'utf8' }).map((f) => new URL(f, previewBase)),
  ].filter((u) => u.pathname.endsWith('.ts') && !u.pathname.endsWith('.test.ts') && !u.pathname.endsWith('/obsidian-dom.ts') && !u.pathname.includes('/dist/'));
  const direct = /\.style\.(?:setProperty\(|cssText\b|[a-zA-Z]+\s*=(?!=))|\.style\s*=(?!=)|setAttribute\(\s*['"]style['"]/;
  const found: string[] = [];
  for (const u of sources) {
    readFileSync(u, 'utf8').split('\n').forEach((line, i) => {
      if (direct.test(line)) found.push(`${u.pathname.split('/plugin/')[1]}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.ok(sources.length > 50, `only ${sources.length} source files found: the walk is off`);
  assert.deepEqual(found, []);
});

test('no source uses a lookbehind: iOS before 16.4 has none', () => {
  // The tests may keep one as an oracle (they are not shipped), so only the shipped .ts files are read.
  const base = new URL('../src/', import.meta.url);
  const files = readdirSync(base, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.length > 50, `only ${files.length} source files found: the walk is off`);
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, base), 'utf8'), /\(\?<[=!]/, f);
});

test('the Undo button is never taken out of the layout: styles.css hides it by visibility, so the head keeps its height', () => {
  const rules = STYLES.match(/[^{}]*brain-undo[^{}]*\{[^{}]*\}/g) ?? [];
  assert.ok(rules.length > 0, 'styles.css styles the Undo button');
  for (const rule of rules) assert.doesNotMatch(rule, /display\s*:\s*none/, rule);
  assert.match(STYLES, /\.brain-view button\.brain-undo:disabled \{ visibility: hidden; \}/);
});

test('the story chevron shows on hover or keyboard focus on the Week view\'s story cards only, always on touch, and keeps its place', () => {
  // Every rule that sets its opacity is scoped by .brain-foldable, the class only the Week view's story cards carry (every week's, and the list modal's): Backlog's planner chevrons are untouched.
  const rules = STYLES.match(/[^{}]*brain-peek[^{}]*\{[^{}]*opacity[^{}]*\}/g) ?? [];
  assert.ok(rules.length >= 4, `only ${rules.length} rules set the chevron's opacity`);
  for (const rule of rules) {
    assert.match(rule, /\.brain-foldable/, rule);
    assert.doesNotMatch(rule, /display\s*:|visibility\s*:/, rule);   // opacity, so its place stays and nothing shifts when it shows
  }
  assert.match(STYLES, /@media \(hover: hover\) \{\n  \.brain-view \.brain-foldable > \.brain-card-head > button\.brain-peek \{ opacity: 0; \}\n  \.brain-view \.brain-foldable:hover > \.brain-card-head > button\.brain-peek,\n  \.brain-view \.brain-foldable\.brain-keyboard-focus > \.brain-card-head > button\.brain-peek \{ opacity: 1; \}\n  \.brain-view \.brain-foldable\.brain-hover-kept > \.brain-card-head > button\.brain-peek \{ opacity: 1; \}[^\n]*\n\}/);
  assert.match(STYLES, /@media \(hover: none\) \{\n  \.brain-view \.brain-foldable > \.brain-card-head > button\.brain-peek \{ opacity: 1; \}\n\}/);
  // The mockup has the same rules (the first test compares the whole block).
  assert.match(MOCKUP, /\.brain-foldable:hover > \.brain-card-head > button\.brain-peek,\n  \.brain-foldable\.brain-keyboard-focus > \.brain-card-head > button\.brain-peek \{ opacity: 1; \}/);
});

test('a redraw keeps the chevron shown on the card the pointer was on: brain-hover-kept sets its opacity to 1 in the (hover: hover) block, so it never fades in again', () => {
  const rule = String.raw`\.brain-foldable\.brain-hover-kept > \.brain-card-head > button\.brain-peek \{ opacity: 1; \}`;
  const inHover = (scope: string) => new RegExp(String.raw`@media \(hover: hover\) \{\n(?:  [^\n]*\n)*?  ${scope}${rule}[^\n]*\n(?:  [^\n]*\n)*?\}`);
  assert.match(STYLES, inHover(String.raw`\.brain-view `));
  assert.match(MOCKUP, inHover(''));
  // The existing 0.15s fade stays for a real hover in and out: the transition rule is not touched.
  assert.match(STYLES, /\.brain-view \.brain-foldable > \.brain-card-head > button\.brain-peek \{ transition: opacity 0\.15s var\(--brain-ease\); \}/);
});

test('a redraw keeps what the pointer was on looking hovered: the card\'s shadow, the chevron\'s and the quiet button\'s hover look, each right after its :hover rule in the (hover: hover) block', () => {
  // Each element the pointer is on gets brain-hover-kept across a redraw. Without these rules the new element starts from its resting look and fades into the hover look.
  const looks = [
    [String.raw`\.brain-card\.brain-draggable`, String.raw`box-shadow: var\(--shadow-s\);`],
    [String.raw`button\.brain-peek`, String.raw`color: var\(--text-normal\); background-color: var\(--background-modifier-hover\);`],
    [String.raw`button\.brain-quiet`, String.raw`color: var\(--text-normal\);`],
  ];
  for (const [selector, look] of looks) {
    const pair = (scope: string) => new RegExp(String.raw`@media \(hover: hover\) \{\n(?:  [^\n]*\n)*?  ${scope}${selector}:hover \{ ${look} \}[^\n]*\n  ${scope}${selector}\.brain-hover-kept \{ ${look} \}[^\n]*\n(?:  [^\n]*\n)*?\}`);
    assert.match(STYLES, pair(String.raw`\.brain-view `), selector);
    assert.match(MOCKUP, pair(String.raw`(?:\.brain-view )?`), selector);
  }
});

test('each foldable card is its own stacking context, so its open lines never stack above a dragged item', () => {
  // Without it the lines (z-index 3) join the view's context and draw over a lifted or floating row (z-index 2) dragged across an open card.
  assert.match(STYLES, /\.brain-view \.brain-foldable \{ z-index: 0; \}/);
  assert.match(MOCKUP, /\n\.brain-foldable \{ z-index: 0; \}/);
});

test('the Collapse all icons take the shared icon stroke and size, and the button is a quiet one that sits at the end of Coming up', () => {
  assert.match(STYLES, /\.brain-view :is\([^)]*\.brain-fold-icon\) > \* \{\s*fill: none; stroke: currentColor;/);
  assert.match(STYLES, /\.brain-view \.brain-plan-icon, \.brain-view \.brain-switch-icon, \.brain-view \.brain-fold-icon \{ flex: none; width: var\(--size-4-4\); height: var\(--size-4-4\);/);
  assert.match(STYLES, /\.brain-view \.brain-week-line > button\.brain-fold-all \{[^}]*flex: none;/);
  // Below 560px the button shares the label's line, so the chips keep a line to themselves: Coming up stays three chips wide at 320px.
  assert.match(STYLES, /@container brain \(max-width: 559px\) \{[^}]*\.brain-week-line > \.brain-label \{ flex: 1 1 auto; \}\s*\.brain-view \.brain-week-chips \{ order: 1; flex-basis: 100%; \}/);
});

test('the Collapse all button ends the Planned or due heading row and a past week\'s source line, and a foldable list card\'s chevron takes the card\'s left edge', () => {
  // In a label row it sits as Show all N does: the text's edge on the column's, the row keeping a label's height, centred on the icon.
  assert.match(STYLES, /\.brain-view \.brain-label-row > :is\(\.brain-more, \.brain-fold-all\) \{ margin-inline: auto calc\(var\(--size-4-2\) \* -1\);/);
  assert.match(STYLES, /\.brain-view \.brain-label-row > \.brain-fold-all \{ align-self: center; \}/);
  // On a source line with no chips to fill the row, the button's auto start margin puts it at the right end.
  assert.match(STYLES, /\.brain-view \.brain-week-line > button\.brain-fold-all \{[^}]*margin-inline: auto calc\(var\(--size-4-2\) \* -1\);/);
  // A foldable list card's head is not positioned, so the chevron's hit area is the card's left edge, as on a board card; Backlog's cards keep theirs.
  assert.match(STYLES, /\.brain-view \.brain-card\[data-story\]\.brain-foldable > \.brain-card-head \{ position: static; \}/);
  assert.match(STYLES, /\.brain-view \.brain-card\[data-story\] > \.brain-card-head \{ position: relative; \}/);
  assert.match(MOCKUP, /\n\.brain-label-row > :is\(\.brain-more, \.brain-fold-all\) \{/);
  assert.match(MOCKUP, /\n\.brain-card\[data-story\]\.brain-foldable > \.brain-card-head \{ position: static; \}/);
});
