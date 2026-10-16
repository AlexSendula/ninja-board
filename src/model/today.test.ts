import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RowVM } from './types.ts';
import { loadSample } from '../../test/sample.ts';
import { buildSnapshot } from './snapshot.ts';
import { META_BREAK } from './rows.ts';
import { buildToday } from './today.ts';

const TODAY = '2026-10-13';

// [title, meta], with the tone after the text when there is one.
const shown = (rows: RowVM[]) => rows.map((r) => [r.title, r.meta.map((p) => (p.tone ? `${p.text} (${p.tone})` : p.text))]);

test('buildToday: the sample Tuesday', () => {
  const vm = buildToday(loadSample(), TODAY);
  assert.equal(vm.label, 'TUESDAY');
  assert.equal(vm.title, '13 October');
  assert.deepEqual(shown(vm.now), [
    ['Build the homepage header', ['Website for Sam']],
    ['Compare prices and bandwidth', ["Choose hosting for Sam's site", 'Planned Wed']],
  ]);
  assert.deepEqual(shown(vm.today), [
    ['Book a physio session', ['Health', '3 days overdue (overdue)']],
    ['Fix the hallway light switch', ['Home', 'Due today']],
  ]);
  assert.deepEqual([...vm.now, ...vm.today].map((r) => r.ariaLabel), [
    'Build the homepage header, in progress',
    'Compare prices and bandwidth, in progress',
    'Book a physio session, 3 days overdue',
    'Fix the hallway light switch',
  ]);
  assert.equal(vm.left, 4);
  assert.equal(vm.doneToday, 0);
  assert.deepEqual(vm.doneRows, []);
  assert.deepEqual(vm.schedule.map((e) => [e.title, e.start, e.end, e.where]), [['Dance class', '20:15', '22:15', 'Studio Tempo']]);
});

test('buildToday: a deadline today stays in the meta, a plan for today goes', () => {
  const s = buildSnapshot([{
    path: 'Home/Home.md',
    frontmatter: { type: 'area' },
    lines: ['- [ ] Renew passport [scheduled:: 2026-10-13] [due:: 2026-10-13]'],
  }]);
  const vm = buildToday(s, TODAY);
  assert.deepEqual(shown(vm.today), [['Renew passport', ['Home', 'Due today']]]);
  assert.deepEqual(vm.today[0]?.meta[1], { text: 'Due today', when: 'due' });
});

test('buildToday: an empty vault has zeros, no NaN', () => {
  assert.deepEqual(buildToday({ notes: [] }, TODAY), {
    label: 'TUESDAY', title: '13 October', left: 0, doneToday: 0, now: [], today: [], schedule: [], doneRows: [],
  });
});

test('buildToday: overdue first, oldest due first; the rest keep file order; pointers stay out', () => {
  const s = buildSnapshot([{
    path: 'Home/Home.md',
    frontmatter: { type: 'area' },
    lines: [
      '- [ ] Due today [due:: 2026-10-13]',
      '- [ ] Two days late [due:: 2026-10-11]',
      '- [w] Chase today [scheduled:: 2026-10-13]',
      '- [ ] [[Paint the fence]] [due:: 2026-10-10]',
      '- [ ] Five days late [due:: 2026-10-08]',
    ],
  }]);
  const vm = buildToday(s, TODAY);
  assert.deepEqual(shown(vm.today), [
    ['Five days late', ['Home', '5 days overdue (overdue)']],
    ['Two days late', ['Home', '2 days overdue (overdue)']],
    ['Due today', ['Home', 'Due today']],
    ['Chase today', ['Home']],
  ]);
  assert.equal(vm.left, 4);
});

test('buildToday: task notes due or planned, repeating ones too; resting notes stay out', () => {
  const s = buildSnapshot([
    { path: 'Health/Health.md', frontmatter: { type: 'area' }, lines: [] },
    { path: 'Health/Dentist checkup.md', frontmatter: { type: 'task', status: 'open', area: '[[Health]]', due: '2026-10-13', repeat: 'every 6 months' }, lines: [] },
    { path: 'Health/Stretch.md', frontmatter: { type: 'task', status: 'open', area: '[[Health]]', scheduled: '2026-10-13', repeat: 'every tue' }, lines: [] },
    { path: 'Health/Renew insurance.md', frontmatter: { type: 'task', status: 'open', area: '[[Health]]', scheduled: '2026-10-12' }, lines: [] },
    { path: 'Health/Someday.md', frontmatter: { type: 'task', status: 'someday', due: '2026-10-01' }, lines: ['- [ ] Old idea [due:: 2026-10-01]'] },
    { path: 'Spanish/Spanish.md', frontmatter: { type: 'project', status: 'paused' }, lines: ['- [ ] Finish unit 4 [due:: 2026-10-01]'] },
    { path: 'Spanish/Grammar.md', frontmatter: { type: 'task', status: 'open' }, lines: ['- [/] Learn the subjunctive'] },
  ]);
  const vm = buildToday(s, TODAY);
  assert.deepEqual(shown(vm.today), [
    ['Dentist checkup', ['Health', 'Due today', META_BREAK, 'Every 6 months']],
    ['Stretch', ['Health', META_BREAK, 'Every tue']],
    ['Renew insurance', ['Health', 'Planned yesterday']],
  ]);
  // Repeating notes are ticked like any row (a tick completes the occurrence); `repeating` says they repeat.
  assert.deepEqual(vm.today.map((r) => r.repeating), [true, true, false]);
  assert.deepEqual(vm.now, []);
  assert.equal(vm.left, 3);
});

