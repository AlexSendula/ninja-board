# Environment

> Last updated: 19 October 2026 (Ninja Board v1.1.0)

## Overview

Ninja Board is an Obsidian plugin. To run it, a vault needs Obsidian, the Bases core plugin and the Tasks community plugin set up as described below. To build and test it, you need Node 24 and npm. Ninja Board has one environment variable, `BRAIN_VAULT`, which only the sandbox script reads. It reads no secrets.

## Environment variables

| Variable | Read by | What it is | Default |
|---|---|---|---|
| `BRAIN_VAULT` | [sandbox.mjs](../scripts/sandbox.mjs), line 15 | The sandbox vault that `npm run sandbox` installs into and resets | `~/Documents/Obsidian Vault` |

- The script stops, changing nothing, unless the folder holds an `.obsidian` folder ([sandbox.mjs](../scripts/sandbox.mjs), line 19). Set `BRAIN_VAULT` to the sandbox vault, never to your own vault. For example: `BRAIN_VAULT=/path/to/sandbox-vault npm run sandbox`.
- The plugin itself reads no environment variable.
- The date tests set `process.env.TZ` to `Europe/Amsterdam` themselves ([dates.test.ts](../src/model/dates.test.ts), line 12), so they don't depend on the machine's zone.

## Requirements

| Requirement | Version | Why |
|---|---|---|
| Node.js | 24 or newer (`engines` in [package.json](../package.json)) | The tests and scripts run the TypeScript sources directly, through Node's type stripping |
| npm | The one that ships with Node 24 | Installs the development dependencies from `package-lock.json` |
| Obsidian | 1.10.2 or newer (`minAppVersion`) | The Bases view API that Ninja Board registers its views with |
| Bases (core plugin) | Ships with Obsidian | Draws the views. Without it, Ninja Board shows a Notice and no views |
| Tasks (community plugin) | Built and checked against Tasks 8.5.0 (the version in the sandbox vault); Ninja Board needs its `apiV1.executeToggleTaskDoneCommand` | Ticking a task line. Ninja Board reads Tasks' saved settings for the Guide's check |

The plugin has no runtime dependencies. Its only `import` from outside its own code is `obsidian`, which Obsidian provides at runtime ([main.ts](../src/main.ts)).

## Obsidian and plugins

Set these up once, in the sandbox vault and in every vault that uses Ninja Board.

1. **Bases.** Settings → Core plugins → turn on Bases.
2. **Ninja Board.** Settings → Community plugins. Turn on community plugins if they are off, then turn on Ninja Board. Reload Obsidian (Cmd+R) if Ninja Board isn't listed.
3. **Tasks, Task Format.** Settings → Tasks → Task Format → **Dataview**. Ninja Board reads only Dataview fields (`[due:: …]` and so on), so other formats don't work.
4. **Tasks, a Waiting status.** Settings → Tasks → Task Statuses → add a custom status: symbol `w`, name `Waiting`, next status symbol `x`, status type `ON_HOLD`. Ninja Board's waiting tasks are `[w]` lines.
5. **The start page (optional).** Settings → Files & links → Default file to open → `01 Dashboard/01 Today`.

The Guide's **Setup** tile checks steps 2 to 4 and says what to change. Its lines are described in [Troubleshooting](TROUBLESHOOTING.md#the-guides-setup-tile).

Task statuses in Tasks' own terms: `[ ]` is TODO, `[/]` IN_PROGRESS, `[w]` ON_HOLD, `[x]` DONE and `[-]` CANCELLED. The formats are in [Database](DATABASE.md#task-lines).

## Files that describe the plugin

| File | What it holds |
|---|---|
| [manifest.json](../manifest.json) | `id` `ninja-board`, `name`, `version` `1.1.0`, `minAppVersion` `1.10.2`, `description`, `author`, and `isDesktopOnly` `false`. The `id` is the folder name Obsidian uses under `.obsidian/plugins/`. |
| [versions.json](../versions.json) | Each plugin version mapped to the minimum Obsidian version it needs: `"0.1.0": "1.10.2"`, `"0.2.0": "1.10.2"`, `"1.0.0": "1.10.2"`, `"1.0.1": "1.10.2"`, `"1.0.2": "1.10.2"`, `"1.0.3": "1.10.2"`, `"1.0.4": "1.10.2"` and `"1.1.0": "1.10.2"`. |
| [package.json](../package.json) | Name `ninja-board`, version `1.1.0`, `author` `AlexSendula`, `license` `MIT`, `"private": true` (npm won't publish it), `"type": "module"`, `engines`, and the scripts. |
| [esbuild.config.mjs](../esbuild.config.mjs) | Bundles `src/main.ts` to `main.js` (CommonJS, ES2022). Obsidian, Electron and the CodeMirror and Lezer packages stay external. Source maps are inline in development and off in production. It also bundles the preview to `preview/dist/preview.js`. |
| [tsconfig.json](../tsconfig.json) | Strict TypeScript, no emit. Covers `src`, `test` and `preview`. |
| [styles.css](../styles.css) | The plugin's styles. It uses Obsidian's CSS variables, so Ninja Board follows the user's theme. |
| [eslint.config.mjs](../eslint.config.mjs) | The lint rules: Obsidian's recommended review rules, with no options of ours. `npm run lint` runs them over `src` and `preview`. |
| [.gitignore](../.gitignore) | Leaves out `node_modules/`, `main.js`, `preview/dist/`, `preview/sample.json` and `.DS_Store`. |

Development dependencies, all in [package.json](../package.json):

| Package | Version | Used for |
|---|---|---|
| esbuild | 0.28.2 | Bundling `main.js` and the preview |
| typescript | 5.9.3 | `npm run typecheck` |
| obsidian | 1.14.4 | Type declarations. Obsidian supplies the code at runtime |
| linkedom | 0.18.13 | A DOM for the UI tests |
| yaml | 2.9.1 | Reads the sample vault's frontmatter in the tests and the preview |
| @types/node | 24.19.2 | Node types for the scripts and tests |
| @eslint/js | 9.39.5 | ESLint's JavaScript rules, kept at ESLint's version |
| eslint | 9.39.5 | `npm run lint` |
| eslint-plugin-obsidianmd | 0.4.2 | Obsidian's review rules, for `npm run lint` |
| typescript-eslint | 8.71.2 | TypeScript support for ESLint |

## Where it runs

- **Obsidian on desktop and mobile.** The code uses no Node or Electron API, and `isDesktopOnly` is `false`. The design lists the phone app as a target ([plugin design, section 2](design/2026-10-13-brain-plugin-design.md)).
- **The sandbox script is macOS only.** It moves notes to `~/.Trash`, the macOS Trash ([sandbox.mjs](../scripts/sandbox.mjs), line 29).
- **The preview runs in a browser** on the build machine, from `127.0.0.1:8766`. See [Deployment](DEPLOYMENT.md#preview).

## Secrets

There are none. The code and config hold no API keys, tokens or passwords. The values Ninja Board handles are the vault's notes, the vault path in `BRAIN_VAULT`, and Tasks' saved settings, which Ninja Board reads for the Guide and doesn't store.

## Related Documentation

- [Deployment](DEPLOYMENT.md): building and installing
- [Database](DATABASE.md): the note format Ninja Board reads
- [Troubleshooting](TROUBLESHOOTING.md): what to check when a view or tick doesn't work
