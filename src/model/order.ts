/** Sorts after every real ISO date, so undated items go last. */
export const UNDATED = '9999-12-31';

export function onOrBefore(iso: string | undefined, end: string): boolean {
  return iso !== undefined && iso <= end;
}

/** The earlier of two optional ISO dates; UNDATED when there is neither. */
export function earliest(a: string | undefined, b: string | undefined): string {
  if (a === undefined || b === undefined) return a ?? b ?? UNDATED;
  return a < b ? a : b;
}

// Plain code-unit order, not localeCompare, so ISO dates and paths sort the same in every locale.
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
