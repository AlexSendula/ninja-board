import { displayText } from './taskLine.ts';
import type { ArrangeColumn, Arrangement, ScheduleView, WaitingView } from './types.ts';

/** The board columns that can be arranged. Done never is: it keeps its time order. */
export const ARRANGE_COLUMNS: readonly ArrangeColumn[] = ['todo', 'doing', 'waiting', 'active', 'paused', 'someday'];

/**
 * The view's `arrange:` value as Bases hands it over (`config.get('arrange')`), cleaned up: only
 * the known columns, only lists, only keys that are text (a note named "2026" comes back from YAML
 * as a number). Anything broken counts as no arrangement, so the board falls back to its normal order.
 */
export function readArrangement(v: unknown): Arrangement {
  const out: Arrangement = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const column of ARRANGE_COLUMNS) {
    const list: unknown = (v as Record<string, unknown>)[column];
    if (!Array.isArray(list)) continue;
    const keys = list.flatMap((k: unknown) =>
      typeof k === 'string' ? [k] : typeof k === 'number' && Number.isFinite(k) ? [String(k)] : []);
    if (keys.length > 0) out[column] = keys;
  }
  return out;
}

/**
 * The arrangement to save: `current` (what the view's config holds) with `lists` written over it.
 * An empty list removes its column. The result is new, with new lists: Bases' own data is never touched.
 */
export function mergeArrangement(current: unknown, lists: Arrangement): Arrangement {
  return readArrangement({ ...readArrangement(current), ...lists });
}

/** The view's `schedule:` value (`config.get('schedule')`): 'compact', or else the default, large. */
export function readScheduleView(v: unknown): ScheduleView {
  return v === 'compact' ? 'compact' : 'large';
}

/** The view's `waiting:` value (`config.get('waiting')`): 'group', or else the default, column. */
export function waitingViewOf(v: unknown): WaitingView {
  return v === 'group' ? 'group' : 'column';
}

// ---------- Item keys and the arranged order (Task 4) ----------

/** Between a line row's note name and its text: "Home › Clean the gutters" (U+203A, with spaces). */
export const ARRANGE_SEPARATOR = ' › ';

/** A line row's key: its note's name, then its text as shown (no fields, link brackets or tags). */
export function lineKey(noteName: string, text: string): string {
  return noteName + ARRANGE_SEPARATOR + displayText(text);
}

/**
 * The listed items, in the listed order, and the rest in their given order. Each listed key takes the
 * first item with that key not taken yet, so items sharing a key are taken in turn. A key with no item
 * left is ignored: it is stale, and the next save drops it.
 */
function takeListed<T extends { arrangeKey: string }>(
  items: readonly T[], keys: readonly string[] | undefined,
): { listed: T[]; rest: T[] } {
  const rest = [...items];
  const listed: T[] = [];
  for (const key of keys ?? []) {
    const i = rest.findIndex((item) => item.arrangeKey === key);
    if (i >= 0) listed.push(...rest.splice(i, 1));
  }
  return { listed, rest };
}

/** The listed items first, in the listed order, then the rest in their given order. */
export function arrange<T extends { arrangeKey: string }>(items: readonly T[], keys: readonly string[] | undefined): T[] {
  const { listed, rest } = takeListed(items, keys);
  return [...listed, ...rest];
}

/**
 * Waiting's order (section 4b): the listed items in their listed order, as arrange() places them, and each
 * item not listed goes in before the first placed item with a later chase (`chase` gives it; UNDATED when
 * none). The rest come in chase order, so each one lands after any earlier-chased one, and a tie keeps its place.
 */
export function arrangeByChase<T extends { arrangeKey: string }>(
  items: readonly T[], keys: readonly string[] | undefined, chase: (item: T) => string,
): T[] {
  const { listed, rest } = takeListed(items, keys);
  for (const item of rest) {
    const at = listed.findIndex((placed) => chase(placed) > chase(item));
    listed.splice(at < 0 ? listed.length : at, 0, item);
  }
  return listed;
}

/**
 * A new list: the key at position `from` taken out (null: it comes from another column), then `key`
 * put in at `to`, clamped to the list. By position, not by key, so a repeated key is safe.
 */
export function placeItem(keys: readonly string[], from: number | null, key: string, to: number): string[] {
  const next = [...keys];
  if (from !== null) next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, key);
  return next;
}
