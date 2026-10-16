import type { Actions, DaySpec } from './actions.ts';
import { h } from './dom.ts';
import { agendaItems, timeline } from './schedule.ts';

/** What the modal around a day's body can do: close itself. */
export interface DayHost {
  close(): void;
}

/**
 * Fills a day modal's content: the whole day, the finished appointments too, as the Schedule draws a day (a timeline,
 * with the now-line when the day is today) and as the narrow strip lists it. The CSS shows the timeline when the modal
 * is wide enough for it and the list when it is not. A title closes the modal before it opens the note.
 */
export function renderDayBody(content: HTMLElement, spec: DaySpec, actions: Actions, host: DayHost): HTMLElement {
  content.classList.add('brain-view');
  const inModal: Actions = {
    ...actions,
    open: (path, line) => {
      host.close();
      actions.open(path, line);
    },
  };
  const scroll = h('div', 'brain-day-scroll', { tabindex: '0', role: 'region', 'aria-label': spec.title }, [
    timeline(spec.events, inModal, spec.now),
    h('ol', 'brain-agenda', {}, agendaItems(spec.events, inModal)),
  ]);
  content.replaceChildren(scroll);
  return scroll;
}
