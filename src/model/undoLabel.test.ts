// The names Undo gives its step: what the button says it would do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datesUndoLabel, lineTitle, noteTitle, pointsUndoLabel, stateUndoLabel, statusName, tickUndoLabel } from './undoLabel.ts';

test('a check is undone as an untick, and an untick as a tick, whatever the state it left', () => {
  assert.equal(tickUndoLabel('Pay the window cleaner', 'todo'), 'untick “Pay the window cleaner”');
  assert.equal(tickUndoLabel('Pay the window cleaner', 'doing'), 'untick “Pay the window cleaner”', 'a Doing task is ticked too');
  assert.equal(tickUndoLabel('Pay the window cleaner', 'open'), 'untick “Pay the window cleaner”', 'a note says open for To do');
  assert.equal(tickUndoLabel('Pay the window cleaner', 'done'), 'tick “Pay the window cleaner”');
});

test('any other state change says what it goes back to, a project too', () => {
  assert.equal(stateUndoLabel('Build the header', 'doing'), 'set “Build the header” back to Doing');
  assert.equal(stateUndoLabel('Build the header', 'todo'), 'set “Build the header” back to To do');
  assert.equal(stateUndoLabel('Try a builder', 'waiting'), 'set “Try a builder” back to Waiting');
  assert.equal(stateUndoLabel('Renovate the kitchen', 'done'), 'set “Renovate the kitchen” back to Done', 'leaving Done');
  assert.equal(stateUndoLabel('Renovate the kitchen', 'someday'), 'set “Renovate the kitchen” back to Someday');
});

test('dates and points say what they restore', () => {
  assert.equal(datesUndoLabel('Renew passport'), 'restore the dates of “Renew passport”');
  assert.equal(pointsUndoLabel('Order cabinets'), 'restore the points of “Order cabinets”');
});

test('a status reads as a name: open is To do, the rest are capitalised', () => {
  assert.equal(statusName('open'), 'To do');
  assert.equal(statusName('todo'), 'To do');
  assert.equal(statusName('someday'), 'Someday');
});

test('a line is titled by its text, a note by its name', () => {
  assert.equal(lineTitle('- [ ] Pay the [[Window cleaner]] #home [due:: 2026-10-18]', 'a.md', 0), 'Pay the Window cleaner');
  assert.equal(noteTitle('03 Projects/Renovate the kitchen/Order cabinets.md'), 'Order cabinets');
});
