import { Notice } from 'obsidian';
import type { App } from 'obsidian';

/** The Guide's dashboard note: its base block draws the Guide view. */
export const GUIDE_NOTE = '01 Dashboard/05 Guide.md';

/** Opens the Guide note in this tab, or says that it is missing. */
export async function openGuide(app: App): Promise<void> {
  const file = app.vault.getFileByPath(GUIDE_NOTE);
  if (!file) {
    new Notice(`Ninja Board can't find ${GUIDE_NOTE}`);
    return;
  }
  await app.workspace.getLeaf(false).openFile(file);
}
