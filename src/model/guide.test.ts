import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MetaPart, SetupLineVM, TasksSetup } from './types.ts';
import { buildGuide } from './guide.ts';

// A custom status as Tasks saves it in its data.json.
const WAITING = { symbol: 'w', name: 'Waiting', nextStatusSymbol: 'x', availableAsCommand: true, type: 'ON_HOLD' };
const W_STATUS: MetaPart[] = [{ text: 'w', tone: 'strong' }, { text: ', type ' }, { text: 'ON_HOLD', tone: 'strong' }];

const TASKS_OK: SetupLineVM = { key: 'tasks', state: 'ok', text: [{ text: 'Tasks plugin on' }] };
const FORMAT_OK: SetupLineVM = { key: 'format', state: 'ok', text: [{ text: 'Task Format is Dataview' }] };
const DONE_DATE_OK: SetupLineVM = { key: 'doneDate', state: 'ok', text: [{ text: 'Tasks sets the done date' }] };
const WAITING_OK: SetupLineVM = { key: 'waiting', state: 'ok', text: [{ text: 'Waiting status: symbol ' }, ...W_STATUS] };
const FORMAT_FIX: SetupLineVM = {
  key: 'format', state: 'fix',
  text: [{ text: 'Set Task Format to ' }, { text: 'Dataview', tone: 'strong' }],
  where: 'Tasks settings, Task Format',
};
const DONE_DATE_FIX: SetupLineVM = {
  key: 'doneDate', state: 'fix',
  text: [{ text: 'Turn on Set done date on every completed task' }],
  where: 'Tasks settings',
};
const WAITING_FIX: SetupLineVM = {
  key: 'waiting', state: 'fix',
  text: [{ text: 'Add a Waiting status: symbol ' }, ...W_STATUS],
  where: 'Tasks settings, Task Statuses',
};

/** Each line as "key state". */
const states = (setup: TasksSetup) => buildGuide(setup).setup.map((l) => `${l.key} ${l.state}`);

/** The Set done date line for a saved settings value. */
const doneLine = (settings: unknown) => buildGuide({ on: true, settings }).setup.find((l) => l.key === 'doneDate');

test('buildGuide: Tasks on, the Dataview format, the done date and a w status of type ON_HOLD: four lines OK', () => {
  const setup = { on: true, settings: { taskFormat: 'dataview', setDoneDate: true, statusSettings: { customStatuses: [WAITING] } } };
  assert.deepEqual(buildGuide(setup).setup, [TASKS_OK, FORMAT_OK, DONE_DATE_OK, WAITING_OK]);
});

test("buildGuide: the mockup's case, Dataview and no w status: the Waiting line is to fix", () => {
  const setup = { on: true, settings: { taskFormat: 'dataview', setDoneDate: true, statusSettings: { customStatuses: [] } } };
  assert.deepEqual(buildGuide(setup).setup, [TASKS_OK, FORMAT_OK, DONE_DATE_OK, WAITING_FIX]);
});

test('buildGuide: the emoji format, or none saved, is a format to fix', () => {
  const statusSettings = { customStatuses: [WAITING] };
  assert.deepEqual(buildGuide({ on: true, settings: { taskFormat: 'tasksPluginEmoji', statusSettings } }).setup, [TASKS_OK, FORMAT_FIX, DONE_DATE_OK, WAITING_OK]);
  assert.deepEqual(states({ on: true, settings: { statusSettings } }), ['tasks ok', 'format fix', 'doneDate ok', 'waiting ok']);
});

test('buildGuide: a w status of another type, or ON_HOLD under another symbol, is to fix', () => {
  const custom = (...customStatuses: unknown[]) => ({ on: true, settings: { taskFormat: 'dataview', setDoneDate: true, statusSettings: { customStatuses } } });
  const onlyWaitingFix = ['tasks ok', 'format ok', 'doneDate ok', 'waiting fix'];
  assert.deepEqual(states(custom({ ...WAITING, type: 'TODO' })), onlyWaitingFix);
  assert.deepEqual(states(custom({ ...WAITING, symbol: 'W' })), onlyWaitingFix);
  // Odd saved values are read as "no such status", never thrown on.
  assert.deepEqual(states(custom(null, 5, 'w')), onlyWaitingFix);
  assert.deepEqual(states({ on: true, settings: { taskFormat: 'dataview', setDoneDate: true, statusSettings: 'x' } }), onlyWaitingFix);
  assert.deepEqual(states({ on: true, settings: { taskFormat: 'dataview', setDoneDate: true, statusSettings: { customStatuses: 'w' } } }), onlyWaitingFix);
});

test('buildGuide: Set done date off is a fix that says where to change it; any value but true is too, as the other lines do', () => {
  for (const setDoneDate of [false, 'yes', 0]) {
    assert.deepEqual(doneLine({ taskFormat: 'dataview', setDoneDate }), DONE_DATE_FIX, String(setDoneDate));
  }
});

test("buildGuide: a saved settings object without the done date key counts as Tasks' default, on", () => {
  assert.deepEqual(states({ on: true, settings: { taskFormat: 'dataview', statusSettings: { customStatuses: [WAITING] } } }),
    ['tasks ok', 'format ok', 'doneDate ok', 'waiting ok']);
});

test("buildGuide: settings never saved (null) are Tasks' defaults, so two lines to fix", () => {
  assert.deepEqual(buildGuide({ on: true, settings: null }).setup, [TASKS_OK, FORMAT_FIX, DONE_DATE_OK, WAITING_FIX]);
});

test("buildGuide: settings Brain can't read give three lines it can't check, never a fix", () => {
  for (const settings of [undefined, 'x', 42, ['dataview']]) {
    assert.deepEqual(buildGuide({ on: true, settings }).setup, [
      TASKS_OK,
      { ...FORMAT_OK, state: 'unknown', where: 'Tasks settings, Task Format' },
      { ...DONE_DATE_OK, state: 'unknown', where: 'Tasks settings' },
      { ...WAITING_OK, state: 'unknown', where: 'Tasks settings, Task Statuses' },
    ], String(settings));
  }
  assert.deepEqual(states({ on: true }), ['tasks ok', 'format unknown', 'doneDate unknown', 'waiting unknown']);
});

test('buildGuide: Tasks off is a fix, and nothing else can be checked', () => {
  const lines = buildGuide({ on: false, settings: { taskFormat: 'dataview', setDoneDate: false, statusSettings: { customStatuses: [WAITING] } } }).setup;
  assert.deepEqual(lines[0], { key: 'tasks', state: 'fix', text: [{ text: 'Turn on the Tasks plugin' }], where: 'Settings, Community plugins' });
  assert.deepEqual(lines.slice(1).map((l) => l.state), ['unknown', 'unknown', 'unknown']);
  assert.deepEqual(states({ on: false }), ['tasks fix', 'format unknown', 'doneDate unknown', 'waiting unknown']);
});

test("the Guide's setup check with nothing read of Tasks: every line is Can't check, and none is a fix", () => {
  assert.deepEqual(states({}), ['tasks unknown', 'format unknown', 'doneDate unknown', 'waiting unknown']);
  assert.deepEqual(states({ on: true }), ['tasks ok', 'format unknown', 'doneDate unknown', 'waiting unknown']);
});
