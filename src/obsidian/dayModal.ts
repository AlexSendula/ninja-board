import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type { Actions, DaySpec } from '../ui/actions.ts';
import { returnFocus } from '../ui/focus.ts';
import { renderDayBody } from '../ui/day.ts';
import { tickNow } from '../ui/schedule.ts';
import { now } from './writes.ts';

/**
 * A day's full view as an Obsidian Modal: the whole timeline, finished appointments included, with the now-line on
 * today (it moves every minute while the modal is open). Escape, the × and the backdrop close it, and so does a
 * title, before it opens the note. Closing gives the focus back to the button that opened it, or when a redraw has
 * replaced that button, to the one with the same key in `root`.
 */
export class DayModal extends Modal {
  private readonly spec: DaySpec;
  private readonly actions: Actions;
  private readonly root: HTMLElement;
  private readonly key: string | undefined;
  private ticker: number | undefined;

  constructor(app: App, spec: DaySpec, actions: Actions, root: HTMLElement) {
    super(app);
    this.spec = spec;
    this.actions = actions;
    this.root = root;
    this.key = spec.opener.dataset.key;
  }

  onOpen(): void {
    this.modalEl.classList.add('brain-day-modal');
    this.setTitle(this.spec.title);
    renderDayBody(this.contentEl, this.spec, this.actions, { close: () => this.close() }).focus({ preventScroll: true });
    if (this.spec.now !== undefined) this.ticker = window.setInterval(() => tickNow(this.contentEl, now()), 60_000);
  }

  onClose(): void {
    window.clearInterval(this.ticker);
    this.contentEl.empty();
    // After Obsidian has taken the modal down, so nothing there takes the focus back.
    window.setTimeout(() => returnFocus(this.spec.opener, this.key, this.root), 0);
  }
}

/** Opens a day modal. */
export function showDay(app: App, spec: DaySpec, actions: Actions, root: HTMLElement): void {
  new DayModal(app, spec, actions, root).open();
}
