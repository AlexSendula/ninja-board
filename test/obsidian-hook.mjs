// Loaded first by the test script (`node --import ./test/obsidian-hook.mjs --test ...`): it resolves
// Obsidian's 'obsidian' module to test/obsidian-stub.ts. Obsidian ships that package as types only.
import { registerHooks } from 'node:module';

const STUB = new URL('./obsidian-stub.ts', import.meta.url).href;

// Obsidian's views time their work with window.setTimeout, so a test runs with Node's timers as its window. The timers are
// looked up when called, so node:test's mock timers still apply.
globalThis.window ??= globalThis;

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'obsidian' ? { url: STUB, shortCircuit: true } : nextResolve(specifier, context);
  },
});
