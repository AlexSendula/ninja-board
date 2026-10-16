import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskLine, TaskState } from './types.ts';
import { displayText, parseTaskLine, stateOf, symbolOf, withField, withSymbol } from './taskLine.ts';

const PATH = '03 Projects/Website for Sam/Website for Sam.md';
const LINE = 4;

/** Asserts that `raw` parses to a plain todo line at PATH:LINE, with `fields` overriding. */
function check(raw: string, fields: Partial<TaskLine>): void {
  const base: TaskLine = { path: PATH, line: LINE, raw, symbol: ' ', state: 'todo', text: '', links: [], isPointer: false };
  assert.deepEqual(parseTaskLine(raw, PATH, LINE), { ...base, ...fields });
}

// Every task line of the sample data, in the Tasks plugin's Dataview format.
const SAMPLE: [string, Partial<TaskLine>][] = [
  // Website for Sam
  ['- [x] Pick design B with Sam [completion:: 2026-10-12]', { symbol: 'x', state: 'done', text: 'Pick design B with Sam', completion: '2026-10-12' }],
  ['- [/] Build the homepage header [scheduled:: 2026-10-13]', { symbol: '/', state: 'doing', text: 'Build the homepage header', scheduled: '2026-10-13' }],
  ['- [ ] Send Sam the hosting options [due:: 2026-10-17]', { text: 'Send Sam the hosting options', due: '2026-10-17' }],
  ['- [w] Get photos from [[Sam Rivers|Sam]] [scheduled:: 2026-10-20]', { symbol: 'w', state: 'waiting', text: 'Get photos from [[Sam Rivers|Sam]]', links: ['Sam Rivers'], scheduled: '2026-10-20' }],
  ['- [ ] Write the About page text', { text: 'Write the About page text' }],
  ["- [ ] [[Choose hosting for Sam's site]]", { text: "[[Choose hosting for Sam's site]]", links: ["Choose hosting for Sam's site"], isPointer: true }],
  // Renovate the kitchen, Learn Spanish, Plan summer vacation
  ['- [ ] Measure the kitchen walls', { text: 'Measure the kitchen walls' }],
  ['- [ ] Finish unit 4 of the course', { text: 'Finish unit 4 of the course' }],
  ['- [ ] Pick a destination', { text: 'Pick a destination' }],
  ['- [ ] Check passport expiry dates', { text: 'Check passport expiry dates' }],
  // Stories
  ['- [x] List three hosting options [completion:: 2026-10-11]', { symbol: 'x', state: 'done', text: 'List three hosting options', completion: '2026-10-11' }],
  ['- [/] Compare prices and bandwidth [scheduled:: 2026-10-14]', { symbol: '/', state: 'doing', text: 'Compare prices and bandwidth', scheduled: '2026-10-14' }],
  ['- [ ] Ask Sam about the custom domain', { text: 'Ask Sam about the custom domain' }],
  ['- [x] Get three quotes [completion:: 2026-10-09]', { symbol: 'x', state: 'done', text: 'Get three quotes', completion: '2026-10-09' }],
  ['- [w] Get the written quote from [[Bram Ellery|Bram]] [scheduled:: 2026-10-15]', { symbol: 'w', state: 'waiting', text: 'Get the written quote from [[Bram Ellery|Bram]]', links: ['Bram Ellery'], scheduled: '2026-10-15' }],
  ['- [ ] Check references for the shortlisted contractor', { text: 'Check references for the shortlisted contractor' }],
  ['- [ ] Re-measure the corner under the sink', { text: 'Re-measure the corner under the sink' }],
  ['- [ ] Pick the cabinet colour and handles', { text: 'Pick the cabinet colour and handles' }],
  // Areas
  ['- [ ] Book a physio session [due:: 2026-10-10]', { text: 'Book a physio session', due: '2026-10-10' }],
  ['- [ ] Order new running shoes', { text: 'Order new running shoes' }],
  ['- [ ] Fix the hallway light switch [due:: 2026-10-13]', { text: 'Fix the hallway light switch', due: '2026-10-13' }],
  ['- [ ] Clean the gutters [scheduled:: 2026-10-15]', { text: 'Clean the gutters', scheduled: '2026-10-15' }],
  ['- [x] Replace the smoke alarm battery [completion:: 2026-10-12]', { symbol: 'x', state: 'done', text: 'Replace the smoke alarm battery', completion: '2026-10-12' }],
  ['- [ ] Compare energy contracts [scheduled:: 2026-10-18]', { text: 'Compare energy contracts', scheduled: '2026-10-18' }],
  ['- [ ] Buy a gift for Sam [due:: 2026-10-25]', { text: 'Buy a gift for Sam', due: '2026-10-25' }],
];

