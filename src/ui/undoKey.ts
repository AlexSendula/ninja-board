// The Undo key, which the plugin's document listener and the preview both use: pure, so it runs under node:test.

/** The parts of a key press that decide it. */
export interface KeyPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: { closest(selector: string): unknown } | null;
}

/**
 * Whether a key press is Cmd/Ctrl+Z inside a Ninja Board view (a page, the list modal or the planner card, all in `.brain-view`),
 * and not in a text field, which keeps its own undo.
 */
export function isBrainUndoKey(e: KeyPress): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'z') return false;
  const target = e.target;
  if (!target || target.closest('input, textarea, select')) return false;
  // Only the nearest contenteditable decides: a dashboard in Live Preview puts Ninja Board in a "false" island inside the editor's
  // "true" content, and Ninja Board's keys are not the editor's.
  const nearest = target.closest('[contenteditable]') as { getAttribute?(name: string): string | null } | null;
  const editable = nearest?.getAttribute?.('contenteditable');
  if (editable === '' || editable === 'true' || editable === 'plaintext-only') return false;
  return target.closest('.brain-view') !== null;
}
