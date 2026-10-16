import type { GuideVM, MetaPart, SetupLineVM, TasksSetup } from './types.ts';

const TASKS_OK: MetaPart[] = [{ text: 'Tasks plugin on' }];
const TASKS_FIX: MetaPart[] = [{ text: 'Turn on the Tasks plugin' }];
const FORMAT_OK: MetaPart[] = [{ text: 'Task Format is Dataview' }];
const FORMAT_FIX: MetaPart[] = [{ text: 'Set Task Format to ' }, { text: 'Dataview', tone: 'strong' }];
const DONE_DATE_OK: MetaPart[] = [{ text: 'Tasks sets the done date' }];
const DONE_DATE_FIX: MetaPart[] = [{ text: 'Turn on Set done date on every completed task' }];
const WAITING_STATUS: MetaPart[] = [{ text: 'w', tone: 'strong' }, { text: ', type ' }, { text: 'ON_HOLD', tone: 'strong' }];
const WAITING_OK: MetaPart[] = [{ text: 'Waiting status: symbol ' }, ...WAITING_STATUS];
const WAITING_FIX: MetaPart[] = [{ text: 'Add a Waiting status: symbol ' }, ...WAITING_STATUS];

/**
 * The Guide's setup check: what Ninja Board needs from the Tasks plugin. Tasks on, its Dataview task format,
 * Set done date on every completed task (a completed line needs its completion date), and a custom
 * status `w` of type ON_HOLD for waiting tasks. Settings Ninja Board can't read make a line "unknown", never
 * a fix. Settings never saved (null) are Tasks' defaults: the emoji format, no `w`, the done date on.
 */
export function buildGuide(setup: TasksSetup): GuideVM {
  const settings = readSettings(setup);
  return {
    setup: [
      line('tasks', setup.on, TASKS_OK, TASKS_FIX, 'Settings, Community plugins'),
      line('format', settings && settings.taskFormat === 'dataview', FORMAT_OK, FORMAT_FIX, 'Tasks settings, Task Format'),
      // A key Tasks never saved has its default, which is on (its DEFAULT_SETTINGS).
      line('doneDate', settings && (settings.setDoneDate ?? true) === true, DONE_DATE_OK, DONE_DATE_FIX, 'Tasks settings'),
      line('waiting', settings && hasWaiting(settings), WAITING_OK, WAITING_FIX, 'Tasks settings, Task Statuses'),
    ],
  };
}

/** ok: true, fix: false, unknown: undefined. An ok line needs no place to look. */
function line(key: SetupLineVM['key'], ok: boolean | undefined, okText: MetaPart[], fixText: MetaPart[], where: string): SetupLineVM {
  if (ok === undefined) return { key, state: 'unknown', text: okText, where };
  return ok ? { key, state: 'ok', text: okText } : { key, state: 'fix', text: fixText, where };
}

/** Tasks' settings; {} when never saved, so its defaults apply; undefined when Tasks is off or they can't be read. */
function readSettings(setup: TasksSetup): Record<string, unknown> | undefined {
  if (!setup.on) return undefined;
  if (setup.settings === null) return {};
  return isRecord(setup.settings) ? setup.settings : undefined;
}

function hasWaiting(settings: Record<string, unknown>): boolean {
  const statuses = isRecord(settings.statusSettings) ? settings.statusSettings.customStatuses : undefined;
  return Array.isArray(statuses) && statuses.some((s) => isRecord(s) && s.symbol === 'w' && s.type === 'ON_HOLD');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
