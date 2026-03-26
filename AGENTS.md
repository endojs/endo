# Agent Instructions for endo

This file provides conventions and constraints for AI agents working in this repository.

## Repository structure

- Monorepo managed with Yarn workspaces
- Packages live in `packages/`
- Tests use `ava` (runtime) and `tsd` (types)
- Linting: `eslint` with project-specific rules; run `yarn lint` per-package

## TypeScript usage

Our TypeScript conventions accommodate `.js` development (this repo) and `.ts` consumers (e.g. agoric-sdk). See [agoric-sdk/docs/typescript.md](https://github.com/Agoric/agoric-sdk/blob/master/docs/typescript.md) for full background.

### No `.ts` in runtime bundles

Never use `.ts` files in modules that are transitively imported into an Endo bundle. The Endo bundler does not understand `.ts` syntax. We avoid build steps for runtime imports.

### `.ts` files are for type definitions only

Use `.ts` files to define exported types. These are never imported at runtime. They are made available to consumers through a `types-index` module.

When a `.ts` file contains runtime code (e.g. `type-from-pattern.ts` with `declare` statements), it still produces only `.d.ts` output — the `declare` keyword ensures no JS is emitted. Actual runtime code belongs in `.js` files.

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

The repo-wide `tsconfig-build-options.json` sets `emitDeclarationOnly: true`. `tsc` only generates `.d.ts` files, not `.js`. This means `.ts` files with runtime code (not just types) would need `build-ts-to-js` or equivalent — which this repo does not currently have. Keep `.ts` files type-only.

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

## Commit conventions

- Use conventional commits: `feat(pkg):`, `fix(pkg):`, `refactor(pkg):`, `chore:`, `test(pkg):`
- Breaking changes: `feat(pkg)!:` or `fix(pkg)!:`
- File conversions (`.js` to `.ts`) get their own `refactor:` commit
