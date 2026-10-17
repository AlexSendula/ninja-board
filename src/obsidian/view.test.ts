import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Plugin, QueryController } from 'obsidian';
import '../../test/ui.ts';   // installs linkedom's document, for the view's container
import { BrainView } from './view.ts';

/** A Week view on a container, with its draw replaced by a counter: the test looks at when a draw is asked for. */
function weekView(): { view: BrainView; draws: () => number } {
  const host = document.createElement('div') as HTMLElement;
  // Obsidian adds createDiv to every element; linkedom has none.
  Object.assign(host, {
    createDiv: (opts?: { cls?: string }) => {
      const div = document.createElement('div');
      div.className = opts?.cls ?? '';
      host.appendChild(div);
      return div;
    },
  });
  const view = new BrainView({} as QueryController, host, 'ninja-board-week', { app: {} } as unknown as Plugin);
  let draws = 0;
  (view as unknown as { render: () => Promise<void> }).render = async () => {
    draws++;
  };
  return { view, draws: () => draws };
}

test('showWeek, arrange and scheduleView draw at once, not after the 150 ms debounce the vault events use', () => {
  const { view, draws } = weekView();
  view.showWeek('2026-10-19');
  assert.equal(draws(), 1);
  view.arrange({});
  assert.equal(draws(), 2);
  view.scheduleView('compact');
  assert.equal(draws(), 3);
});

test('waitingView draws at once, as scheduleView does', () => {
  const { view, draws } = weekView();
  view.waitingView('group');
  assert.equal(draws(), 1);
  view.waitingView('column');
  assert.equal(draws(), 2);
});

test('a view ends its drags when it unloads, its own only', () => {
  // No test calls onunload (it needs Obsidian's view lifecycle), so the call is read from the source.
  const src = readFileSync(new URL('./view.ts', import.meta.url), 'utf8');
  assert.match(src, /onunload\(\): void \{[^}]*cancelDrags\(this\.root\);/);
});
