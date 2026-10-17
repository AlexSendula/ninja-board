import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('a dashboard note hides its Properties and the Bases toolbar, and only where a Brain view shows', () => {
  // The note and the embed that hold a view carry its mark (src/ui/host.ts): no :has, which Obsidian's review flags.
  assert.match(STYLES, /:is\(\.markdown-source-view, \.markdown-preview-view\)\.brain-note-host \.metadata-container \{ display: none; \}/);
  assert.match(STYLES, /:is\(\.block-language-base, \.bases-embed\)\.brain-embed-host \.bases-header \{ display: none; \}/);
  // Nowhere unscoped: every other note keeps both.
  assert.doesNotMatch(STYLES, /^\s*\.(metadata-container|bases-header)\b/m);
});
