import { h, svg } from '../src/ui/dom.ts';
import type { Actions, DaySpec, ListHandle, ListSpec } from '../src/ui/actions.ts';
import { renderDayBody } from '../src/ui/day.ts';
import { returnFocus } from '../src/ui/focus.ts';
import { listTitle, renderListBody } from '../src/ui/listModal.ts';
import type { ListHost } from '../src/ui/listModal.ts';
import { closeCard } from '../src/ui/popover.ts';

/**
 * The list modal as Obsidian draws it, for the preview: the mockup's stand-in (its classes are styled by
 * shim.css), placed over the frame as the mockup's placeModal does. Escape, the × and the backdrop close
 * it, or cancel a carry first. Closing gives focus back to the element that had it.
 */
export function openListModal(stage: HTMLElement, spec: ListSpec, actions: Actions): ListHandle {
  const { frame, opener, titleEl, contentEl, closeButton, backdrop, container, place } = shell(stage, listTitle(spec), 'modal brain-modal');
  let shown = true;
  let cancelCarry: (() => void) | undefined;

  const carrying = (): boolean => cancelCarry !== undefined;
  // Escape, the × and the backdrop: a carried item goes back and the modal stays; else the modal closes.
  const dismiss = (): void => {
    if (!cancelCarry) {
      finish();
      return;
    }
    cancelCarry();
    if (carrying()) host.carry(false, () => {});   // a cancel that found no lifted press: end the carry here, or the modal stays hidden
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (closeCard()) return;   // a card open on the list closes first; the modal stays
    dismiss();
  };
  function finish(): void {
    if (!shown) return;
    shown = false;
    container.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    frame.inert = false;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  const host: ListHost = {
    close: () => finish(),
    carry: (on, cancel) => {
      container.classList.toggle('brain-carrying', on);   // the board beneath takes the pointer while an item is carried
      cancelCarry = on ? cancel : undefined;
      frame.inert = !on;
    },
  };

  place();
  stage.append(container);
  frame.inert = true;
  const redraw = renderListBody(contentEl, spec, actions, host, { autofocus: true });   // the preview is a desktop: as Platform.isDesktop does
  closeButton.addEventListener('click', dismiss);
  backdrop.addEventListener('click', dismiss);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  return {
    update(next) {
      if (!shown) return;
      titleEl.textContent = listTitle(next);
      redraw(next);
    },
    close: () => finish(),
    isOpen: () => shown,
  };
}

/**
 * A day's full view, as the day modal draws it in Obsidian: the same stand-in, with the day's body inside. Escape, the ×
 * and the backdrop close it, and so does a title, before it opens the note. Closing gives the focus back to the button that
 * opened it, or when a redraw has replaced that, to the one with the same key. The preview's clock is fixed, so the
 * now-line stays where it is.
 */
export function openDayModal(stage: HTMLElement, spec: DaySpec, actions: Actions): void {
  const { frame, titleEl, contentEl, closeButton, backdrop, container, place } = shell(stage, spec.title, 'modal brain-day-modal');
  const key = spec.opener.dataset.key;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    finish();
  };
  function finish(): void {
    if (!container.isConnected) return;
    container.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    frame.inert = false;
    // After the modal is gone, as DayModal does it, so nothing there takes the focus back.
    window.setTimeout(() => returnFocus(spec.opener, key, frame), 0);
  }
  place();
  stage.append(container);
  frame.inert = true;
  titleEl.textContent = spec.title;
  renderDayBody(contentEl, spec, actions, { close: finish }).focus({ preventScroll: true });
  closeButton.addEventListener('click', finish);
  backdrop.addEventListener('click', finish);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
}

/** The stand-in for Obsidian's Modal: a container over the frame, with a backdrop, a title, a × and a content element. */
function shell(stage: HTMLElement, title: string, modalClass: string) {
  const frame = stage.querySelector<HTMLElement>('.mock-frame') ?? stage;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleEl = h('h2', 'modal-title', {}, [title]);
  const contentEl = h('div', 'modal-content');
  const closeButton = h('button', 'modal-close-button clickable-icon', { 'aria-label': 'Close' }, [
    svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [svg('path', { d: 'M6 6l12 12M18 6L6 18' })]),
  ]);
  const backdrop = h('div', 'modal-bg');
  const modalEl = h('div', modalClass, { role: 'dialog', 'aria-modal': 'true' }, [closeButton, titleEl, contentEl]);
  const container = h('div', 'modal-container mod-dim', {}, [backdrop, modalEl]);
  const place = (): void => {
    const r = frame.getBoundingClientRect();
    container.setCssProps({
      '--mock-left': `${r.left}px`,
      '--mock-width': `${r.width}px`,
      '--mock-top': `${document.querySelector<HTMLElement>('#mock-bar')?.offsetHeight ?? 0}px`,
    });
  };
  return { frame, opener, titleEl, contentEl, closeButton, backdrop, modalEl, container, place };
}
