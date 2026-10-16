// The Undo button fades in when a step first makes it show. Every step redraws the page, so a button that a draw shows
// again, straight after a draw that showed it too, is marked steady and does not replay the fade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder } from '../../test/ui.ts';   // first: it installs the DOM
import { viewHead } from './header.ts';

const undo = (label: string) => ({ undo: (): void => {}, undoLabel: (): string | undefined => label });

function button(label: string): HTMLButtonElement {
  const head = viewHead({ label: 'Today', title: 'Tuesday', undo: undo(label) });
  const found = head.querySelector<HTMLButtonElement>('button.brain-undo');
  assert.ok(found);
  return found;
}

test('the button fades in when it first shows, and a redraw that keeps it shown does not replay the fade', () => {
  recorder();
  assert.equal(button('untick “A”').hasAttribute('data-steady'), false, 'the first show fades in');
  assert.equal(button('tick “A”').hasAttribute('data-steady'), true, 'a redraw that keeps it shown is steady');
  assert.equal(button('untick “B”').hasAttribute('data-steady'), true, 'and so is the next one');
  assert.equal(button('').hasAttribute('data-steady'), false, 'a draw with nothing to undo hides it');
  assert.equal(button('untick “C”').hasAttribute('data-steady'), false, 'the first change after that fades in again');
});
