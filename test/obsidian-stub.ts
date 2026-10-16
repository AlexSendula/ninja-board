// A stand-in for Obsidian's 'obsidian' module, so the modules that import it run under Node's test
// runner. test/obsidian-hook.mjs resolves that import to this file. It holds only what the tested
// code uses at runtime; the types still come from the obsidian package.
import { createRequire } from 'node:module';

// Obsidian's moment is the library the obsidian package depends on, so the same one.
const require = createRequire(import.meta.url);
export const moment: any = require('moment');

/** Every Notice shown, in order, for the tests to read. */
export const notices: string[] = [];

export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}

export class Modal {
  app: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  open(): void {}
  close(): void {}
}

export class MarkdownView {}

/** Obsidian's base class for a plugin: main.ts extends it, and the tests call its methods on fakes. */
export class Plugin {
  app: unknown;
  manifest: unknown;
  constructor(app: unknown, manifest: unknown) {
    this.app = app;
    this.manifest = manifest;
  }
}

/** Obsidian's platform flags: the tests run as a desktop app. */
export const Platform = { isMobile: false, isDesktop: true, isPhone: false, isTablet: false };

/** Obsidian's base class for a Bases view. Tests set `data`; `config` holds nothing. */
export class BasesView {
  controller: unknown;
  data: unknown;
  config = { get: (_key: string): unknown => undefined, set: (_key: string, _value: unknown): void => {} };
  constructor(controller: unknown) {
    this.controller = controller;
  }
  registerEvent(_ref: unknown): void {}
  registerInterval(id: number): number {
    return id;
  }
}

/**
 * Obsidian's debounce, simplified: each call restarts the timer; run() calls a pending call now
 * (and does nothing when there is none); cancel() drops it.
 */
export function debounce<A extends unknown[]>(cb: (...args: A) => unknown, timeout = 0) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  const run = (): unknown => {
    if (pending === undefined) return undefined;
    const args = pending;
    cancel();
    return cb(...args);
  };
  const call = (...args: A): void => {
    pending = args;
    clearTimeout(timer);
    timer = setTimeout(run, timeout);
  };
  return Object.assign(call, { cancel, run });
}

// Obsidian's YAML helpers, as the frontmatter reads and the undo layer's checks use them.
const yaml = require('yaml');
export function parseYaml(text: string): any {
  return yaml.parse(text);
}
export function stringifyYaml(value: unknown): string {
  return yaml.stringify(value);
}
