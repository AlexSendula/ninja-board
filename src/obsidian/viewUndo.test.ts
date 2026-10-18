// The saved layouts (arrange, the Schedule and Waiting switches) are undo steps, and a session-only choice is not. Folding stories on the
// Week board is saved in the config too, but it is not an undo step: it changes what is shown, not the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BasesViewConfig, Plugin, QueryController } from 'obsidian';
import '../../test/ui.ts';   // installs linkedom's document, for the view's container
import { BrainView } from './view.ts';
import { history } from './undo.ts';

/** A Week view on a container, its draw replaced by a counter, and its config a plain object that Bases would write to. */
function view(config: Record<string, unknown> = {}, persists = true) {
  const host = document.createElement('div') as HTMLElement;
  Object.assign(host, {
    createDiv: (opts?: { cls?: string }) => {
      const div = document.createElement('div');
      div.className = opts?.cls ?? '';
      host.appendChild(div);
      return div;
    },
  });
  const brain = new BrainView({} as QueryController, host, 'ninja-board-week', { app: {} } as unknown as Plugin);
  (brain as unknown as { config: unknown }).config = {
    get: (key: string) => config[key],
    set: (key: string, value: unknown) => {
      if (!persists) throw new Error('no config');
      config[key] = value;
    },
  } as unknown as BasesViewConfig;
  (brain as unknown as { render: () => Promise<void> }).render = async () => {};
  return brain;
}

test('an arrangement saved on a board is an undo step, and undo puts the layout back', async () => {
  history.clear();
  const saved: Record<string, unknown> = {};
  const brain = view(saved);
  brain.arrange({ todo: ['Home › Clean the gutters'] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(history.label(), 'move back');
  assert.deepEqual(saved.arrange, { todo: ['Home › Clean the gutters'] });
  await history.undo(async (writes) => {
    // The restore itself is covered in undo.test.ts; here the step is simply the layout write.
    assert.equal(writes.length, 1);
    return true;
  });
});

test('the Schedule and Waiting switches are undo steps, named for the view undo shows', async () => {
  history.clear();
  const saved: Record<string, unknown> = { waiting: 'group' };
  const brain = view(saved);
  brain.scheduleView('compact');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(history.label(), 'restore the Schedule view');
  brain.waitingView('column');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(history.label(), 'show Waiting inside Doing');
});

test('a choice the config cannot hold is kept for the session, and is not an undo step', async () => {
  history.clear();
  const brain = view({}, false);
  brain.scheduleView('compact');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(history.label(), undefined);
});

test('folded stories are saved in the config but are not an undo step, even next to a layout that is', async () => {
  history.clear();
  const saved: Record<string, unknown> = {};
  const brain = view(saved);
  brain.foldStories(['Order cabinets', "Choose hosting for Sam's site"], true);
  brain.foldStories(['Order cabinets'], false);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(saved.collapsed, ["Choose hosting for Sam's site"]);
  assert.equal(history.label(), undefined);
  brain.waitingView('group');
  brain.foldStories(['Home'], true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(history.label(), 'show Waiting as its own column');   // the waiting switch is the newest step; the fold after it is none
  assert.deepEqual(saved.collapsed, ["Choose hosting for Sam's site", 'Home']);
  history.clear();
});

test('a fold the config cannot hold is kept for the session, and is not an undo step', async () => {
  history.clear();
  const brain = view({}, false);
  brain.foldStories(['Order cabinets'], true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(history.label(), undefined);
});
