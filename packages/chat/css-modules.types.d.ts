// Ambient declarations for CSS side-effect imports.
//
// `main.js` imports the stylesheets that sibling space packages export (e.g.
// `@endo/space-whylip/whylip.css`). These imports are Vite-only — the bundler
// inlines the CSS — but `tsc` needs a module declaration so the side-effect
// imports type-check. There are no named bindings; the modules exist purely for
// their styling side effect.
//
// Named with the `*.types.d.ts` convention so it is tracked by git (plain
// `*.d.ts` files are git-ignored as generated output; see the root .gitignore).

declare module '*.css';
