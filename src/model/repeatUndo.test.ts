// Undo takes a completion's Log line back exactly (undo design, section 6; implementation spec, rules for repeating task
// notes). A section Brain made comes out only while the note still ends with what Brain appended.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLogEntry, withoutLogEntry } from './repeat.ts';

const e = '- 2026-10-20 Done: the occurrence due 2026-10-16. Next due 2027-04-20.';

// Bodies with and without a final newline, blank, and with CRLF line endings: each comes back exactly.
for (const body of ['## Tasks\n- [ ] Book it', '## Tasks\n- [ ] Book it\n', '\n', '', '  ', '## Tasks\r\n- [ ] Book it', '## Tasks\r\n- [ ] Book it\r\n']) {
  test(`undo gives back exactly ${JSON.stringify(body)}, when Brain made its Log section`, () => {
    const w = withLogEntry(body, e);
    assert.equal(w.made, true);
    assert.equal(withoutLogEntry(w.text, e, w.made, w.tail), body);
  });
}

for (const body of ['## Tasks\n\n## Log\n- 2026-10-01 Done: x.', '## Tasks\r\n\r\n## Log\r\n- 2026-10-01 Done: x.\r\n']) {
  test(`undo gives back exactly ${JSON.stringify(body)}, when its Log section was there`, () => {
    const w = withLogEntry(body, e);
    assert.equal(w.made, false);
    assert.equal(withoutLogEntry(w.text, e, w.made, w.tail), body);
  });
}

test('undo refuses a Log section Brain made once a line has been typed under the entry', () => {
  const w = withLogEntry('## Tasks\n- [ ] Book it\n', e);
  assert.equal(withoutLogEntry(`${w.text}- my own note\n`, e, w.made, w.tail), undefined);
});

test('undo refuses a Log section Brain made once a line has been typed above the entry', () => {
  const w = withLogEntry('## Tasks\n', e);
  assert.equal(withoutLogEntry(w.text.replace(`## Log\n${e}`, `## Log\n- my own note\n${e}`), e, w.made, w.tail), undefined);
});

test('undo refuses a Log section Brain made once the entry has changed', () => {
  const w = withLogEntry('## Tasks\n', e);
  assert.equal(withoutLogEntry(w.text.replace('2027-04-20', '2027-05-01'), e, w.made, w.tail), undefined);
});

test('undo keeps an edit made above a Log section Brain made, and restores the rest', () => {
  const w = withLogEntry('## Tasks\n- [ ] Book it\n', e);
  assert.equal(withoutLogEntry(w.text.replace('Book it', 'Book the flight'), e, w.made, w.tail), '## Tasks\n- [ ] Book the flight\n');
});

test('undo keeps a line typed under the entry in a Log section that was already there', () => {
  const before = '## Log\n- 2026-10-01 Done: x.\n';
  const w = withLogEntry(before, e);
  assert.equal(withoutLogEntry(w.text.replace(`${e}\n`, `${e}\n- my own note\n`), e, w.made, w.tail), '## Log\n- my own note\n- 2026-10-01 Done: x.\n');
});
