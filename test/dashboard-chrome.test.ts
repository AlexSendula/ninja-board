import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('a board page, a note whose cssclasses holds ninja-board, hides its Properties in editing and in reading view, through the two variables Obsidian reads', () => {
  // A display rule here loses to Obsidian's own (`.is-live-preview.show-properties .metadata-container`), so the class sets the variables.
  // Obsidian puts the class on the note as it draws it, in editing and in reading view, so nothing shows first.
  assert.match(STYLES, /\n\.ninja-board \{ --metadata-display-editing: none; --metadata-display-reading: none; \}/);
  assert.doesNotMatch(STYLES, /\.metadata-container/);
});

test('a board page hides its title, and the Bases toolbar goes with the base block or embed that holds a view', () => {
  assert.match(STYLES, /\n\.ninja-board \.inline-title \{ display: none; \}/);
  assert.match(STYLES, /:is\(\.block-language-base, \.bases-embed\)\.brain-embed-host \.bases-header \{ display: none; \}/);
});

test('there is no note-level host mark: the mark never reached the note, so a note without the class keeps its Properties and title', () => {
  // Bases attaches a view to the note after the view has loaded, so the mark set on load found no note (measured in Obsidian 1.14.4).
  // The name is spelled with a class, so that this file does not hold the string it checks for.
  assert.doesNotMatch(STYLES, /brain-no[t]e-host/);
  assert.doesNotMatch(readFileSync(new URL('../src/ui/host.ts', import.meta.url), 'utf8'), /brain-no[t]e-host/);
});

test('the three cases are explained in one comment above the rules', () => {
  const at = STYLES.indexOf('\n.ninja-board {');
  const comment = STYLES.slice(STYLES.lastIndexOf('/*', at), at);
  assert.match(comment, /cssclasses: ninja-board/);
  assert.match(comment, /Bases toolbar/);
  assert.match(comment, /embeds a dashboard included, shows its own Properties and title/);
  assert.match(comment, /brain-embed-host/);
});

test('the variables, the title and the toolbar are hidden nowhere unscoped: every other note keeps them', () => {
  const rules = STYLES.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => /--metadata-display|\.inline-title|\.bases-header|\.metadata-container/.test(l));
  assert.equal(rules.length, 3);
  for (const rule of rules) assert.match(rule, /\.brain-embed-host|^\.ninja-board /, rule);
});
