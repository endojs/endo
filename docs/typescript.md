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

During `prepack`, these specifiers are automatically rewritten to `.js` for the
published package (see [Rewriting import specifiers](#rewriting-import-specifiers)).

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

### When `.ts` files have runtime code

Some `.ts` files contain actual runtime code (functions, constants) rather than
just type definitions. These files need corresponding `.js` files when published
to npm.

Since `tsc` won't generate `.js` files (due to `emitDeclarationOnly`), we use
`build-ts-to-js` to strip types and produce `.js` files.

### Using `build-ts-to-js`

The `build-ts-to-js` script (in `scripts/packing/`) uses
[`ts-blank-space`](https://bloomberg.github.io/ts-blank-space/) to transform
`.ts` files into `.js` by replacing type annotations with whitespace. This
preserves line numbers (no source maps needed) and is very fast.

## Packing scripts

All packing logic lives in `scripts/packing/` with root-level yarn script
aliases. Packages opt in with:

```json
{
  "scripts": {
    "prepack": "yarn run -T prepack-package",
    "postpack": "yarn run -T postpack-package"
  }
}
```

### `prepack-package`

Runs automatically before `npm pack` (and therefore before `npm publish`).
Performs these steps in order:

1. **`tsc --build tsconfig.build.json`** — generates `.d.ts` declaration files.
   Must run before `build-ts-to-js` because if both `.ts` and `.js` exist for
   the same module, tsc fails with "would be overwritten by multiple input
   files".

2. **`build-ts-to-js`** — finds all `.ts` files in `src/` (excluding `.d.ts`)
   and generates corresponding `.js` files by stripping type annotations.
   No-op if no `.ts` files exist.

3. **Rewrite `.ts` import specifiers** — rewrites `from './foo.ts'` to
   `from './foo.js'` in all `.js`, `.mjs`, `.cjs`, and `.d.ts` files. Tracks
   which files were modified in `.pack-rewrite-files.txt` so `postpack` can
   restore them.

If `tsconfig.build.json` has an `outDir`, step 2 is skipped because tsc
handles the full build (source stays in `src/`, output goes to `outDir`).

### `postpack-package`

Runs automatically after `npm pack` completes. Cleans up the prepack
modifications:

1. **`git checkout -- *.ts`** — restores `.ts` files to their pre-prepack state
   (undoing import specifier rewrites)
2. **Restore rewritten files** — reads `.pack-rewrite-files.txt` and runs
   `git checkout` on each file to undo import specifier rewrites
3. **`git clean -f`** — removes generated untracked files (`.d.ts`, `.d.ts.map`,
   generated `.js` siblings)

### Rewriting import specifiers

The `rewrite-ts-import-specifiers` script handles the gap between development
and publishing:

- **Development**: code imports `./foo.ts` directly
- **Published**: code must import `./foo.js` (Node.js resolves `.js` at runtime)

The script rewrites specifiers in these patterns:
- `from './foo.ts'` → `from './foo.js'`
- `import('./foo.ts')` → `import('./foo.js')`
- `require('./foo.ts')` → `require('./foo.js')`
- `declare module './foo.ts'` → `declare module './foo.js'`
- `<reference path="./foo.ts" />` → `<reference path="./foo.js" />`

It skips `.d.ts`, `.mts`, and `.d.mts` specifiers (these are not rewritten).

### Why not two `tsc` passes?

An alternative would be using two tsconfig files: one with `allowJs: false` to
emit `.js` only for `.ts` files, and another for declarations. This was
rejected because:

- Requires careful management of `allowJs`/`include`/`exclude` to avoid
  conflicts
- More complex to maintain and understand
- The `build-ts-to-js` approach is simpler: one tool for `.js`, one for `.d.ts`

## Migration path

Packages are being migrated from `.js` (with JSDoc type annotations) to `.ts`
incrementally. The steps for each package:

1. Add `"prepack": "yarn run -T prepack-package"` and
   `"postpack": "yarn run -T postpack-package"` to `package.json` scripts
2. Rename `.js` source files to `.ts` and convert JSDoc annotations to
   TypeScript syntax
3. Update import specifiers from `.js` to `.ts`
4. Verify with `yarn prepack` / `yarn postpack` that the pack cycle works

The packing scripts handle both states gracefully — packages with no `.ts`
files just get the `tsc` declaration build as before.

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
