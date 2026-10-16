import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(PLUGIN, 'scripts', 'sandbox.mjs');
const SAMPLE = join(PLUGIN, 'sample-vault');
const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];

/** A temporary home holding an old vault at the default path: config, a dotfile, a folder and a note. */
function fakeHome(): { home: string; vault: string } {
  const home = mkdtempSync(join(tmpdir(), 'brain-sandbox-test-'));
  const vault = join(home, 'Documents', 'Obsidian Vault');
  mkdirSync(join(vault, '.obsidian'), { recursive: true });
  writeFileSync(join(vault, '.obsidian', 'app.json'), '{}');
  writeFileSync(join(vault, '.DS_Store'), '');
  mkdirSync(join(vault, 'Areas'));
  writeFileSync(join(vault, 'Areas', 'Health.md'), 'old health note\n');
  writeFileSync(join(vault, 'Inbox.md'), 'old inbox note\n');
  return { home, vault };
}

/** Runs the script with HOME set to the temporary home, so the real vault and Trash are never touched. */
function runSandbox(home: string, args: string[], vault?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  delete env.BRAIN_VAULT;
  if (vault) env.BRAIN_VAULT = vault;
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8' });
}

const visible = (dir: string) => readdirSync(dir).filter((name) => !name.startsWith('.')).sort();

test('refuses a folder without .obsidian and changes nothing', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'brain-sandbox-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const notes = join(home, 'notes');
  mkdirSync(notes);
  writeFileSync(join(notes, 'a.md'), 'a\n');

  const run = runSandbox(home, ['--yes'], notes);

  assert.equal(run.status, 1);
  assert.match(run.stderr, /not an Obsidian vault/);
  assert.deepEqual(visible(notes), ['a.md']);
  assert.equal(existsSync(join(home, '.Trash')), false);
});

test('without --yes it installs the plugin, lists what would move and keeps the notes', (t) => {
  const { home, vault } = fakeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const run = runSandbox(home, []);

  assert.equal(run.status, 0, run.stderr);
  for (const file of PLUGIN_FILES) {
    const installed = readFileSync(join(vault, '.obsidian', 'plugins', 'ninja-board', file), 'utf8');
    assert.equal(installed, readFileSync(join(PLUGIN, file), 'utf8'), file);
  }
  assert.match(run.stdout, /^ {2}Areas$/m);
  assert.match(run.stdout, /^ {2}Inbox\.md$/m);
  assert.match(run.stdout, /npm run sandbox -- --yes/);
  assert.deepEqual(visible(vault), ['Areas', 'Inbox.md']);
  assert.equal(existsSync(join(home, '.Trash')), false);
});

test('with --yes it moves the old notes to the Trash and copies the sample vault', (t) => {
  const { home, vault } = fakeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const run = runSandbox(home, ['--yes']);

  assert.equal(run.status, 0, run.stderr);
  const trashed = readdirSync(join(home, '.Trash'));
  assert.equal(trashed.length, 1);
  assert.match(trashed[0], /^brain-sandbox-\d{8}-\d{6}$/);
  const trash = join(home, '.Trash', trashed[0]);
  assert.deepEqual(visible(trash), ['Areas', 'Inbox.md']);
  assert.equal(readFileSync(join(trash, 'Areas', 'Health.md'), 'utf8'), 'old health note\n');

  assert.equal(readFileSync(join(vault, '.obsidian', 'app.json'), 'utf8'), '{}');
  assert.equal(existsSync(join(vault, '.DS_Store')), true);
  assert.deepEqual(visible(vault), visible(SAMPLE));
  const today = join('01 Dashboard', '01 Today.md');
  assert.equal(readFileSync(join(vault, today), 'utf8'), readFileSync(join(SAMPLE, today), 'utf8'));
  assert.equal(existsSync(join(vault, '.obsidian', 'plugins', 'ninja-board', 'main.js')), true);

  assert.match(run.stdout, /Community plugins/);
  assert.match(run.stdout, /ON_HOLD/);
  assert.match(run.stdout, /Default file to open/);
});