test('parses every task line of the sample data', () => {
  for (const [raw, fields] of SAMPLE) check(raw, fields);
});

test('parses the example lines of the design spec', () => {
  check('- [-] Try a page builder [cancelled:: 2026-10-11]', { symbol: '-', state: 'dropped', text: 'Try a page builder', cancelled: '2026-10-11' });
  check('- [w] Get photos from [[Sam Rivers]] [scheduled:: 2026-10-20]', {
    symbol: 'w', state: 'waiting', text: 'Get photos from [[Sam Rivers]]', links: ['Sam Rivers'], scheduled: '2026-10-20',
  });
});

test('a line whose text is exactly one wikilink is a pointer', () => {
  check("- [ ] [[Choose hosting for Sam's site]] [due:: 2026-10-20]", {
    text: "[[Choose hosting for Sam's site]]", links: ["Choose hosting for Sam's site"], isPointer: true, due: '2026-10-20',
  });
  check("- [ ] [[Choose hosting for Sam's site|Hosting]]", {
    text: "[[Choose hosting for Sam's site|Hosting]]", links: ["Choose hosting for Sam's site"], isPointer: true,
  });
  check('- [ ] Ask [[Sam Rivers]] about the custom domain', {
    text: 'Ask [[Sam Rivers]] about the custom domain', links: ['Sam Rivers'],
  });
  check('- [ ] [[Order cabinets]] [[Choose a contractor]]', {
    text: '[[Order cabinets]] [[Choose a contractor]]', links: ['Order cabinets', 'Choose a contractor'],
  });
});

test('links give their targets, without alias or heading, in order', () => {
  check('- [ ] Introduce [[Sam Rivers|Sam]] to [[Bram#Contact]]', {
    text: 'Introduce [[Sam Rivers|Sam]] to [[Bram#Contact]]', links: ['Sam Rivers', 'Bram'],
  });
});

test('reads (key:: value) fields and fields anywhere in the text', () => {
  check('- [ ] Send Sam [due:: 2026-10-17] the hosting options', { text: 'Send Sam the hosting options', due: '2026-10-17' });
  check('- [/] Compare prices and bandwidth (scheduled:: 2026-10-14)', {
    symbol: '/', state: 'doing', text: 'Compare prices and bandwidth', scheduled: '2026-10-14',
  });
  check('- [ ] [due::2026-10-17] Send Sam the hosting options  (scheduled:: 2026-10-14)', {
    text: 'Send Sam the hosting options', due: '2026-10-17', scheduled: '2026-10-14',
  });
});

test('keeps other Dataview fields in the text', () => {
  check('- [ ] Write the About page text [priority:: high]', { text: 'Write the About page text [priority:: high]' });
});

test('ignores an invalid date but still removes its field from the text', () => {
  check('- [ ] Book a physio session [due:: 2026-13-40]', { text: 'Book a physio session' });
  check('- [ ] Clean the gutters [due:: someday] [scheduled:: 2026-10-15]', { text: 'Clean the gutters', scheduled: '2026-10-15' });
});

