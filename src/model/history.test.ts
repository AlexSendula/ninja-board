// The undo history, with no Obsidian in it: steps are what one user action wrote, undo pops the newest, and everything
// runs in the order it was made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from './history.ts';

type W = { n: number };

/** A restore that puts writes back when `ok` says so, and records what it was given. */
function restorer(ok: (writes: readonly W[]) => boolean = () => true) {
  const seen: number[][] = [];
  return {
    seen,
    restore: async (writes: readonly W[]) => {
      seen.push(writes.map((w) => w.n));
      return ok(writes);
    },
  };
}

test('an empty history has nothing to undo', async () => {
  const h = new History<W>();
  assert.equal(h.label(), undefined);
  const r = restorer();
  assert.equal(await h.undo(r.restore), 'none');
  assert.deepEqual(r.seen, []);
});

test('an action that writes is one step, labelled; an action that writes nothing is no step', async () => {
  const h = new History<W>();
  await h.act('tick “A”', async (writes) => { writes.push({ n: 1 }); });
  await h.act('nothing', async () => {});
  assert.equal(h.label(), 'tick “A”');
});

test('a label can be worked out from what was written', async () => {
  const h = new History<W>();
  await h.act((writes) => `wrote ${writes.length}`, async (writes) => { writes.push({ n: 1 }, { n: 2 }); });
  assert.equal(h.label(), 'wrote 2');
});

test('each undo pops the newest step and gives its writes to restore; a skipped step leaves the history too', async () => {
  const h = new History<W>();
  await h.act('first', async (w) => { w.push({ n: 1 }); });
  await h.act('second', async (w) => { w.push({ n: 2 }); });
  const r = restorer((writes) => writes[0]?.n !== 2);   // the newest has changed since
  assert.equal(await h.undo(r.restore), 'changed');
  assert.equal(h.label(), 'first', 'a skipped press does not go on to the step before it');
  assert.equal(await h.undo(r.restore), 'undone');
  assert.equal(h.label(), undefined);
  assert.deepEqual(r.seen, [[2], [1]]);
});

test('a group makes its synchronous acts one step', async () => {
  const h = new History<W>();
  h.group('move back', () => {
    void h.act('ignored', async (w) => { w.push({ n: 1 }); });
    void h.act('ignored', async (w) => { w.push({ n: 2 }); });
  });
  await h.act('after', async (w) => { w.push({ n: 3 }); });
  const r = restorer();
  assert.equal(await h.undo(r.restore), 'undone');
  assert.deepEqual(r.seen, [[3]]);
  assert.equal(await h.undo(r.restore), 'undone');
  assert.deepEqual(r.seen, [[3], [1, 2]]);
});

test('a group keeps its acts together while it awaits them, as a dialogue of several writes does', async () => {
  const h = new History<W>();
  await h.group('restore the dates of “A”', async () => {
    await h.act('x', async (w) => { w.push({ n: 1 }); });
    await h.act('x', async (w) => { w.push({ n: 2 }); });
  });
  await h.act('next', async (w) => { w.push({ n: 3 }); });
  const r = restorer();
  await h.undo(r.restore);
  await h.undo(r.restore);
  assert.deepEqual(r.seen, [[3], [1, 2]]);
});

test('a record() made at once joins the open group, or is a step of its own', async () => {
  const h = new History<W>();
  h.group('move “B” back', () => {
    h.record('ignored', { n: 1 });
    void h.act('ignored', async (w) => { w.push({ n: 2 }); });
  });
  h.record('move back', { n: 3 });
  const r = restorer();
  await h.undo(r.restore);
  await h.undo(r.restore);
  assert.deepEqual(r.seen, [[3], [1, 2]]);
  assert.equal(h.label(), undefined);
});

test('a group that writes nothing is no step', async () => {
  const h = new History<W>();
  await h.group('nothing', () => {
    void h.act('x', async () => {});
  });
  assert.equal(h.label(), undefined);
});

test('writes and undos run in the order they were made, so an undo waits for the write before it', async () => {
  const h = new History<W>();
  void h.act('slow', async (w) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    w.push({ n: 1 });
  });
  const r = restorer();
  assert.equal(await h.undo(r.restore), 'undone');
  assert.deepEqual(r.seen, [[1]]);
});

test('a step is recorded with what was written before a failure, and the failure reaches the caller', async () => {
  const h = new History<W>();
  await assert.rejects(h.act('broken', async (w) => {
    w.push({ n: 1 });
    throw new Error('vault refused');
  }), /vault refused/);
  assert.equal(h.label(), 'broken');
});

test('a restore that throws counts as changed, and the queue carries on', async () => {
  const h = new History<W>();
  await h.act('x', async (w) => { w.push({ n: 1 }); });
  await h.act('y', async (w) => { w.push({ n: 2 }); });
  assert.equal(await h.undo(async () => { throw new Error('gone'); }), 'changed');
  assert.equal(await h.undo(async () => true), 'undone');
});

test('listeners hear each recorded step and each undo, until they unsubscribe', async () => {
  const h = new History<W>();
  let heard = 0;
  const stop = h.subscribe(() => { heard++; });
  await h.act('x', async (w) => { w.push({ n: 1 }); });
  assert.ok(heard >= 1);
  stop();
  const before = heard;
  await h.undo(async () => true);
  assert.equal(heard, before);
});

test('clear() empties the history', async () => {
  const h = new History<W>();
  await h.act('x', async (w) => { w.push({ n: 1 }); });
  h.clear();
  assert.equal(h.label(), undefined);
});
