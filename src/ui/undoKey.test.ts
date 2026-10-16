// Cmd/Ctrl+Z in a Brain view is Undo; anywhere else, and in a text field, it is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBrainUndoKey } from './undoKey.ts';

/** A key press whose target is inside `inside` (a Brain view, or not), and which is or is not inside a text field. */
function press(fields: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>, where: { inBrain: boolean; inField?: boolean }) {
  return {
    key: 'z', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...fields,
    target: {
      closest: (selector: string) => {
        if (selector.includes('input')) return where.inField ? {} : null;
        return where.inBrain ? {} : null;
      },
    },
  };
}

test('Cmd+Z and Ctrl+Z in a Brain view are Undo', () => {
  assert.equal(isBrainUndoKey(press({}, { inBrain: true })), true);
  assert.equal(isBrainUndoKey(press({ metaKey: false, ctrlKey: true }, { inBrain: true })), true);
  assert.equal(isBrainUndoKey(press({ key: 'Z' }, { inBrain: true })), true);
});

test('outside a Brain view, in a text field, or with another modifier, Undo is not taken', () => {
  assert.equal(isBrainUndoKey(press({}, { inBrain: false })), false, 'the editor keeps its own undo');
  assert.equal(isBrainUndoKey(press({}, { inBrain: true, inField: true })), false, 'a field keeps its own undo');
  assert.equal(isBrainUndoKey(press({ shiftKey: true }, { inBrain: true })), false, 'redo is not Undo');
  assert.equal(isBrainUndoKey(press({ altKey: true }, { inBrain: true })), false);
  assert.equal(isBrainUndoKey(press({ key: 'y' }, { inBrain: true })), false);
  assert.equal(isBrainUndoKey(press({ metaKey: false }, { inBrain: true })), false, 'no Cmd or Ctrl');
});