test('an unknown checkbox symbol counts as todo', () => {
  check('- [?] Ask Sam about the custom domain', { symbol: '?', state: 'todo', text: 'Ask Sam about the custom domain' });
  check('- [>] Pick a destination', { symbol: '>', state: 'todo', text: 'Pick a destination' });
});

test('a checkbox with no text gives empty text', () => {
  check('- [ ]', {});
  check('- [ ] ', {});
  check('- [x] [completion:: 2026-10-12]', { symbol: 'x', state: 'done', completion: '2026-10-12' });
});

test('accepts indentation and the * and + list markers', () => {
  check('\t* [/] Build the homepage header', { symbol: '/', state: 'doing', text: 'Build the homepage header' });
  check('    + [X] Get three quotes', { symbol: 'X', state: 'done', text: 'Get three quotes' });
});

test('a line that is not a task gives null', () => {
  for (const raw of ['', '## Tasks', 'Plain prose about the kitchen', '- Measure the kitchen walls',
    '- [ ]Measure the kitchen walls', '-[ ] Measure the kitchen walls', '- [xx] Measure the kitchen walls']) {
    assert.equal(parseTaskLine(raw, PATH, LINE), null, raw);
  }
});

test('stateOf maps each symbol, anything else is todo', () => {
  const cases: [string, TaskState][] = [
    [' ', 'todo'], ['/', 'doing'], ['w', 'waiting'], ['x', 'done'], ['X', 'done'], ['-', 'dropped'],
    ['?', 'todo'], ['W', 'todo'], ['', 'todo'],
  ];
  for (const [symbol, state] of cases) assert.equal(stateOf(symbol), state, JSON.stringify(symbol));
});

test('symbolOf is the inverse of stateOf', () => {
  assert.equal(symbolOf('todo'), ' ');
  assert.equal(symbolOf('doing'), '/');
  assert.equal(symbolOf('waiting'), 'w');
  assert.equal(symbolOf('done'), 'x');
  assert.equal(symbolOf('dropped'), '-');
  for (const state of ['todo', 'doing', 'waiting', 'done', 'dropped'] as const) {
    assert.equal(stateOf(symbolOf(state)), state);
  }
});

test('withSymbol replaces only the checkbox character', () => {
  assert.equal(
    withSymbol('- [ ] Send Sam the hosting options [due:: 2026-10-17]', '/'),
    '- [/] Send Sam the hosting options [due:: 2026-10-17]',
  );
  assert.equal(
    withSymbol('- [/] Build the homepage header [scheduled:: 2026-10-13]', 'x'),
    '- [x] Build the homepage header [scheduled:: 2026-10-13]',
  );
  assert.equal(withSymbol('\t- [w] Get photos from Sam', ' '), '\t- [ ] Get photos from Sam');
  assert.equal(withSymbol('- [ ] Tick [ ] the second box', 'x'), '- [x] Tick [ ] the second box');
});

test('withSymbol leaves a line that is not a task unchanged', () => {
  for (const raw of ['- [link](x)', '- [xx] a', '- [ ]a', '- [a-b] range', '## Tasks', '']) {
    assert.equal(withSymbol(raw, 'x'), raw, JSON.stringify(raw));
  }
});

test('withField appends a missing field', () => {
  assert.equal(
    withField('- [x] Pick design B with Sam', 'completion', '2026-10-12'),
    '- [x] Pick design B with Sam [completion:: 2026-10-12]',
  );
  assert.equal(
    withField('- [-] Clean the gutters [scheduled:: 2026-10-15]', 'cancelled', '2026-10-13'),
    '- [-] Clean the gutters [scheduled:: 2026-10-15] [cancelled:: 2026-10-13]',
  );
  assert.equal(
    withField('- [x] Get three quotes ', 'completion', '2026-10-09'),
    '- [x] Get three quotes [completion:: 2026-10-09]',
  );
});

