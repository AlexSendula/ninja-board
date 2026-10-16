// Builds Ninja Board and installs it into the Obsidian sandbox vault.
//   npm run sandbox            build and install the plugin; list the notes a reset would move
//   npm run sandbox -- --yes   also move those notes to the Trash and copy in the sample vault
// The vault is BRAIN_VAULT, or "~/Documents/Obsidian Vault" when it isn't set.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = fileURLToPath(new URL('..', import.meta.url));
const SAMPLE = join(PLUGIN, 'sample-vault');
const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];

const vault = process.env.BRAIN_VAULT ?? join(homedir(), 'Documents', 'Obsidian Vault');
const confirmed = process.argv.includes('--yes');

// Everything in the folder but its dotfiles goes to the Trash, so a wrong BRAIN_VAULT must stop here.
if (!existsSync(join(vault, '.obsidian'))) {
  console.error(`${vault} is not an Obsidian vault: it has no .obsidian folder. Set BRAIN_VAULT to the sandbox vault.`);
  process.exit(1);
}
console.log(`Vault: ${vault}`);

execFileSync('npm', ['run', 'build'], { cwd: PLUGIN, stdio: 'inherit' });
installPlugin();

const notes = readdirSync(vault).filter((name) => !name.startsWith('.')).sort();
const trash = join(homedir(), '.Trash', `brain-sandbox-${stamp(new Date())}`);
console.log(confirmed ? `Moving to ${trash}:` : 'A reset would move these to the Trash:');
for (const name of notes) console.log(`  ${name}`);

if (confirmed) {
  moveToTrash(notes);
  cpSync(SAMPLE, vault, { recursive: true });
  console.log(`Copied the sample notes from ${SAMPLE}`);
  printNextSteps();
} else {
  console.log('Notes unchanged. To replace them with the sample notes, run: npm run sandbox -- --yes');
}

function installPlugin() {
  // The folder is the plugin's id in manifest.json. BRAIN_VAULT and the brain-sandbox Trash folder keep their names.
  const target = join(vault, '.obsidian', 'plugins', 'ninja-board');
  mkdirSync(target, { recursive: true });
  for (const file of PLUGIN_FILES) copyFileSync(join(PLUGIN, file), join(target, file));
  console.log(`Installed ${PLUGIN_FILES.join(', ')} in ${target}`);
}

function moveToTrash(names) {
  mkdirSync(dirname(trash), { recursive: true });
  // Not recursive: a second run in the same second fails here instead of overwriting the first run's notes.
  mkdirSync(trash);
  for (const name of names) renameSync(join(vault, name), join(trash, name));
}

/** Local time as YYYYMMDD-HHMMSS. */
function stamp(d) {
  const two = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
  return `${date}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

function printNextSteps() {
  console.log(`
Next steps in Obsidian:
  1. Settings → Community plugins → enable Ninja Board. If it isn't listed, reload with Cmd+R.
  2. Settings → Tasks → Task Statuses → add a custom status:
     symbol w, name Waiting, next status x, type ON_HOLD.
     In the same settings, Task Format must be Dataview.
  3. Open 01 Dashboard/01 Today.
  4. Settings → Files & links → Default file to open → 01 Dashboard/01 Today.`);
}
