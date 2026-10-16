import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../test/ui.ts';
import { h } from './dom.ts';
import { isBrainUndoKey } from './undoKey.ts';

const cmdZ = (target: Element) => ({ key: 'z', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target });

/** A dashboard note in Live Preview: the editor's content is editable, the embedded base an island that isn't, Brain inside it. */
function livePreview() {
  const check = h('button', 'brain-check');
  const field = h('input', 'brain-search');
  const view = h('div', 'brain-view', {}, [check, field]);
  const island = h('div', 'cm-embed-block', { contenteditable: 'false' }, [view]);
  const line = h('div', 'cm-line');
  const editor = h('div', 'cm-content', { contenteditable: 'true' }, [line, island]);
  return { check, field, line, editor };
}

test('Cmd+Z on a Brain view embedded in Live Preview is Undo: the nearest contenteditable, the island, says false', () => {
  const { check } = livePreview();
  assert.equal(isBrainUndoKey(cmdZ(check)), true);
});

test('in the editor itself, or in a field inside Brain, Cmd+Z stays theirs', () => {
  const { field, line } = livePreview();
  assert.equal(isBrainUndoKey(cmdZ(line)), false, 'the note text keeps its own undo');
  assert.equal(isBrainUndoKey(cmdZ(field)), false, 'a search field keeps its own undo');
});