test('buildToday: a line planned on an earlier day stays until it is done or replanned, and its meta names the day', () => {
  const s = buildSnapshot([{
    path: 'Home/Home.md',
    frontmatter: { type: 'area' },
    lines: [
      '- [ ] Pay the water bill [scheduled:: 2026-10-12]',
      '- [ ] Renew the car tax [scheduled:: 2026-10-09]',
      '- [x] Fix the gate [scheduled:: 2026-10-12] [completion:: 2026-10-13]',
      '- [ ] Move the sofa [scheduled:: 2026-10-20]',
    ],
  }]);
  const vm = buildToday(s, TODAY);
  // Yesterday is named as such; older days by their date, as the views word past plans.
  assert.deepEqual(shown(vm.today), [
    ['Pay the water bill', ['Home', 'Planned yesterday']],
    ['Renew the car tax', ['Home', 'Planned 9 Oct']],
  ]);
  assert.deepEqual(shown(vm.doneRows), [['Fix the gate', ['Home']]]);
  assert.equal(vm.left, 2);
});

test('buildToday: a waiting task note is due by its chase date', () => {
  const s = buildSnapshot([
    { path: 'Home/Home.md', frontmatter: { type: 'area' }, lines: [] },
    { path: 'Home/Hear back.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Bram]]', chase: '2026-10-13' }, lines: [] },
    { path: 'Home/Later.md', frontmatter: { type: 'task', status: 'waiting', waiting_on: '[[Mia]]', chase: '2026-10-14' }, lines: [] },
    { path: 'Home/Overdue.md', frontmatter: { type: 'task', status: 'waiting', chase: '2026-10-10' }, lines: [] },
  ]);
  const vm = buildToday(s, TODAY);
  assert.deepEqual(shown(vm.today), [
    ['Hear back', ['Home']],
    ['Overdue', ['Home', 'Chase 10 Oct (late)']],
  ]);
  assert.equal(vm.left, 2);
});

test('buildToday: a task note in progress is in Now, dated or not; a repeating one is not', () => {
  const s = buildSnapshot([
    { path: 'Home/Home.md', frontmatter: { type: 'area' }, lines: ['- [/] Sand the door [scheduled:: 2026-10-15]'] },
    { path: 'Home/Paint the fence.md', frontmatter: { type: 'task', status: 'doing', area: '[[Home]]' }, lines: [] },
    { path: 'Home/Tidy the shed.md', frontmatter: { type: 'task', status: 'doing', due: '2026-10-14' }, lines: [] },
    { path: 'Home/Water plants.md', frontmatter: { type: 'task', status: 'doing', repeat: 'every mon', due: '2026-10-20' }, lines: [] },
    { path: 'Home/Rest.md', frontmatter: { type: 'task', status: 'someday' }, lines: ['- [/] Hidden'] },
    // A story with a doing line of its own is in Now through that line.
    { path: 'Home/Fix the door.md', frontmatter: { type: 'task', status: 'doing' }, lines: ['- [/] Plane the edge [due:: 2026-10-14]'] },
  ]);
  const vm = buildToday(s, TODAY);
  assert.deepEqual(shown(vm.now), [
    ['Plane the edge', ['Fix the door', 'Due Wed']],
    ['Tidy the shed', ['Home', 'Due Wed']],
    ['Sand the door', ['Home', 'Planned Thu']],
    ['Paint the fence', ['Home']],
  ]);
  assert.deepEqual(vm.now.map((r) => [r.state, r.target.kind, r.draggable]), [
    ['doing', 'line', false], ['doing', 'note', false], ['doing', 'line', false], ['doing', 'note', false],
  ]);
  assert.deepEqual(vm.today, []);
  assert.equal(vm.left, 4);
});

test('buildToday: lines completed today and notes done today go to doneRows', () => {
  const s = buildSnapshot([
    {
      path: 'Home/Home.md',
      frontmatter: { type: 'area' },
      lines: [
        '- [x] Fix the hallway light switch [due:: 2026-10-13] [completion:: 2026-10-13]',
        '- [x] Replace the smoke alarm battery [completion:: 2026-10-12]',
      ],
    },
    { path: 'Home/Paint the fence.md', frontmatter: { type: 'task', status: 'done', area: '[[Home]]', done: '2026-10-13' }, lines: [] },
  ]);
  const vm = buildToday(s, TODAY);
  assert.deepEqual(shown(vm.doneRows), [
    ['Fix the hallway light switch', ['Home']],
    ['Paint the fence', ['Home']],
  ]);
  assert.equal(vm.doneToday, 2);
  assert.equal(vm.left, 0);
  assert.deepEqual(vm.today, []);
});
