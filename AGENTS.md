# Agent Instructions for endo

This file provides conventions and constraints for AI agents working in this repository.

## Repository structure

- Monorepo managed with Yarn workspaces
- Packages live in `packages/`
- Tests use `ava` (runtime) and `tsd` (types)
- Linting: `eslint` with project-specific rules; run `yarn lint` per-package

## TypeScript usage

Our TypeScript conventions accommodate `.js` development (this repo) and `.ts` consumers (e.g. agoric-sdk). See [agoric-sdk/docs/typescript.md](https://github.com/Agoric/agoric-sdk/blob/master/docs/typescript.md) for full background.

### `.ts` source with erasable syntax

`.ts` files may contain runtime code, provided it uses only **erasable** type syntax (no `enum`, `namespace`, `const enum`, or parameter properties). Types are stripped — natively by Node.js ≥22 at dev/test time, and at pack time by [ts-node-pack](https://github.com/turadg/ts-node-pack) for the published `.js`. See [`docs/typescript.md`](docs/typescript.md).

Two rules keep this compatible with Node's module resolver:

- **Runtime `.ts` imports must be relative** — same package, or another workspace package in this repo. Node.js will not load `.ts` specifiers resolved under `node_modules`, so never import another published package's source by its `.ts` extension.
- **Package entrypoints must be `.js`** in source, since consumers resolve them from `node_modules`. A `.js` entrypoint may re-export from `.ts` (e.g. `no-shim.js` containing `export * from './E.ts'`).

A `.ts` file may instead be type-only (e.g. `type-from-pattern.ts` using `declare`), emitting just `.d.ts`. Where each kind of type definition belongs is summarized below.

### The `types-index` convention

Each package that exports types uses a pair of files:

- **`types-index.js`** — Runtime re-exports. Contains `export { ... } from './src/foo.js'` for values that need enhanced type signatures (e.g. `M`, `matches`, `mustMatch`).
- **`types-index.d.ts`** — **Pure re-export index.** Contains only `export type * from` and `export { ... } from` lines. **No type definitions belong here.**

Why: `.d.ts` files are not checked by `tsc` (we use `skipLibCheck: true`). Type definitions in `.d.ts` files silently pass even if they contain errors. Definitions in `.ts` files are checked.

The entrypoint (`index.js`) re-exports from `types-index.js`:
```js
// eslint-disable-next-line import/export
export * from './types-index.js';
```

### Where type definitions go

| What | Where | Why |
|------|-------|-----|
| Interface types, data types | `src/types.ts` | Canonical type definitions |
| Inferred/computed types | `src/type-from-pattern.ts` (or similar `.ts`) | Complex type logic, checked by tsc |
| Value + namespace merges | Same `.ts` file as the namespace | TS requires both in one module for merging |
| `declare function` overrides | `.ts` file alongside related types | Gets type-checked |
| Re-exports only | `types-index.d.ts` | Pure index, no definitions |

### `emitDeclarationOnly`

The repo-wide `tsconfig-build-options.json` sets `emitDeclarationOnly: true`, so `tsc --build` only generates `.d.ts` files. Runtime `.js` for `.ts` sources is produced at pack time by [ts-node-pack](https://github.com/turadg/ts-node-pack), invoked via `yarn pack:all` — see `docs/typescript.md`. `.ts` files may contain runtime code as long as the syntax is erasable (no `enum`, `namespace`, parameter properties).

### Imports in `.js` files

Use `/** @import */` JSDoc comments to import types without runtime module loading:
```js
/** @import { Pattern, MatcherNamespace } from './types.js' */
```

## Exo `this` context

Exo methods receive a `this` context (via `ThisType<>`) that differs between single-facet and multi-facet exos:

| API | `this.self` | `this.facets` | `this.state` |
|-----|-------------|---------------|--------------|
| `makeExo` | ✅ the exo instance | ❌ | ❌ (always `{}`) |
| `defineExoClass` | ✅ the exo instance | ❌ | ✅ from `init()` |
| `defineExoClassKit` | ❌ | ✅ all facets in cohort | ✅ from `init()` |

**Why no `self` on kits?** A kit has multiple facets (e.g. `public`, `admin`), each a separate remotable object. There is no single "self". Use `this.facets.facetName` to access any facet in the cohort.

When writing `ThisType<>` annotations in `types-index.d.ts`:

- Single-facet: `ThisType<{ self: Guarded<M>; state: S }>`
- Multi-facet: `ThisType<{ facets: GuardedKit<F>; state: S }>`

Never mix `self` and `facets` in the same context type.

## Testing

- Runtime tests: `yarn test` (uses `ava`)
- Type tests: `yarn lint:types` (uses `tsd` — test files are `test/types.test-d.ts`)
- Lint: `yarn lint` (runs both `lint:types` and `lint:eslint`)

Always run `yarn lint` in each package you've modified before committing.

## Composite TypeScript build

An opt-in composite TypeScript configuration lets you build or watch
declarations for the entire workspace graph with a single command instead of
running N per-package `tsc --watch` processes:

```sh
yarn build:types        # one-shot build
yarn build:types:watch  # incremental watch (cold start: ~10-30s)
```

The config files are generated — do not edit them by hand:

```sh
yarn build:types:gen    # regenerate tsconfig.composite.json files
yarn build:types:check  # verify generated files are up to date (used in CI)
```

**When to regenerate:** run `yarn build:types:gen` after adding, removing, or
changing the runtime `dependencies`/`peerDependencies`/`optionalDependencies`
of any workspace.

The generator (`scripts/generate-composite-tsconfigs.mjs`) reads
`yarn workspaces list` output and each package's `package.json`.

CI will fail if the generated files drift from what the generator would produce.

**Scope:** the composite build covers packages that have a `tsconfig.build.json`.
Packages without one (e.g. `ses`, which ships hand-rolled `types.d.ts`) are
silently excluded; their types resolve through normal `package.json`
`"types"`/`"exports"` fields as usual.

**Coexistence with `prepack`:** the composite build and per-package
`prepack` both emit `.d.ts` files alongside their `.js` sources. They share
output locations but track build state independently. If you've run `prepack`
for any package and then switch to the composite build (or vice versa), you
may see TS5055 "would overwrite input file" errors caused by stale outputs.
Run `yarn clean` to reset.

## Commit conventions

- Use conventional commits: `feat(pkg):`, `fix(pkg):`, `refactor(pkg):`, `chore:`, `test(pkg):`
- Breaking changes: `feat(pkg)!:` or `fix(pkg)!:`
- File conversions (`.js` to `.ts`) get their own `refactor:` commit

## Thunk modules

A "thunk module" is a top-level `.js` file in a package whose only purpose is to re-export from one or more deeper files (e.g. `./src/foo.js`).  Thunk modules exist for two reasons:

1. **`exports`-map portability.**  The `package.json` `"exports"` property is not supported by every Node.js version we still target.  A physical file at the path `consumers will import` is the fall-through resolution under the legacy directory-walk algorithm: `import '@endo/foo/bar.js'` resolves to `node_modules/@endo/foo/bar.js` when `exports` is unrecognized.  The `"main"` property by contrast is honored by every Node.js version, so a single primary entry point can point directly at `./src/foo.js` without a thunk.

2. **Public-interface filtering.**  When a `src/` file exports both public and internal symbols (e.g. test-only primitives needed for known-answer cross-checks), a top-level thunk module that re-exports only the public subset gives the package a stable public surface.  In-package tests can still reach internals via relative imports; external callers cannot.

When neither reason applies — a package has only one `exports` entry, OR the `src/` file already exports exactly the public surface — the thunk module is superfluous and can be deleted in favor of pointing `package.json` `"main"` (and `"exports"`) at `./src/foo.js` directly.

When auditing thunk modules:

- If the thunk re-exports `*` (or every named export) from `./src/foo.js`, consider deleting it and pointing `main`/`exports` at `./src/foo.js` directly.
- If the thunk re-exports a strict subset, document the filtering intent in a comment at the top of the file so future maintainers understand why the indirection is load-bearing.
