// The browser preview imports the mockup's markup as text (esbuild's text loader, set in esbuild.config.mjs).
declare module '*.html' {
  const text: string;
  export default text;
}
