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

This is the same "erasable syntax only" subset that Node's built-in type
stripping (powered by [amaro](https://github.com/nodejs/amaro)) accepts. See
the [Node.js TypeScript docs](https://nodejs.org/api/typescript.html) for the
full set of restrictions.

### Import specifiers

In `.ts` source files, import other source files using `.ts` specifiers — but
**only for relative imports** within the same package, or another workspace
package in this repo:

```ts
import { foo } from './foo.ts';
import type { Bar } from './types.ts';
```

At pack time these specifiers are automatically rewritten to `.js` for the
published tarball by [ts-node-pack](https://github.com/turadg/ts-node-pack).

Do **not** reach into another package by a `.ts` specifier across a published
boundary (e.g. `import … from '@endo/foo/src/bar.ts'`). Node.js refuses to
load `.ts` resolved under `node_modules`, so that breaks for consumers — and
also for this repo once the dependency is consumed as a published package.
Cross-package imports must go through the package's normal `.js` entrypoint.

### Package entrypoints stay `.js`

A package's entrypoint (its `main` / `exports` target) must be a `.js` file in
source, because consumers — and Node.js generally — resolve it from
`node_modules`, where `.ts` is not loadable. Keep the entrypoint a `.js`
file that imports the `.ts` implementation by relative specifier:

```js
// index.js — published entrypoint
export * from './src/index.ts';
```

`.ts` entrypoints are intentionally out of scope for now. Letting a package's
public entry be `.ts` would require resolving `.ts` across package boundaries
(which Node.js forbids under `node_modules`) plus lint rules and specifier
rewriting to keep cross-package imports same-repo-only. Until that machinery
exists, every entrypoint is a `.js` file and every `.ts` import is relative.

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
3. Strips types from staged `.ts` / `.mts` files (erasure only) and renames
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

As packages migrate, this pattern is replaced by authoring types in `.ts`
source and re-exporting them through the package's `.js` entrypoint (`.ts`
files cannot themselves be entrypoints — see above).
