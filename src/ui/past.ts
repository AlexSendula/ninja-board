import type { PastWeekVM, RecordRowVM } from '../model/types.ts';
import type { Actions } from './actions.ts';
import { h } from './dom.ts';
import { metaLine, readonlyRow } from './task.ts';
import { foldTile, labelRow } from './page.ts';

/**
 * A past week under its strip: the line that says where it comes from, the read-only board and, for a
 * record, its Backlog folded under its count. The columns have no data-column and nothing here enables
 * dragging, so nothing moves; titles still open their note.
 */
export function pastParts(vm: PastWeekVM, actions: Actions, backlogOpen: boolean): HTMLElement[] {
  const parts: HTMLElement[] = [
    h('div', 'brain-week-line', {}, [metaLine(vm.source, actions)]),
    h('div', 'brain-board brain-board-week', {}, vm.columns.map((col) => h('section', 'brain-col', {}, [
      labelRow(col.title, col.rows.length),
      h('ul', 'brain-col-items', {}, col.rows.length > 0 ? rows(col.rows, actions) : [h('li', 'brain-empty', {}, [col.empty])]),
    ]))),
  ];
  const backlog = vm.backlog ?? [];
  if (backlog.length > 0) {
    parts.push(foldTile({
      name: 'backlog',
      title: 'Backlog',
      count: backlog.length,
      open: backlogOpen,
      content: [h('ul', 'brain-tasks', {}, rows(backlog, actions))],
    }));
  }
  return parts;
}

function rows(list: RecordRowVM[], actions: Actions): HTMLLIElement[] {
  return list.map((r) => readonlyRow(r, actions));
}
