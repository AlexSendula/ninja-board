import { MarkdownView } from 'obsidian';
import type { App, Plugin, WorkspaceLeaf } from 'obsidian';
import { isBoardPage } from '../model/isBoardPage.ts';

// A board page, a note whose frontmatter cssclasses holds ninja-board, opens in reading view: the page shows the board and nothing else.
// The frontmatter is in the metadata cache when 'file-open' fires, so the switch is made inside the handler, before the page is drawn.
// A note without the class, an embed of a dashboard included, is no board page and stays editable. The base block is one switch away (Cmd/Ctrl+E).

/** The leaves that show a board page in reading view because Ninja Board put it there, or because the user's default is editing. */
const readOnly = new WeakSet<WorkspaceLeaf>();

/**
 * The path each note view showed at its last check. The same path again is a tab switch or a second event, not an open.
 * Keyed by view, not leaf: a note that opens after a PDF or a canvas in the same tab gets a new view, and is checked again.
 * A note with no metadata cache entry yet (a vault still indexing, a note made a moment ago) is not recorded: it is looked at again.
 */
const checked = new WeakMap<MarkdownView, string>();

/** Forgets a read-only leaf. True when it was one, and then the note it opens next should open for editing (openNote). */
export function leaveReadOnly(leaf: WorkspaceLeaf): boolean {
  return readOnly.delete(leaf);
}

/**
 * Checks the note each leaf opens: when a file opens (a tab switch fires it too), in every note leaf once the layout is ready, and
 * again when the metadata cache gains an entry (the leaves already checked are skipped, so an edit of a note changes nothing).
 */
export function registerBoardPages(plugin: Plugin): void {
  const { app } = plugin;
  const checkAll = (): void => {
    for (const leaf of app.workspace.getLeavesOfType('markdown')) check(app, leaf);
  };
  plugin.registerEvent(app.workspace.on('file-open', () => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view) check(app, view.leaf);
  }));
  plugin.registerEvent(app.metadataCache.on('changed', checkAll));
  app.workspace.onLayoutReady(checkAll);   // runs inside onload when the plugin is enabled after startup, so check must not throw
}

function check(app: App, leaf: WorkspaceLeaf): void {
  try {
    const view = leaf.view;
    const file = view instanceof MarkdownView ? view.file : null;
    if (!(view instanceof MarkdownView) || !file || checked.get(view) === file.path) return;
    const cache = app.metadataCache.getFileCache(file);
    if (cache) checked.set(view, file.path);
    const board = isBoardPage(cache?.frontmatter);
    const reading = view.getMode() === 'preview';
    if (board && !reading) {
      readOnly.add(leaf);
      setMode(view, 'preview');
    } else if (board && !prefersReading(app)) {
      // In reading view without our switch: Obsidian restored the tab (workspace.json) or went Back to this page, in the mode we gave it.
      readOnly.add(leaf);
    } else if (!board && readOnly.delete(leaf) && reading) {
      setMode(view, 'source');   // the mode it had before the board page
    }
    // A board page in reading view because the user's default is reading is left alone, and not remembered.
  } catch (error) {
    console.error(error);   // one leaf's failure must not stop the leaves after it, or the plugin's onload
  }
}

/** Whether the user's default view for a note is reading (Settings, Editor, Default view for new tabs). Obsidian's typings omit getConfig; unset means editing. */
function prefersReading(app: App): boolean {
  const vault = app.vault as App['vault'] & { getConfig?: (key: string) => unknown };
  return vault.getConfig?.('defaultViewMode') === 'preview';
}

/** Asks the view for the mode, and logs a refusal: the caller does not wait, the page must not draw first. */
function setMode(view: MarkdownView, mode: 'source' | 'preview'): void {
  view.setState({ ...view.getState(), mode }, { history: false }).catch(console.error);
}
