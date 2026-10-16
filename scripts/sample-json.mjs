// Writes preview/sample.json: the sample vault as RawNote[], read by the same loader the tests use.
// Node 24 strips the types of the .ts files it imports.
import { writeFileSync } from 'node:fs';
import { readSample } from '../test/sample.ts';

const notes = readSample();
writeFileSync(new URL('../preview/sample.json', import.meta.url), JSON.stringify(notes, null, 2) + '\n');
console.log(`preview/sample.json: ${notes.length} notes`);
