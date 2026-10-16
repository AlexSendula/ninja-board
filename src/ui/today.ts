import type { RowVM, ScheduleView, TodayVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h } from './dom.ts';
import { viewHead } from './header.ts';
import { schedule, scheduleScroll, scheduleWhole } from './schedule.ts';
import { taskRow } from './task.ts';
import { foldTile, foldWasOpen, labelRow, leftFigure, mountPage } from './page.ts';

/** `now` ("HH:MM") is where the Schedule's now-line stands; `schedule` is the form the Schedule takes (default large). */
export function renderToday(root: HTMLElement, vm: TodayVM, actions: Actions, opts: { now?: string; schedule?: ScheduleView } = {}): void {
  // Ticking re-renders the view; an open Done today stays open, and so does a Schedule grown to the whole day,
  // scrolled where it was. A new day opens at now again: the host puts the day on the root before it draws.
  const wasOpen = foldWasOpen(root, 'done-today');
  const whole = scheduleWhole(root);
  const day = root.dataset.today ?? '';
  const kept = scheduleScroll(root);
  const scroll = kept?.day === day ? kept.top : undefined;
  const page = mountPage(root, 'today');
  const counted = vm.left + vm.doneToday;
  page.append(viewHead({
    label: vm.label,
    title: vm.title,
    accent: true,
    figure: counted > 0 ? leftFigure(vm.doneToday, vm.left, 'today') : undefined,
    undo: actions,
  }));
  if (vm.now.length + vm.today.length + vm.schedule.length + vm.doneToday === 0) {
    page.append(h('p', 'brain-empty', {}, ['Nothing left for today.']));
    return;
  }

  // styles.css pins Now, Today and Schedule to named grid areas, so all three always render:
  // an omitted one would leave its slot blank. An empty Schedule says "No appointments".
  const tiles = [
    rowsTile('Now', 'brain-area-now', vm.now, 'Nothing in progress.', actions),
    rowsTile('Today', 'brain-area-today', vm.today, 'Nothing due today.', actions),
    schedule(vm.schedule, actions, { now: opts.now, view: opts.schedule, whole, day, scroll }),
  ];
  if (vm.doneToday > 0) {
    // Done today: one row that folds open to the list, in the model's order.
    tiles.push(foldTile({
      name: 'done-today',
      title: 'Done today',
      count: vm.doneToday,
      open: wasOpen,
      content: [h('ul', 'brain-tasks', {}, vm.doneRows.map((r) => taskRow(r, actions)))],
    }));
  }
  page.append(h('div', 'brain-grid brain-today', {}, tiles));
}

function rowsTile(title: string, area: string, rows: RowVM[], empty: string, actions: Actions): HTMLElement {
  return h('section', `brain-tile ${area}`, {}, [
    labelRow(title, rows.length),
    rows.length > 0
      ? h('ul', 'brain-tasks', {}, rows.map((r) => taskRow(r, actions)))
      : h('p', 'brain-empty', {}, [empty]),
  ]);
}
