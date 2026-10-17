// The Undo button is redrawn with its page, so it is keyed like a row: a redraw gives the focus back to it, and Cmd/Ctrl+Z
// goes on from there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder, rowFor } from '../../test/ui.ts';   // first: it installs the DOM
import { h } from './dom.ts';
import { focusedKey, refocus } from './focus.ts';
import { viewHead } from './header.ts';
import { foldTile } from './page.ts';
import { taskRow } from './task.ts';
import { isBrainUndoKey } from './undoKey.ts';

/** An Undo pair for the head, naming the step on top. */
const undo = (label: string) => ({ mac: false, undo: (): void => {}, undoLabel: (): string | undefined => label });

test('the Undo button is keyed, so a redraw gives the focus back to the new button', () => {
  recorder();
  const before = viewHead({ label: 'Today', title: 'Tuesday', undo: undo('untick “A”') });
  const old = before.querySelector<HTMLButtonElement>('button.brain-undo');
  assert.ok(old);
  assert.equal(old.dataset.key, 'undo');
  // The old button has the focus: the render reads it as the focused key, and draws the page again.
  Object.defineProperty(old.ownerDocument, 'activeElement', { value: old, configurable: true });
  const root = h('div', 'brain-view', {}, [before]);
  assert.equal(focusedKey(root), 'undo');
  const after = viewHead({ label: 'Today', title: 'Tuesday', undo: undo('tick “A”') });
  const fresh = after.querySelector<HTMLButtonElement>('button.brain-undo');
  assert.ok(fresh);
  const focused: string[] = [];
  fresh.focus = () => void focused.push('fresh');
  refocus(h('div', 'brain-view', {}, [after]), 'undo');
  assert.deepEqual(focused, ['fresh']);
});

/**
 * Today's page as a redraw draws it: the Undo button in the head, and the task in its list, or once it is done, in a Done
 * group that is shut. Each control's focus() works as a browser's does: a disabled one, or one in a shut group, takes nothing.
 */
function drawPage(root: HTMLElement, done: boolean, undoLabel: string | undefined, focusTo: (el: HTMLElement) => void) {
  const { actions } = recorder();
  const item = taskRow(rowFor('Fix the hallway light switch', { state: done ? 'done' : 'todo', meta: [{ text: 'Home' }] }), actions);
  const list = h('ul', 'brain-tasks', {}, [item]);
  const body = done ? foldTile({ name: 'done', title: 'Done today', count: 1, open: false, content: [list] }) : h('section', 'brain-tile', {}, [list]);
  const page = h('div', 'brain-page', {}, [
    viewHead({ label: 'Today', title: 'Tuesday', undo: { mac: false, undo: (): void => {}, undoLabel: (): string | undefined => undoLabel } }),
    body,
  ]);
  root.replaceChildren(page);
  for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) el.focus = () => focusTo(el);
}

test('a tick, then the redraw: the focus goes to the toggle of the shut Done group, inside the view, and Cmd+Z goes on from there', () => {
  const root = h('div', 'brain-view', { tabindex: '-1' });
  const doc = root.ownerDocument;
  let active: Element | null = null;
  Object.defineProperty(doc, 'activeElement', { get: () => active, configurable: true });
  const focusTo = (el: HTMLElement) => {
    if (!el.hasAttribute('disabled') && !el.closest('[hidden]')) active = el;
  };
  drawPage(root, false, undefined, focusTo);
  // The click on the task's check focused it, as a click does; the render reads that before it draws again.
  active = root.querySelector('button.brain-check');
  const key = focusedKey(root);
  assert.ok(key, 'the focused row has a key');
  drawPage(root, true, 'tick “Fix the hallway light switch”', focusTo);
  refocus(root, key);
  assert.ok(active !== null && root.contains(active), 'the focus is in the view');
  assert.equal((active as Element).getAttribute('data-key'), 'fold:done');
  assert.equal(isBrainUndoKey({ key: 'z', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target: active as Element }), true);
});
