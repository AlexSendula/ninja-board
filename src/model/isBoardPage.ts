// A board page is a note that carries the CSS class `ninja-board` in its frontmatter `cssclasses`. Obsidian puts the class on the
// note as it draws it, and the CSS hides the page's Properties and title; Ninja Board also opens the page read-only (src/obsidian/boardPages.ts).

const BOARD_CLASS = 'ninja-board';
const CSSCLASSES_KEY = /^cssclasses$/i;

/**
 * Whether a note's frontmatter (metadataCache's `frontmatter`, so any value) marks a board page, as Obsidian 1.14.4 reads it:
 * the first key that is `cssclasses` in any case, a list or one string (a string is one class, not split), each item trimmed.
 * A class with a space in it is dropped by Obsidian, so it never equals `ninja-board`. The old singular `cssclass` key is not applied
 * (only the Format converter rewrites it), and a list item of another type is skipped.
 */
export function isBoardPage(frontmatter: unknown): boolean {
  if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) return false;
  const key = Object.keys(frontmatter).find((k) => CSSCLASSES_KEY.test(k));
  const value = key === undefined ? undefined : (frontmatter as Record<string, unknown>)[key];
  return (Array.isArray(value) ? value : [value]).some((c) => typeof c === 'string' && c.trim() === BOARD_CLASS);
}
