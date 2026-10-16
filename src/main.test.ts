import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../test/ui.ts';   // first: it installs the global document that onload's key listener reads
import { notices } from '../test/obsidian-stub.ts';
import BrainPlugin, { registerBrainViews } from './main.ts';

/** A plugin that records the Bases views and the commands it gets. Each view registration answers `ok`. */
function fakePlugin(ok = true) {
  const views: { id: string; name: string }[] = [];
  const commands: { id: string; name: string }[] = [];
  const plugin = {
    app: { vault: { getFileByPath: () => null } },
    registerBasesView: (id: string, opts: { name: string }) => {
      views.push({ id, name: opts.name });
      return ok;
    },
    addCommand: (command: { id: string; name: string }) => {
      commands.push(command);
    },
    registerDomEvent: () => {},
  };
  return { plugin: plugin as unknown as BrainPlugin & Parameters<typeof registerBrainViews>[0], views, commands };
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

test('without the Bases core plugin, onload says so under the plugin name', () => {
  notices.length = 0;
  const { plugin } = fakePlugin(false);
  BrainPlugin.prototype.onload.call(plugin);
  assert.deepEqual(notices, ['Ninja Board needs the Bases core plugin. Turn on Bases, then reload Ninja Board.']);
});

test('the commands are Open Today, Open guide and Undo the last Ninja Board change', () => {
  const { plugin, commands } = fakePlugin();
  BrainPlugin.prototype.onload.call(plugin);
  assert.deepEqual(commands.map((c) => c.name), ['Open Today', 'Open guide', 'Undo the last Ninja Board change']);
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
