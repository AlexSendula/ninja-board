// The Undo button is redrawn with its page, so it is keyed like a row: a redraw gives the focus back to it, and Cmd/Ctrl+Z
// goes on from there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { h } from './dom.ts';
import { focusedKey, refocus } from './focus.ts';
import { viewHead } from './header.ts';

/** An Undo pair for the head, naming the step on top. */
const undo = (label: string) => ({ undo: (): void => {}, undoLabel: (): string | undefined => label });

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
