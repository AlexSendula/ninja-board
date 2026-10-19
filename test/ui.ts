// UI test helpers: a linkedom document, events, an Actions double, and the sample's real lines and notes.
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import type { NoteInfo, RowVM, TaskLine } from '../src/model/types.ts';
import type { Actions } from '../src/ui/actions.ts';
import { loadSample } from './sample.ts';
import { displayText, symbolOf, withField, withSymbol } from '../src/model/taskLine.ts';
import { lineWithDue, lineWithPlan, lineWithState } from '../src/obsidian/edits.ts';
import { installObsidianDom } from '../preview/obsidian-dom.ts';

const win = parseHTML('<!doctype html><html><body></body></html>');
// The components use the global document, as they do in Obsidian and in the preview; and Obsidian's createEl, setCssProps and setCssStyles.
Object.assign(globalThis, { document: win.document, activeDocument: win.document });   // activeDocument: Obsidian's global, as main.ts reads it
installObsidianDom(win.document, win.HTMLElement as unknown as typeof HTMLElement, win.SVGElement as unknown as typeof SVGElement);

// linkedom has no animation frames: the window queues them, and a test runs them with nextFrame().
const frames: (() => void)[] = [];
Object.assign(win, { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
/** Runs the animation frames asked for so far; a frame that one of them asks for waits for the next call. */
export function nextFrame(): void {
  frames.splice(0).forEach((callback) => callback());
}

/** A bubbling, cancelable event with extra fields (key, clientX, pointerType…). linkedom has no KeyboardEvent or PointerEvent. */
export function fire(el: Element, type: string, fields: Record<string, unknown> = {}): Event {
  const e = Object.assign(new win.Event(type, { bubbles: true, cancelable: true }), fields);
  el.dispatchEvent(e);
  return e;
}

/** What a failure shows of a value: a node as its markup, cut short. Only on failure, so a passing run never serialises a node. */
function show(v: unknown): string {
  const html = (v as Element | null)?.outerHTML;
  return typeof html === 'string' ? html.slice(0, 200) : String(v);
}

/**
 * Asserts that a lookup found nothing. Never give a node to assert.equal: when it fails, Node diffs the node and its
 * document and the run hangs. The failure shows the element instead.
 */
export function absent(el: unknown, message = 'an element is there that should not be'): void {
  if (el === null || el === undefined) return;
  assert.fail(`${message}: ${show(el)}`);
}

/** Asserts that two lookups give the same node, or both nothing. Compares identity; the same caveat as absent(). */
export function same(actual: unknown, expected: unknown, message = 'a different node is there'): void {
  if (actual === expected) return;
  assert.fail(`${message}: got ${show(actual)}, want ${show(expected)}`);
}

/**
 * An Actions double that records every call.
 * Like the plugin, a write resolves to the target as written: a line with its new raw, a note as it is
 * (plan, due) or with its new state (setState).
 */
/** The day a recorded state write is dated: the day the UI tests use. */
const RECORDED_DAY = '2026-10-13';

export function recorder() {
  const calls: unknown[][] = [];
  const actions: Actions = {
    mac: false,
    async toggle(target) { calls.push(['toggle', target]); },
    async setState(target, state) {
      calls.push(['setState', target, state]);
      if (target.kind !== 'line') return { ...target, state };
      // As the vault writes it: a done line gets its completion date, a dropped one its cancelled date.
      if (state === 'done') return { ...target, raw: withField(withSymbol(target.raw, symbolOf(state)), 'completion', RECORDED_DAY) };
      return { ...target, raw: lineWithState(target.raw, state, RECORDED_DAY) };
    },
    async setNoteStatus(path, status) { calls.push(['setNoteStatus', path, status]); },
    open(path, line) { calls.push(['open', path, line]); },
    async plan(target, to) {
      calls.push(['plan', target, to]);
      return target.kind === 'line' ? { ...target, raw: lineWithPlan(target.raw, to, RECORDED_DAY) } : target;
    },
    async due(target, date) {
      calls.push(['due', target, date]);
      return target.kind === 'line' ? { ...target, raw: lineWithDue(target.raw, date) } : target;
    },
    async points(target, points) { calls.push(['points', target, points]); return target; },
    arrange(lists) { calls.push(['arrange', lists]); },
    scheduleView(view) { calls.push(['scheduleView', view]); },
    waitingView(view) { calls.push(['waitingView', view]); },
    foldStories(names, folded) { calls.push(['foldStories', names, folded]); },
    showWeek(start) { calls.push(['showWeek', start]); },
    showDay(spec) { calls.push(['showDay', spec.title, spec.events.map((e) => e.title), spec.now]); },
    // A group is one undo step in the plugin; here its writes are the calls they were, so it records nothing of its own.
    async group(_label, run) { await run(); },
    undo() { calls.push(['undo']); },
    undoLabel() { return undefined; },
    showAll(spec) {
      calls.push(['showAll', spec.key, spec.count]);
      let open = true;
      return {
        update(next) { if (open) calls.push(['update', next.key, next.count]); },
        close() { if (open) calls.push(['close', spec.key]); open = false; },
        isOpen: () => open,
      };
    },
  };
  return { actions, calls };
}

const sample = loadSample();

export function sampleLine(text: string): TaskLine {
  const t = sample.notes.flatMap((n) => n.tasks).find((x) => displayText(x.text) === text);
  if (!t) throw new Error(`No sample line "${text}"`);
  return t;
}

/** The sample note with this name. One-off appointments carry their date: "2026-10-15 Contractor visit". */
export function sampleNote(name: string): NoteInfo {
  const n = sample.notes.find((x) => x.name === name) ?? sample.notes.find((x) => x.name.endsWith(` ${name}`));
  if (!n) throw new Error(`No sample note "${name}"`);
  return n;
}

/** A RowVM on the sample line with this text: the real target and state; title, meta and label as the mockup has them. */
export function rowFor(text: string, vm: Partial<RowVM> = {}): RowVM {
  const t = sampleLine(text);
  return {
    key: `${t.path}#${t.line}`,
    target: { kind: 'line', path: t.path, line: t.line, raw: t.raw },
    title: text,
    state: t.state,
    meta: [],
    repeating: false,
    draggable: false,
    ariaLabel: text,
    ...vm,
  };
}
