import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../test/ui.ts';   // first: it installs the global document that onload's key listener reads
import { notices } from '../test/obsidian-stub.ts';
import BrainPlugin, { registerBrainViews } from './main.ts';

type KeyListener = (e: unknown) => void;

/**
 * A plugin that records the Bases views, the commands and the DOM listeners it gets. Each view registration answers `ok`.
 * `leaves` are the workspace's leaves (each with its view's document) and `opened` the windows opened after load.
 */
function fakePlugin(ok = true, leaves: { view: { containerEl: { ownerDocument: Document } } }[] = []) {
  const views: { id: string; name: string }[] = [];
  const commands: { id: string; name: string }[] = [];
  const dom: { el: Document; type: string; cb: KeyListener; opts: unknown }[] = [];
  const opened: ((win: unknown, window: { document: Document }) => void)[] = [];
  const plugin = {
    app: {
      vault: { getFileByPath: () => null },
      workspace: {
        on: (name: string, cb: (win: unknown, window: { document: Document }) => void) => {
          if (name === 'window-open') opened.push(cb);
          return {};
        },
        onLayoutReady: (cb: () => void) => cb(),
        iterateAllLeaves: (cb: (leaf: unknown) => void) => leaves.forEach(cb),
      },
    },
    registerBasesView: (id: string, opts: { name: string }) => {
      views.push({ id, name: opts.name });
      return ok;
    },
    addCommand: (command: { id: string; name: string }) => {
      commands.push(command);
    },
    registerDomEvent: (el: Document, type: string, cb: KeyListener, opts: unknown) => {
      dom.push({ el, type, cb, opts });
    },
    registerEvent: () => {},
  };
  return {
    plugin: plugin as unknown as BrainPlugin & Parameters<typeof registerBrainViews>[0],
    views, commands, dom,
    windowOpened: (win: { document: Document }) => opened.forEach((cb) => cb({}, win)),
  };
}

test('the five views register under ninja-board ids and are named Ninja Board · …', () => {
  const { plugin, views } = fakePlugin();
  assert.equal(registerBrainViews(plugin), true);
  assert.deepEqual(views, [
    { id: 'ninja-board-today', name: 'Ninja Board · Today' },
    { id: 'ninja-board-week', name: 'Ninja Board · Week' },
    { id: 'ninja-board-projects', name: 'Ninja Board · Projects' },
    { id: 'ninja-board-backlog', name: 'Ninja Board · Backlog & Waiting' },
    { id: 'ninja-board-guide', name: 'Ninja Board · Guide' },
  ]);
});

test('without the Bases core plugin, onload says Bases is off, and to turn it on', () => {
  notices.length = 0;
  const { plugin } = fakePlugin(false);
  BrainPlugin.prototype.onload.call(plugin);
  assert.deepEqual(notices, ['Bases is off. Turn it on, then reload this plugin.']);
});

test('the commands are Open today, Open guide and Undo the last change: no plugin name, and sentence case', () => {
  const { plugin, commands } = fakePlugin();
  BrainPlugin.prototype.onload.call(plugin);
  assert.deepEqual(commands.map((c) => c.name), ['Open today', 'Open guide', 'Undo the last change']);
  assert.deepEqual(commands.map((c) => c.id), ['open-today', 'open-guide', 'undo']);   // the ids stay as they were
});

test('Open Today with no Today note says so under the plugin name', () => {
  notices.length = 0;
  const { plugin } = fakePlugin();
  (BrainPlugin.prototype as unknown as { openToday: () => void }).openToday.call(plugin);
  assert.deepEqual(notices, ["Ninja Board can't find 01 Dashboard/01 Today.md"]);
});

test('the manifest names the plugin Ninja Board, and its id is the folder the plugin installs into', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual([manifest.id, manifest.name], ['ninja-board', 'Ninja Board']);
});

test('the undo key is listened for on each window\'s document, once: the main one, the pop-outs open at load, and those opened after', () => {
  const main = activeDocument;
  const popA = { id: 'pop-a' } as unknown as Document;
  const popB = { id: 'pop-b' } as unknown as Document;
  const leafIn = (doc: Document) => ({ view: { containerEl: { ownerDocument: doc } } });
  const { plugin, dom, windowOpened } = fakePlugin(true, [leafIn(popA), leafIn(main), leafIn(popA)]);
  BrainPlugin.prototype.onload.call(plugin);
  windowOpened({ document: popB });
  windowOpened({ document: popA });   // already listened for: no second listener
  // The documents by name: a node is never given to deepEqual (a failure would diff the whole document).
  const name = (doc: Document) => (doc === main ? 'main' : (doc as unknown as { id: string }).id);
  assert.deepEqual(dom.map((d) => [name(d.el), d.type, d.opts]), [
    ['main', 'keydown', { capture: true }],
    ['pop-a', 'keydown', { capture: true }],
    ['pop-b', 'keydown', { capture: true }],
  ]);
});

test('Cmd+Z in a pop-out window is taken on that window\'s document, and only inside a Ninja Board view', () => {
  const popB = { id: 'pop-b' } as unknown as Document;
  const { plugin, dom, windowOpened } = fakePlugin();
  BrainPlugin.prototype.onload.call(plugin);
  windowOpened({ document: popB });
  const listener = dom.find((d) => d.el === popB)?.cb;
  assert.ok(listener);
  let prevented = 0;
  const press = (inside: boolean) => ({
    key: 'z', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
    target: { closest: (sel: string) => (sel === '.brain-view' && inside ? {} : null) },
    preventDefault: () => { prevented++; },
    stopPropagation: () => {},
  });
  listener(press(false));
  assert.equal(prevented, 0);
  listener(press(true));
  assert.equal(prevented, 1);
});