test('withField keeps a block id at the end of the line', () => {
  assert.equal(
    withField('- [-] Try a page builder ^b7k2', 'cancelled', '2026-10-13'),
    '- [-] Try a page builder [cancelled:: 2026-10-13] ^b7k2',
  );
});

test('withField replaces the value of a field that is there', () => {
  assert.equal(
    withField('- [-] Try a page builder [cancelled:: 2026-10-11]', 'cancelled', '2026-10-13'),
    '- [-] Try a page builder [cancelled:: 2026-10-13]',
  );
  assert.equal(
    withField('- [x] Get three quotes (completion:: 2026-10-13) from contractors', 'completion', '2026-10-09'),
    '- [x] Get three quotes (completion:: 2026-10-09) from contractors',
  );
  assert.equal(
    withField('- [x] Get three quotes [completion:: 2026-13-40]', 'completion', '2026-10-09'),
    '- [x] Get three quotes [completion:: 2026-10-09]',
  );
});

test('withField sets the planned day (scheduled), the week plan (start) and the deadline (due) as well', () => {
  assert.equal(
    withField('- [ ] Clean the gutters [scheduled:: 2026-10-15]', 'scheduled', '2026-10-21'),
    '- [ ] Clean the gutters [scheduled:: 2026-10-21]',
  );
  assert.equal(
    withField('- [ ] Send Sam the hosting options [due:: 2026-10-17]', 'scheduled', '2026-10-15'),
    '- [ ] Send Sam the hosting options [due:: 2026-10-17] [scheduled:: 2026-10-15]',
  );
  assert.equal(
    withField('- [ ] Clean the gutters (scheduled:: 2026-10-15) ^b7k2', 'scheduled', '2026-10-21'),
    '- [ ] Clean the gutters (scheduled:: 2026-10-21) ^b7k2',
  );
  assert.equal(withField('- [ ] Clean the gutters', 'start', '2026-10-19'), '- [ ] Clean the gutters [start:: 2026-10-19]');
  assert.equal(
    withField('- [ ] Renew passport (due:: 2026-10-23)', 'due', '2026-10-30'),
    '- [ ] Renew passport (due:: 2026-10-30)',
  );
});

test('parseTaskLine reads [start:: date] as the week plan, outside the text', () => {
  const line = parseTaskLine('- [ ] Back up the photos [start:: 2026-10-12]', PATH, LINE);
  assert.equal(line?.text, 'Back up the photos');
  assert.equal(line?.start, '2026-10-12');
  assert.equal(parseTaskLine('- [ ] Back up the photos (start:: 2026-10-12)', PATH, LINE)?.start, '2026-10-12');
});

test('displayText shows a wikilink as its alias or its target', () => {
  assert.equal(displayText("[[Choose hosting for Sam's site]]"), "Choose hosting for Sam's site");
  assert.equal(displayText('Get photos from [[Sam Rivers|Sam]]'), 'Get photos from Sam');
  assert.equal(displayText('Get photos from [[Sam Rivers]]'), 'Get photos from Sam Rivers');
  assert.equal(displayText('Read [[Kitchen plan#Budget]] first'), 'Read Kitchen plan first');
  assert.equal(displayText('Read [[Kitchen plan#Budget|the budget]] first'), 'Read the budget first');
});

test('displayText drops tags and collapses spaces', () => {
  assert.equal(displayText('Clean the gutters #from-break'), 'Clean the gutters');
  assert.equal(displayText('#from-break Clean the gutters #home_jobs'), 'Clean the gutters');
  assert.equal(displayText('Sort the #area/home boxes'), 'Sort the boxes');
  assert.equal(displayText('  Buy   a gift\tfor Sam  '), 'Buy a gift for Sam');
  const line = parseTaskLine('- [ ] Clean the gutters #from-break [scheduled:: 2026-10-15]', PATH, LINE);
  assert.equal(line?.text, 'Clean the gutters #from-break');
  assert.equal(displayText(line?.text ?? ''), 'Clean the gutters');
});

