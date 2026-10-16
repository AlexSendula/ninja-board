// A drop, and a planner pick, are each one undo step: the drop's writes run inside actions.group, named for the card
// it moved. A plain tick or plan is no group: the obsidian layer names that step itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { dropOnProjects, renderProjects } from './projects.ts';
import { buildProjects } from '../model/projects.ts';
import { loadSample } from '../../test/sample.ts';
import type { Actions } from './actions.ts';
import type { DropTarget } from './drag.ts';

const TODAY = '2026-10-13';
const vm = buildProjects(loadSample(), TODAY);
const onto = (column: string, index: number | null = null): DropTarget => ({ kind: 'column', column, index }) as DropTarget;

/** The recorder's actions, with each group's name kept in order. */
function grouped() {
  const { actions, calls } = recorder();
  const groups: string[] = [];
  const spied: Actions = {
    ...actions,
    group: async (label, run) => {
      groups.push(label);
      await run();
    },
  };
  return { actions: spied, calls, groups };
}

test('a project dropped on another column is one step, named for the project it moved', async () => {
  const { actions, calls, groups } = grouped();
  const root = document.createElement('div');
  renderProjects(root, vm, actions);
  const card = vm.columns.flatMap((c) => c.cards).find((c) => c.title === 'Learn Spanish');
  assert.ok(card);
  const el = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((e) => e.dataset.key === card.key);
  assert.ok(el);
  dropOnProjects(vm, actions)(el, onto('active', 1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(groups, ['move “Learn Spanish” back']);
  assert.deepEqual(calls.map(([name]) => name), ['setNoteStatus', 'arrange']);
});
