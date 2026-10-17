import type { TaskLine, TaskState } from './types.ts';
import { toISO } from './dates.ts';

type DateKey = 'due' | 'scheduled' | 'start' | 'completion' | 'cancelled';

interface Field { whole: string; key: string; value: string }

// The contract's /^(\s*)[-*+] \[(.)\] (.*)$/, widened so a bare "- [ ]" (no trailing space) is a task too.
const TASK_RE = /^\s*[-*+] \[(.)\](?: (.*))?$/;
// A [ ] field's value: text, or a wikilink date ([[2026-10-15]]) whose brackets stay inside it, so the field
// doesn't end at the link's first ]. Any other [ ends the value, so a field opener with no close stops at the
// next bracket and costs its own length, not the rest of the line.
export const BRACKET_VALUE = String.raw`(?:\[\[[^\][]*\]\]|[^\][])*`;
// [key:: value] or (key:: value), for the five date keys Brain reads. Other fields stay in the text. A ( ends a
// round-bracket value, for the same reason.
const FIELD_RE = new RegExp(
  String.raw`\[(due|scheduled|start|completion|cancelled)::(${BRACKET_VALUE})\]|\((due|scheduled|start|completion|cancelled)::([^)(]*)\)`, 'g');
// A wikilink's target: before any | or #. Linear: the target and the rest stop at the next bracket.
const LINK_RE = /\[\[([^\][|#]+)(?:[|#][^\][]*)?\]\]/g;
// The first wikilink in a line: the person a waiting line is with (Backlog, Week's waiting stories). Linear, as LINK_RE is.
export const FIRST_LINK = /\[\[[^\][]+\]\]/;
const POINTER_RE = /^\[\[[^\]]+\]\]$/;

const STATES = new Map<string, TaskState>([
  [' ', 'todo'], ['/', 'doing'], ['w', 'waiting'], ['x', 'done'], ['X', 'done'], ['-', 'dropped'],
]);

const SYMBOLS: Record<TaskState, string> = { todo: ' ', doing: '/', waiting: 'w', done: 'x', dropped: '-' };

function fieldsIn(s: string): Field[] {
  return [...s.matchAll(FIELD_RE)].map(([whole = '', k1, v1, k2, v2]) => ({
    whole,
    key: k1 ?? k2 ?? '',
    value: (v1 ?? v2 ?? '').trim(),
  }));
}

export function parseTaskLine(raw: string, path: string, line: number): TaskLine | null {
  const m = TASK_RE.exec(raw);
  if (!m) return null;
  const [, symbol = ' ', body = ''] = m;
  const dates: Partial<Record<DateKey, string>> = {};
  for (const f of fieldsIn(body)) {
    const iso = toISO(f.value);
    if (iso) dates[f.key as DateKey] ??= iso;
  }
  const text = body.replace(FIELD_RE, ' ').replace(/\s+/g, ' ').trim();
  return {
    path,
    line,
    raw,
    symbol,
    state: stateOf(symbol),
    text,
    ...dates,
    links: [...text.matchAll(LINK_RE)].map(([, target = '']) => target.trim()),
    isPointer: POINTER_RE.test(text),
  };
}

export function stateOf(symbol: string): TaskState {
  return STATES.get(symbol) ?? 'todo';
}

export function symbolOf(state: TaskState): string {
  return SYMBOLS[state];
}

export function withSymbol(raw: string, symbol: string): string {
  // Only a line parseTaskLine accepts as a task is rewritten; anything else comes back unchanged.
  if (!TASK_RE.test(raw)) return raw;
  return raw.replace(/^(\s*[-*+] \[)./, (_m, head: string) => head + symbol);
}

export function withField(raw: string, field: 'cancelled' | 'completion' | 'scheduled' | 'start' | 'due', iso: string): string {
  const found = fieldsIn(raw).find((f) => f.key === field);
  if (found) {
    // Keep the field's own brackets, [ ] or ( ).
    const open = found.whole.slice(0, 1);
    const close = found.whole.slice(-1);
    return raw.replace(found.whole, () => `${open}${field}:: ${iso}${close}`);
  }
  // A block id (" ^b7k2") must stay last on the line, or links to that block break. Trailing spaces go.
  const body = raw.trimEnd();
  const blockId = / \^[A-Za-z0-9-]+$/.exec(body)?.[0] ?? '';
  return `${body.slice(0, body.length - blockId.length)} [${field}:: ${iso}]${blockId}`;
}

// Obsidian tags: letters, digits, _ and -, plus / for nested tags. All digits (#4821) is not a tag.
const TAG_RE = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;

export function displayText(text: string): string {
  return text
    .replace(/\[\[([^\][|]*)(?:\|([^\][]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target.replace(/#.*/, ''))
    .replace(TAG_RE, (tag, lead: string, name: string) => (/^\p{N}+$/u.test(name) ? tag : lead))
    .replace(/\s+/g, ' ')
    .trim();
}
