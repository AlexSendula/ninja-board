import esbuild from 'esbuild';

// "production" builds once, "preview" builds the browser harness once, no argument watches.
const mode = process.argv[2] ?? 'dev';

const plugin = {
  entryPoints: ['src/main.ts'],
  outfile: 'main.js',
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  // Obsidian provides these at runtime.
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  sourcemap: mode === 'production' ? false : 'inline',
  logLevel: 'info',
};

const preview = {
  entryPoints: ['preview/preview.ts'],
  outfile: 'preview/dist/preview.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
};

if (mode === 'production') {
  await esbuild.build(plugin);
} else if (mode === 'preview') {
  await esbuild.build(preview);
} else {
  const ctx = await esbuild.context(plugin);
  await ctx.watch();
}
