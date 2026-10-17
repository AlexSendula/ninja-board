import { Modal, Platform } from 'obsidian';
import { returnFocus } from '../ui/focus.ts';
import { closeCard } from '../ui/popover.ts';
import type { App } from 'obsidian';
import type { Actions, ListHandle, ListSpec } from '../ui/actions.ts';
import { listTitle, renderListBody } from '../ui/listModal.ts';
import type { ListHost } from '../ui/listModal.ts';

/**
 * The list modal (Show all) as an Obsidian Modal. Escape, the × and the backdrop close it, except that
 * while an item is carried out of it they cancel the carry and the modal stays. A card's title closes it
 * first (renderListBody), and a drop on a target closes it for good.
 */
export class ListModal extends Modal {
  private spec: ListSpec;
  private readonly actions: Actions;
  private readonly opener: HTMLElement | undefined;   // the Show all button, which takes the focus back on close
  private redraw: ((next: ListSpec) => void) | undefined;
  private cancelCarry: (() => void) | undefined;
  private shown = false;

  constructor(app: App, spec: ListSpec, actions: Actions) {
    super(app);
    this.spec = spec;
    this.actions = actions;
    this.opener = spec.opener;
  }

  onOpen(): void {
    this.shown = true;
    this.modalEl.classList.add('brain-modal');
    this.setTitle(listTitle(this.spec));
    const host: ListHost = {
      close: () => this.finish(),
      carry: (on, cancel) => this.carry(on, cancel),
    };
    // Obsidian opens its own modals with the focus in the field only on a desktop, where a keyboard is expected (a phone's
    // keyboard would cover the grid), and so does this one.
    this.redraw = renderListBody(this.contentEl, this.spec, this.actions, host, { autofocus: Platform.isDesktop });
  }

  /** Escape, the × and the backdrop: a carried item goes back and the modal stays; else the modal closes. */
  close(): void {
    // A card open on the list closes first, and the modal stays (Escape, the ×, the backdrop alike).
    if (closeCard()) return;
    if (!this.cancelCarry) {
      this.finish();
      return;
    }
    this.cancelCarry();
    // A cancel that found no lifted press never told us the carry ended: end it here, or the modal stays hidden.
    if (this.carrying()) this.carry(false, () => {});
  }

  private carrying(): boolean {
    return this.cancelCarry !== undefined;
  }

  /** Holds the modal back while an item is carried out of it, and shows it again after. */
  private carry(on: boolean, cancel: () => void): void {
    this.containerEl.toggleClass('brain-carrying', on);
    this.cancelCarry = on ? cancel : undefined;
  }

  /** Closes the modal for good: a drop, a card's title, or a list no longer drawn. */
  finish(): void {
    if (this.shown) super.close();
  }

  update(spec: ListSpec): void {
    if (!this.shown) return;
    this.spec = spec;
    this.setTitle(listTitle(spec));
    this.redraw?.(spec);
  }

  isShown(): boolean {
    return this.shown;
  }

  onClose(): void {
    const { opener } = this;
    const key = opener?.dataset.key;
    const root = this.spec.zones;
    this.shown = false;
    this.cancelCarry = undefined;
    this.redraw = undefined;
    this.contentEl.empty();
    // After Obsidian has taken the modal down, so nothing there takes the focus back (as DayModal does).
    window.setTimeout(() => returnFocus(opener, key, root), 0);
  }
}

/** Opens a list modal and returns its handle: update, close (for good) and isOpen. */
export function showList(app: App, spec: ListSpec, actions: Actions): ListHandle {
  const modal = new ListModal(app, spec, actions);
  modal.open();
  return {
    update: (next) => modal.update(next),
    close: () => modal.finish(),
    isOpen: () => modal.isShown(),
  };
}
