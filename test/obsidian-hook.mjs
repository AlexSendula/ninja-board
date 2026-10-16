// Loaded first by the test script (`node --import ./test/obsidian-hook.mjs --test ...`): it resolves
// Obsidian's 'obsidian' module to test/obsidian-stub.ts. Obsidian ships that package as types only.
import { registerHooks } from 'node:module';

const STUB = new URL('./obsidian-stub.ts', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'obsidian' ? { url: STUB, shortCircuit: true } : nextResolve(specifier, context);
  },
});
