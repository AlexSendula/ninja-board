import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// A failing assert.equal or deepEqual on a linkedom node makes Node build a huge diff of the node and its document, and the run
// hangs instead of failing. The UI tests compare nodes with absent() and same() from test/ui.ts, or compare strings and counts.
// The check is a line-level heuristic: a DOM lookup passed to the assertion as it is (`querySelector(...)`, `.parentNode`, `line()`).
// A lookup read through a string accessor (`?.outerHTML`, `?.className`, `.length`) is a string, and passes.
const ASSERT = /assert\.(?:equal|notEqual|deepEqual|notDeepEqual|strictEqual|notStrictEqual|deepStrictEqual|notDeepStrictEqual)\(/;
const NODE_ARG = /(?:querySelector\([^()]*\)|closest\([^()]*\)|\.parentNode|\.parentElement|activeElement|\bline\(\))(?=\s*,|\s*\)\s*;)/;

test('no assertion compares a DOM node with assert.equal or deepEqual', () => {
  const dirs = [new URL('../src/ui/', import.meta.url), new URL('./', import.meta.url)];
  const risky: string[] = [];
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.ts'))) {
      readFileSync(new URL(file, dir), 'utf8').split('\n').forEach((line, i) => {
        if (ASSERT.test(line) && NODE_ARG.test(line)) risky.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(risky, []);
});
