# TypeScript

This repo uses a "type-stripping" approach to TypeScript. Source files are
authored in `.ts` with only erasable type syntax (no `enum`, `namespace`,
`const enum`, or parameter properties). This lets the same source work:

- **At development time** — imported directly as `.ts` (via a type-stripping
  loader or Node's built-in `--experimental-strip-types`)
- **At publish time** — converted to `.js` by stripping type annotations

## Authoring `.ts` source

Write TypeScript using only syntax that can be erased without changing runtime
semantics. This means:

- Type annotations, interfaces, type aliases — all fine
- `import type` / `export type` — fine
- `enum`, `namespace`, `const enum`, parameter properties — **not allowed**
  (these require emit-time transformation, not just erasure)

See the
[ts-blank-space unsupported syntax list](https://github.com/bloomberg/ts-blank-space/blob/main/docs/unsupported_syntax.md)
for the full set of restrictions.

### Import specifiers

In `.ts` source files, import other `.ts` files using `.ts` specifiers:

```ts
import { foo } from './foo.ts';
import type { Bar } from './types.ts';
```

At pack time these specifiers are automatically rewritten to `.js` for the
published tarball by [ts-node-pack](https://github.com/turadg/ts-node-pack).

## Build

### The `emitDeclarationOnly` constraint

The repo-wide `tsconfig-build-options.json` sets `emitDeclarationOnly: true`.
This means `tsc` only generates `.d.ts` declaration files, not `.js` runtime
files. This is intentional because:

1. Most source files are `.js` with JSDoc annotations (not `.ts`) — this is
   the legacy state being migrated from
2. We don't use a separate `dist/` output directory to avoid requiring a build
   watcher during development
3. Without `emitDeclarationOnly`, `tsc` would try to write `.js` output for
   `.js` input files, causing errors like:
   ```
   error TS5055: Cannot write file 'src/foo.js' because it would overwrite input file.
   ```

## Packing

Publishable tarballs are built by [ts-node-pack][]. It runs out-of-tree —
nothing in the working copy is mutated — and is driven from the repo root by
`yarn pack:all`, which writes every public workspace's `.tgz` into `dist/`.
`yarn release:npm` wraps that step and `npm publish`-es each tarball in turn,
replacing the previous `lerna publish from-package` flow.

[ts-node-pack]: https://github.com/turadg/ts-node-pack

For each package ts-node-pack:

1. Copies the `npm-packlist` into a temp staging directory (same file-set
   that `npm pack` would produce).
2. If the package has `.ts` sources, runs `tsc` with a derived config to
   emit `.d.ts` files alongside the staged `.js`.
3. Strips types from staged `.ts` / `.mts` files via
   [`ts-blank-space`](https://bloomberg.github.io/ts-blank-space/) and renames
   them to `.js` / `.mjs`. Line and column positions are preserved, so no
   sourcemaps are needed for debugging.
4. Rewrites relative `.ts` import specifiers to `.js` in the emitted `.js`
   and `.d.ts` files (`from './foo.ts'` → `from './foo.js'`,
   `import('./foo.ts')`, `declare module './foo.ts'`,
   `<reference path="./foo.ts" />`).
5. Rewrites `package.json`: `main` / `module` / `types` / `bin` / `exports` /
   `files` get their `.ts` entries flipped to `.js` + `.d.ts`,
   `workspace:` protocol specifiers in dependencies get resolved to concrete
   version ranges, and `devDependencies` / `scripts` are stripped.
6. Validates that no `.ts` specifiers remain anywhere in the staged tree.
7. Runs `npm pack` inside the staging directory and writes the resulting
   `.tgz` to `dist/`.

Pure JS+JSDoc packages skip step 2 and ship their `.js` sources verbatim —
the same tarball `npm pack` would have produced before ts-node-pack, just
with `workspace:` specifiers resolved.

### Migration path

Packages are being migrated from `.js` (with JSDoc type annotations) to
`.ts` incrementally. The steps for each package:

1. Rename `.js` source files to `.ts` and convert JSDoc annotations to
   TypeScript syntax.
2. Update import specifiers from `.js` to `.ts`.
3. Run `yarn pack:all` and spot-check the resulting `dist/<name>-*.tgz`.

No per-package `prepack`/`postpack` wiring is required; ts-node-pack handles
the whole pipeline at the repo level.

## Exported types

For packages that need to export types to consumers:

- Use `.ts` files for modules defining exported types
- Package entrypoints export explicit types
- Use `/** @import */` comments (in `.js` files) or `import type` (in `.ts`
  files) to import types without runtime module loading

### The `types-index` pattern (legacy)

Some packages still use the `types-index` pattern from before `.ts` source was
supported:

**types-index.js** (empty twin):
```js
export {};
```

**types-index.d.ts**:
```ts
export type * from './src/types.js';
```

This pattern is being replaced by direct `.ts` exports as packages migrate.
