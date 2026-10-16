import { test } from 'node:test';
import assert from 'node:assert/strict';
// Side-effect imports load both contract files, so Node must resolve ".ts" and strip their types.
import '../src/model/types.ts';
import '../src/ui/actions.ts';
import type { TaskState } from '../src/model/types.ts';

test('TypeScript sources load under Node type stripping', () => {
  const state: TaskState = 'todo';
  assert.equal(state, 'todo');
});
