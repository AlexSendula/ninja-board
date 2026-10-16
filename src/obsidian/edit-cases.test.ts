import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PlanTo, TaskState } from '../model/types.ts';
import { parseTaskLine } from '../model/taskLine.ts';
import { applyNoteDue, applyNotePlan, applyNotePoints, applyNoteStatus, lineWithDue, lineWithPlan, lineWithState } from './edits.ts';
import { applyNoteComplete, withLogEntry, withoutLogEntry } from '../model/repeat.ts';

type LineCase = { name: string; raw: string; expect: string }
  & ({ by: 'tasks'; to: 'done' } | { by?: undefined; to: Exclude<TaskState, 'done'> });
interface NoteCase { name: string; before: Record<string, unknown>; to: string; expect: Record<string, unknown> }
// `today` is the day No date yet reads (a deadline this week or overdue goes with it); a case without one uses the file's.
interface PlanCase { name: string; raw: string; today?: string; to: PlanTo; expect: string }
interface NotePlanCase { name: string; before: Record<string, unknown>; today?: string; to: PlanTo; expect: Record<string, unknown> }
interface DueCase { name: string; raw: string; date: string | null; expect: string }
interface NoteDueCase { name: string; before: Record<string, unknown>; date: string | null; expect: Record<string, unknown> }
interface NotePointsCase { name: string; before: Record<string, unknown>; points: 1 | 2 | 3 | 5 | 8 | null; expect: Record<string, unknown> }
// A repeating note's completion: its frontmatter, and its body (the Log line it writes, or the body as it was when refused).
interface NoteCompleteCase { name: string; before: Record<string, unknown>; today: string; body: string; refused?: true; expect: Record<string, unknown>; expectBody: string }
const cases = JSON.parse(readFileSync(new URL('../../test/edit-cases.json', import.meta.url), 'utf8')) as {
  today: string; lines: LineCase[]; notes: NoteCase[];
  plans: PlanCase[]; notePlans: NotePlanCase[]; dues: DueCase[]; noteDues: NoteDueCase[]; notePoints: NotePointsCase[];
  noteCompletes: NoteCompleteCase[];
};

for (const c of cases.lines) {
  // Brain doesn't compute a line made by the Tasks plugin: Tasks writes it. Brain reads what Tasks wrote,
  // and `brain complete` (the agent's side, tested there) must write the same shape.
  if (c.by === 'tasks') {
    test(`line: ${c.name}`, () => {
      const read = parseTaskLine(c.expect, '', 0);
      assert.equal(read?.state, 'done');
      assert.equal(read?.completion, cases.today);
      assert.equal(read?.due, parseTaskLine(c.raw, '', 0)?.due);
    });
    continue;
  }
  test(`line: ${c.name}`, () => {
    assert.equal(lineWithState(c.raw, c.to, cases.today), c.expect);
  });
}

for (const c of cases.notes) {
  test(`note: ${c.name}`, () => {
    const fm = structuredClone(c.before);
    applyNoteStatus(fm, c.to, cases.today);
    assert.deepEqual(fm, c.expect);
  });
}

// Planning and deadlines: `brain plan` and `brain due` must make these same edits. A plan in a later week than the
// deadline's takes the deadline away; No date yet takes one on or before this week's Sunday.
for (const c of cases.plans) {
  test(`plan: ${c.name}`, () => {
    assert.equal(lineWithPlan(c.raw, c.to, c.today ?? cases.today), c.expect);
  });
}

for (const c of cases.notePlans) {
  test(`note plan: ${c.name}`, () => {
    const fm = structuredClone(c.before);
    applyNotePlan(fm, c.to, c.today ?? cases.today);
    assert.deepEqual(fm, c.expect);
  });
}

for (const c of cases.dues) {
  test(`due: ${c.name}`, () => {
    assert.equal(lineWithDue(c.raw, c.date), c.expect);
  });
}

for (const c of cases.noteDues) {
  test(`note due: ${c.name}`, () => {
    const fm = structuredClone(c.before);
    applyNoteDue(fm, c.date);
    assert.deepEqual(fm, c.expect);
  });
}

// A story's points: `brain points` and Brain's planner card set the same frontmatter.
for (const c of cases.notePoints) {
  test(`note points: ${c.name}`, () => {
    const fm = structuredClone(c.before);
    applyNotePoints(fm, c.points);
    assert.deepEqual(fm, c.expect);
  });
}

// A repeating note's completion: `brain complete` must write the same frontmatter and Log line. Undo puts the body back as it was.
for (const c of cases.noteCompletes) {
  test(`note completes: ${c.name}`, () => {
    const fm = structuredClone(c.before);
    const line = applyNoteComplete(fm, c.today);
    if (c.refused) {
      assert.equal(line, undefined);
      assert.deepEqual(fm, c.expect);
      assert.equal(c.body, c.expectBody);
      return;
    }
    assert.ok(line !== undefined, 'the repeat should parse');
    assert.deepEqual(fm, c.expect);
    const written = withLogEntry(c.body, line);
    assert.equal(written.text, c.expectBody);
    assert.equal(withoutLogEntry(written.text, line, written.made, written.tail), c.body);
  });
}
