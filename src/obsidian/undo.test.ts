// Undo puts back what Brain wrote, only where the note or the view is still as Brain left it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { notices, stringifyYaml } from '../../test/obsidian-stub.ts';
import { fieldWrites, history, restore, undoLast, type LayoutConfig, type Write } from './undo.ts';

interface Note { body: string; fm?: Record<string, unknown> }

/** A vault of notes: the body, and a frontmatter when the note has one. Reads give the note as a file holds it. */
function vault(notes: Record<string, Note>) {
  const text = (path: string): string => {
    const n = notes[path];
    if (!n) return '';
    return n.fm === undefined ? n.body : `---\n${stringifyYaml(n.fm)}---\n${n.body}`;
  };
  const app = {
    vault: {
      getFileByPath: (path: string) => (path in notes ? { path } : null),
      read: async (file: { path: string }) => text(file.path),
      process: async (file: { path: string }, fn: (data: string) => string) => {
        notes[file.path]!.body = fn(notes[file.path]!.body);
      },
    },
    fileManager: {
      processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
        fn((notes[file.path]!.fm ??= {}));
      },
    },
  };
  return app as unknown as App;
}

/** A Bases config that holds what it is given, as the view's config does. */
function config(values: Record<string, unknown> = {}): LayoutConfig & { values: Record<string, unknown> } {
  return {
    values,
    get: (key) => values[key],
    set: (key, value) => {
      values[key] = value;
    },
  };
}

const line = (path: string, n: number, before: string, after: string): Write => ({ kind: 'line', path, line: n, before, after });

test('a line is put back when it is still as Brain left it', async () => {
  const notes = { 'a.md': { body: '- [x] Pay the window cleaner\n- [ ] Other\n' } };
  const ok = await restore(vault(notes), [line('a.md', 0, '- [ ] Pay the window cleaner', '- [x] Pay the window cleaner')]);
  assert.equal(ok, true);
  assert.equal(notes['a.md'].body, '- [ ] Pay the window cleaner\n- [ ] Other\n');
});

test('a line changed since is left alone, and the step is not put back', async () => {
  const notes = { 'a.md': { body: '- [x] Pay the window cleaner, edited\n' } };
  const ok = await restore(vault(notes), [line('a.md', 0, '- [ ] Pay the window cleaner', '- [x] Pay the window cleaner')]);
  assert.equal(ok, false);
  assert.equal(notes['a.md'].body, '- [x] Pay the window cleaner, edited\n');
});

test('a frontmatter field is put back, and a field Brain added is removed', async () => {
  const notes = { 'Task.md': { body: '', fm: { status: 'done', done: '2026-10-14' } as Record<string, unknown> } };
  const ok = await restore(vault(notes), [
    { kind: 'field', path: 'Task.md', key: 'status', before: 'open', after: 'done' },
    { kind: 'field', path: 'Task.md', key: 'done', before: undefined, after: '2026-10-14' },
  ]);
  assert.equal(ok, true);
  assert.deepEqual(notes['Task.md'].fm, { status: 'open' });
});

test('a field changed since is not put back, and the rest of the step waits with it', async () => {
  const notes = { 'Task.md': { body: '', fm: { status: 'dropped', done: '2026-10-14' } as Record<string, unknown> } };
  const ok = await restore(vault(notes), [
    { kind: 'field', path: 'Task.md', key: 'status', before: 'open', after: 'done' },
    { kind: 'field', path: 'Task.md', key: 'done', before: undefined, after: '2026-10-14' },
  ]);
  assert.equal(ok, false);
  assert.deepEqual(notes['Task.md'].fm, { status: 'dropped', done: '2026-10-14' });
});

test('a step over two notes is all or nothing: when one of them has changed, neither is put back', async () => {
  const notes = {
    'a.md': { body: '- [x] A\n' },
    'b.md': { body: '', fm: { status: 'waiting' } as Record<string, unknown> },
  };
  const ok = await restore(vault(notes), [
    line('a.md', 0, '- [ ] A', '- [x] A'),
    { kind: 'field', path: 'b.md', key: 'status', before: 'open', after: 'done' },
  ]);
  assert.equal(ok, false);
  assert.equal(notes['a.md'].body, '- [x] A\n');
  assert.deepEqual(notes['b.md'].fm, { status: 'waiting' });
});

test('a note that is gone is not put back', async () => {
  const ok = await restore(vault({}), [line('gone.md', 0, '- [ ] A', '- [x] A')]);
  assert.equal(ok, false);
});

test('a saved layout is put back while the view still holds what Brain saved; an absent one comes back as null', async () => {
  const view = config({ arrange: { todo: ['Home › Clean the gutters'] } });
  const ok = await restore(vault({}), [{ kind: 'layout', config: view, key: 'arrange', before: undefined, after: { todo: ['Home › Clean the gutters'] } }]);
  assert.equal(ok, true);
  assert.equal(view.values.arrange, null);
});

test('a saved layout changed since is not put back', async () => {
  const view = config({ schedule: 'compact' });
  const ok = await restore(vault({}), [{ kind: 'layout', config: view, key: 'schedule', before: 'large', after: 'large' }]);
  assert.equal(ok, false);
  assert.equal(view.values.schedule, 'compact');
});

test('a write Undo cannot put back (a recurring tick, two lines for one) makes the step not undone', async () => {
  const notes = { 'Water.md': { body: '- [ ] Water\n' } };
  assert.equal(await restore(vault(notes), [{ kind: 'lost', path: 'Water.md' }]), false);
});

test('fieldWrites lists the keys that changed, with what they were and are; a key that is removed has no after', () => {
  const writes = fieldWrites('n.md', { a: 1, b: 2, d: 'x' }, { a: 1, b: 3, c: 4 });
  assert.deepEqual(writes, [
    { kind: 'field', path: 'n.md', key: 'b', before: 2, after: 3 },
    { kind: 'field', path: 'n.md', key: 'd', before: 'x', after: undefined },
    { kind: 'field', path: 'n.md', key: 'c', before: undefined, after: 4 },
  ]);
});

test('undoLast undoes the newest step of the shared history, and says so when it cannot', async () => {
  history.clear();
  const notes = { 'a.md': { body: '- [x] A\n' } };
  await history.act('untick “A”', async (writes) => {
    writes.push(line('a.md', 0, '- [ ] A', '- [x] A'));
  });
  notices.length = 0;
  await undoLast(vault(notes));
  assert.equal(notes['a.md'].body, '- [ ] A\n');
  assert.equal(history.label(), undefined);
  await history.act('tick “A”', async (writes) => {
    writes.push(line('a.md', 0, '- [x] A', '- [ ] A'));
  });
  notes['a.md'].body = '- [ ] A, changed\n';
  await undoLast(vault(notes));
  assert.deepEqual(notices, ['Changed since: not undone']);
  assert.equal(history.label(), undefined, 'the step leaves the history either way');
  assert.equal(notes['a.md'].body, '- [ ] A, changed\n');
});
