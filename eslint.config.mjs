import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

// What Obsidian's review reads: the plugin (src/, main.ts) and the browser preview, under the review's recommended rules with no
// options of ours. Tests run under Node's test runner, which imports node:test and the rest, and they are never shipped, so they
// are not linted. preview/dist is the built bundle.
export default defineConfig([
  { ignores: ['preview/dist/**', '**/*.test.ts'] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.*'],
        },
      },
    },
  },
]);