test('displayText keeps a # that is not a tag', () => {
  assert.equal(displayText('Reply to ticket #4821'), 'Reply to ticket #4821');
  assert.equal(displayText('Learn C# basics'), 'Learn C# basics');
  assert.equal(displayText('Email sam#work about it'), 'Email sam#work about it');
});

test('parseTaskLine reads wikilink targets, before any | or #, in order', () => {
  assert.deepEqual(
    parseTaskLine('- [ ] See [[Note#Heading|alias]], [[Sam Rivers]] and [[a|b|c]]', PATH, LINE)?.links,
    ['Note', 'Sam Rivers', 'a'],
  );
  assert.deepEqual(parseTaskLine('- [ ] Nothing to link to [[]] here', PATH, LINE)?.links, []);
});

test('parseTaskLine parses a line with many unclosed wikilink openers in linear time', () => {
  // The link pattern used to back off through every start, so this took seconds on the UI thread, on every render.
  const raw = `- [ ] ${'[[word '.repeat(400)}`;
  const started = performance.now();
  assert.equal(parseTaskLine(raw, PATH, LINE)?.state, 'todo');
  assert.ok(performance.now() - started < 200, 'parsing a 2.8 KB task line took too long');
});

test('parseTaskLine parses 40 KB of field openers in linear time', () => {
  // A [due:: or (due:: with no close scanned to the end of the line from every opener: hundreds of ms on each render.
  for (const opener of ['[due:: ', '(due:: ']) {
    const raw = `- [ ] ${opener.repeat(Math.floor(40000 / opener.length))}`;
    const started = performance.now();
    assert.equal(parseTaskLine(raw, PATH, LINE)?.due, undefined);
    assert.ok(performance.now() - started < 200, `a 40 KB line of ${opener.trim()} openers took too long`);
  }
});

test('displayText of 40 KB of wikilink openers is linear and changes nothing', () => {
  const text = '[['.repeat(20000);
  const started = performance.now();
  assert.equal(displayText(text), text);
  assert.ok(performance.now() - started < 200, 'displayText of a 40 KB line took too long');
});

test('withField on a 40 KB run of spaces is linear', () => {
  const raw = `- [ ] a${' '.repeat(40000)}x`;
  const started = performance.now();
  assert.equal(withField(raw, 'due', '2026-10-15'), `${raw} [due:: 2026-10-15]`);
  assert.ok(performance.now() - started < 200, 'withField on a 40 KB line took too long');
});

test('withField adds a field after the text, and before a block id, which stays last', () => {
  assert.equal(withField('- [ ] Send Sam the hosting options ^b7k2', 'due', '2026-10-17'), '- [ ] Send Sam the hosting options [due:: 2026-10-17] ^b7k2');
  assert.equal(withField('- [ ] Write the About page text   ', 'due', '2026-10-17'), '- [ ] Write the About page text [due:: 2026-10-17]');
});

test('parseTaskLine reads round-bracket fields, a date among text and tags, and keeps other fields in the text', () => {
  check('- [ ] Pay the bill (due:: 2026-10-17)', { text: 'Pay the bill', due: '2026-10-17' });
  check('- [ ] Call [[Sam|the plumber]] [scheduled:: 2026-10-13] #home', { text: 'Call [[Sam|the plumber]] #home', links: ['Sam'], scheduled: '2026-10-13' });
  check('- [ ] X [due:: 2026-10-17] Y [due:: 2026-11-01]', { text: 'X Y', due: '2026-10-17' });
  check('- [ ] Water the plants [repeat:: every day]', { text: 'Water the plants [repeat:: every day]' });
});

test('parseTaskLine takes a field written as a wikilink date whole, so its text has no stray brackets', () => {
  const line = parseTaskLine('- [ ] Renew passport [due:: [[2026-10-15]]]', PATH, LINE);
  assert.equal(line?.text, 'Renew passport');
  assert.equal(line?.due, undefined);
});
