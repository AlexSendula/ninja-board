import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fire } from '../../test/ui.ts';
import { h } from './dom.ts';
import { enableDrag } from './drag.ts';

const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y });

test('a row dragged by the link in its meta still drops on the column beneath: the zone is looked up past the dragged item', (t) => {
  // A meta link keeps pointer events (styles.css) while its row is lifted, so it can be the topmost element under the pointer.
  const link = h('a', 'brain-link', {}, ['Website for Sam']);
  const row = h('li', 'brain-task brain-draggable', { 'data-key': 'k' }, [h('p', 'brain-meta', {}, [link])]);
  const doing = h('ul', 'brain-col-items');
  const root = h('div', 'brain-board', {}, [
    h('section', 'brain-col', { 'data-column': 'todo' }, [h('ul', 'brain-col-items', {}, [row])]),
    h('section', 'brain-col', { 'data-column': 'doing' }, [doing]),
  ]);
  const doc = root.ownerDocument as unknown as Record<string, unknown>;
  Object.assign(doc, { elementsFromPoint: () => [link, doing], elementFromPoint: () => link });
  t.after(() => { delete doc.elementsFromPoint; });
  root.setPointerCapture = () => {};
  const drops: string[] = [];
  enableDrag(root, (_item, target) => { drops.push(target.kind === 'column' ? target.column : target.kind); });
  fire(link, 'pointerdown', mouse(10, 10));
  fire(link, 'pointermove', mouse(30, 10));
  fire(link, 'pointerup', mouse(30, 10));
  assert.deepEqual(drops, ['doing']);
});
