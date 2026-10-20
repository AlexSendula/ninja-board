import { Notice, Plugin, normalizePath } from 'obsidian';
import { registerBoardPages } from './obsidian/boardPages.ts';
import { BrainView } from './obsidian/view.ts';
import { openGuide } from './obsidian/guide.ts';
import { undoLast } from './obsidian/undo.ts';
import { isBrainUndoKey } from './ui/undoKey.ts';

const TODAY_NOTE = normalizePath('01 Dashboard/01 Today.md');

// The view types, as dashboard notes name them (`type: ninja-board-today`): once shipped, an id stays as it is.
const VIEWS = [
  { id: 'ninja-board-today', name: 'Ninja Board · Today', icon: 'sun' },
  { id: 'ninja-board-week', name: 'Ninja Board · Week', icon: 'calendar-range' },
  { id: 'ninja-board-projects', name: 'Ninja Board · Projects', icon: 'kanban' },
  { id: 'ninja-board-backlog', name: 'Ninja Board · Backlog & Waiting', icon: 'inbox' },
  { id: 'ninja-board-guide', name: 'Ninja Board · Guide', icon: 'book-open' },
] as const;

/** Registers the five Ninja Board view types. False when Bases is turned off in this vault. */
export function registerBrainViews(plugin: Plugin): boolean {
  const registered = VIEWS.map((view) =>
    plugin.registerBasesView(view.id, {
      name: view.name,
      icon: view.icon,
      factory: (controller, containerEl) => new BrainView(controller, containerEl, view.id, plugin),
    }),
  );
  return !registered.includes(false);
}

export default class BrainPlugin extends Plugin {
  onload(): void {
    if (!registerBrainViews(this)) {
      new Notice('Bases is off. Turn it on, then reload this plugin.');
    }
    // A board page, a note marked cssclasses: ninja-board, opens in reading view, so the page shows only the board.
    registerBoardPages(this);
    this.addCommand({ id: 'open-today', name: 'Open today', callback: () => this.openToday() });
    // Ninja Board: Open guide. openGuide shows a Notice when 01 Dashboard/05 Guide.md is missing.
    this.addCommand({ id: 'open-guide', name: 'Open guide', callback: () => void openGuide(this.app) });
    // Undo the last change: a command with no default hotkey. Cmd/Ctrl+Z in a Ninja Board view does the same, on the capture
    // phase so that Obsidian's own undo does not take it; a text field and the editor keep their undo. The plugin's name is
    // not in the name: the command palette shows it beside the name.
    this.addCommand({ id: 'undo', name: 'Undo the last change', callback: () => void undoLast(this.app) });
    // A pop-out window has its own document, and its keys never reach the main window's. Each document gets one listener: the
    // main window's, the pop-outs open at load, and the ones opened after (window-open).
    const listened = new WeakSet<Document>();
    const listen = (doc: Document): void => {
      if (listened.has(doc)) return;
      listened.add(doc);
      this.registerDomEvent(doc, 'keydown', (e) => {
        if (!isBrainUndoKey({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, target: e.target as Element | null })) return;
        e.preventDefault();
        e.stopPropagation();   // the editor around an embedded dashboard must not undo the note text as well
        void undoLast(this.app);
      }, { capture: true });
    };
    listen(activeDocument);
    this.registerEvent(this.app.workspace.on('window-open', (_win, win) => listen(win.document)));
    this.app.workspace.onLayoutReady(() => this.app.workspace.iterateAllLeaves((leaf) => listen(leaf.view.containerEl.ownerDocument)));
  }

  private openToday(): void {
    const file = this.app.vault.getFileByPath(TODAY_NOTE);
    if (!file) {
      new Notice(`Ninja Board can't find ${TODAY_NOTE}`);
      return;
    }
    void this.app.workspace.getLeaf(false).openFile(file);
  }
}
