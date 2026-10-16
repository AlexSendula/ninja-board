// Still open this week: the carried-over items that are todo or doing, lines and task notes alike. Waiting, done and
// dropped items are left out; a waiting item is planned by its chase date instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from './week.ts';
import { buildSnapshot } from './snapshot.ts';
import { loadSample } from '../../test/sample.ts';
import type { UpcomingWeekVM, VaultSnapshot } from './types.ts';

const TODAY = '2026-10-13';   // Tuesday, ISO week 42: Still open is what this week carries
const sample = loadSample();

function upcoming(s: VaultSnapshot, start: string): UpcomingWeekVM {
  const w = buildWeek(s, TODAY, { start });
  assert.ok(w.kind === 'upcoming', 'expected an upcoming week');
  return w;
}

test('Still open lists a carried-over doing line and a carried-over doing story, as it lists todo ones', () => {
  const open = upcoming(sample, '2026-10-19').toPlan.open.map((r) => r.title);
  assert.equal(open.includes('Build the homepage header'), true);   // a doing line of Website for Sam, scheduled Mon 13
  assert.equal(open.includes("Choose hosting for Sam's site"), true);   // a doing story, carried by its open line on Wed 14
  assert.equal(open.includes('Get photos from Sam'), false);   // waiting: its chase date plans it
  assert.equal(open.includes('Choose a contractor'), false);   // waiting story
});

test('Still open: todo and doing items in, waiting, done and dropped ones out, for lines and task notes alike', () => {
  const s = buildSnapshot([
    { path: '04 Areas/Home/Home.md', frontmatter: { type: 'area' }, lines: [
      '- [/] Sand the bench [due:: 2026-10-15]',
      '- [ ] Paint the door [due:: 2026-10-15]',
      '- [w] Ring the council [due:: 2026-10-15]',
      '- [x] Sweep the porch [due:: 2026-10-15]',
      '- [-] Drop the fence [due:: 2026-10-15]',
    ] },
    { path: '03 Projects/Kept one/Kept one.md', frontmatter: { type: 'project', status: 'active' }, lines: [] },
    { path: '03 Projects/Kept one/Story doing.md', frontmatter: { type: 'task', status: 'doing', due: '2026-10-15' }, lines: [] },
    { path: '03 Projects/Kept one/Story waiting.md', frontmatter: { type: 'task', status: 'waiting', due: '2026-10-15' }, lines: [] },
    { path: '03 Projects/Kept one/Story done.md', frontmatter: { type: 'task', status: 'done', due: '2026-10-15' }, lines: [] },
  ]);
  const titles = upcoming(s, '2026-10-19').toPlan.open.map((r) => r.title).sort();
  assert.deepEqual(titles, ['Paint the door', 'Sand the bench', 'Story doing']);
});
