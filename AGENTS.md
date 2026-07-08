# Agent Instructions for endo

This file provides conventions and constraints for AI agents working in this repository.

## Repository structure

- Monorepo managed with Yarn workspaces
- Packages live in `packages/`
- Workspace dependencies use `"workspace:^"` version specifiers.
- Each package has its own `tsconfig.json` and `tsconfig.build.json`.
- Tests use `ava` (runtime) and `tsd` (types)
- Linting: `eslint` with project-specific rules; run `yarn lint` per-package
- No copyright headers in source files; license is declared in `package.json`.

## Hardened JavaScript (SES) conventions

### `harden()` is mandatory

- Every named export MUST have a corresponding `harden(exportName)` call
  immediately after the declaration.
  This is enforced by the `@endo/harden-exports` ESLint rule.
- Objects returned from factory functions should be hardened:
  `return harden({ ... })`.
- Module-level constant data structures (arrays, objects) should be hardened at
  declaration: `const foo = harden([...])`.

### Modernisms

- Prefer `{ __proto__: Proto }` over `Object.create(Proto)` when all you want
  is a syntactic prototype link.
  The former depends only on syntax; the latter depends on the current binding
  of `Object.create`.
- Prefer `Uint8Array` + `TextEncoder`/`TextDecoder`/`atob`/`btoa` over Node
  `Buffer`.
  `Buffer` is Node-only; the others are portable across XS, browsers, and SES
  realms.

### Error handling

- Use `@endo/errors` for structured errors:
  `import { makeError, q, X } from '@endo/errors'`.
- Use `q()` to safely quote values in error messages.
- Use tagged template errors where appropriate:
  `throw makeError(X\`No formula for ${ref}\`)`.

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

Every `.js` source file must start with `// @ts-check`.
Use `@param`, `@returns`, `@typedef`, and `@type` annotations throughout.
Prefer `@import` over dynamic `import()` in type positions.
Use `/** @import { Foo } from './bar.js' */` at the top of the file instead of
inline `/** @type {import('./bar.js').Foo} */`.
Cast `catch` error variables before reading error properties:
`/** @type {Error} */ (e).message`.
Cast untyped inputs from external APIs with inline `/** @type {T} */`
assertions.

### Type-assertion discipline

Before reaching for `/** @type {T} */ (v)` or `@ts-expect-error`, try type
narrowing, an additional overload, or an `assertXxx` helper that returns the
refined type.
`@ts-expect-error` is brittle because it flips to an error as soon as the
upstream types improve.

For strings that have been validated (pet names, name paths, formula ids, file
URLs), prefer a branded return type from the validator over raw `string` in the
rest of the code.
This pushes assertions to the boundary where they are cheap and makes
downstream sites check-free.

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

## Code style

### Imports

Group imports: external `@endo/*` packages first, then local imports, separated
by a blank line.
Sort imports within each group.
Prefer named imports from Node built-ins and other modules, especially when a
file needs only one capability.
Example: `import { stat } from 'node:fs/promises';` over `import * as fs from 'fs';` and `fs.promises.stat()`

### Modules and exports

Unconfined guest modules export `make(powers)` as their entry point.
Prefer `makeExo()` with an `M.interface()` guard over `Far()` for remotable
objects.
`makeExo` automatically provides `__getMethodNames__()`, which CapTP
introspection relies on, and enforces method guards at the boundary.
`Far()` is still appropriate for lightweight one-off remotables that do not need
runtime type checking.
The `help()` method is conventional on capabilities and should return a
descriptive string.

### Eventual send

Always use `E(ref).method()` for remote/eventual calls, never direct
invocation.
`E()` calls return promises; chain with `await` or further `E()` sends.

### CapTP introspection

Use `E(ref).__getMethodNames__()` to discover a remote object's interface rather
than duck-typing by calling individual methods.
Duck-typing generates noisy failed CapTP calls for each method that does not
exist on the target.
`makeExo` objects provide `__getMethodNames__()` automatically.

```js
const methods = await E(ref).__getMethodNames__();
if (methods.includes('followNameChanges')) {
  // NameHub — live registry
} else if (methods.includes('list')) {
  // ReadableTree — immutable snapshot
}
```

## ESLint

The project uses `plugin:@endo/internal` which extends `prettier`,
`plugin:@jessie.js/recommended`, and `plugin:@endo/strict`.
This enforces harden-exports, restricts plus operands, and requires PascalCase
for interfaces.

## Commands

- Install dependencies with `corepack yarn install`.
  CI enables Corepack shims before running an immutable Yarn install; use the
  direct Corepack form in locked-down shells that cannot write global shims.
- Run `yarn format` at the root to apply Prettier to `.github` and `packages`.
- Run root lint with `yarn lint` when the change is cross-cutting.
  Root lint runs Prettier, repository ESLint, and shell checks; it does not run
  typechecking.
- Run package lint with `yarn workspace <pkg-name> lint` or
  `yarn --cwd packages/<name> lint`.
  Package lint usually runs `lint:types` and `lint:eslint`; check the package
  scripts when the distinction matters.
- Run typechecking with `yarn lint:types` in the changed package, or
  `yarn build:types` at the root when exported declarations or cross-package
  types may have changed.
- Run `yarn docs` at the root when API docs or exported type surfaces may have
  changed.
  This is a CI gate, including for documentation-only PRs, and catches broken
  `@import` specifiers, missing exported members, and cross-package type drift.
- Run package tests from the root with
  `yarn workspace <pkg-name> test <file>`, or equivalently with
  `yarn --cwd packages/<name> test <file>`.
  Test timeouts are configured per package; do not add ad-hoc AVA timeout
  overrides unless you are deliberately changing that package's test behavior.

Full module loading may require the Endo daemon because SES lockdown provides
`harden` as a global.

### Pre-PR checklist

Reviewers repeatedly flag the same classes of fix-up.
Running the following before pushing avoids the churn:

- The relevant commands from the Commands section above.
  At minimum, format, package lint, typechecking, and the nearest package tests.
- Root `yarn docs` when public API docs or exported type surfaces may have
  changed.
- If the change adds or updates a dependency, commit `yarn.lock` in its own
  commit, separately from the `package.json` change, with the message
  `chore: Update yarn.lock`.
  A separate lock-file commit can be dropped and regenerated cleanly on rebase;
  a combined commit turns lock-file churn into merge conflicts.

### Lint-rule gotchas

- Do **not** rename "intentionally unused" identifiers with a leading
  underscore.
  This conflicts with `no-underscore-dangle`.
  Use `// eslint-disable-next-line no-unused-vars` instead, or delete the unused
  declaration.
- `/** @type {T} */` binds to the next declaration, not the enclosing block.
  When refactoring, keep the tag adjacent to the thing it annotates; hoisting a
  local above its type comment silently retypes the local.

### Testing with AVA

- Register a teardown for every resource a test acquires:
  `t.teardown(() => cleanup())` for `fs.mkdtemp`, forked processes, opened
  ports, spawned daemons.
  Leaked temp directories and daemons are the usual cause of local-only flakes.
- Put an explicit `t.timeout(...)` on any test guarding a deadlock, hang, or
  stall regression, so CI fails fast rather than waiting for the global AVA
  timeout.
- Prefer `t.throwsAsync(fn, { message: /.../, instanceOf: X })` over bare
  `t.throws`/`try/catch`.
  The regex form gives a usable failure message when the guard regresses.
- Prefer inline assertions (`t.is`, `t.deepEqual`, `t.like`) over `t.snapshot`
  when the expected value is small enough to fit in the test file.
  Snapshots are appropriate for large structured output where the volume of
  assertions would obscure the intent.
- Gateway, daemon, and fork-based tests must be `test.serial` because they fork
  a full daemon per test and share filesystem state.

### Diagnostic discipline

Libraries should be silent by default.
Do not use `console.log` from library code.
Use `console.error` for diagnostics so output lands on stderr and does not
interleave with a caller's stdout.
When rendering a passable value for a log message, use `passableAsJustin` from
`@endo/marshal` rather than `JSON.stringify`, which produces ambiguous output
for remotables and promises.

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
Run `yarn clean` instead of `yarn build:types:clean` to reset in this case:
`yarn build:types:clean` only runs TypeScript's project-reference clean, so it
does not remove stale declaration files that TypeScript has started treating as
inputs.

## Markdown style

- Wrap lines at 80 to 100 columns.
- Start each sentence on a new line so that diffs are per-sentence.
- See `CONTRIBUTING.md` § "Markdown Style Guide" for full details.

## Commit conventions

- Use conventional commits: `feat(pkg):`, `fix(pkg):`, `refactor(pkg):`, `chore:`, `test(pkg):`
- Breaking changes: `feat(pkg)!:` or `fix(pkg)!:`
- File conversions (`.js` to `.ts`) get their own `refactor:` commit

## Pull requests

- When merging a pull request, **rebase** (rebase-and-merge) by default.
- Do **not** squash-merge, and do not create a merge commit, unless the pull
  request author explicitly asks for that method.
- If the intended merge method is unclear, confirm it before merging.

## Thunk modules

A "thunk module" is a top-level `.js` file in a package whose only purpose is to re-export from one or more deeper files (e.g. `./src/foo.js`).  Thunk modules exist for two reasons:

1. **`exports`-map portability.**  The `package.json` `"exports"` property is not supported by every Node.js version we still target.  A physical file at the path `consumers will import` is the fall-through resolution under the legacy directory-walk algorithm: `import '@endo/foo/bar.js'` resolves to `node_modules/@endo/foo/bar.js` when `exports` is unrecognized.  The `"main"` property by contrast is honored by every Node.js version, so a single primary entry point can point directly at `./src/foo.js` without a thunk.

2. **Public-interface filtering.**  When a `src/` file exports both public and internal symbols (e.g. test-only primitives needed for known-answer cross-checks), a top-level thunk module that re-exports only the public subset gives the package a stable public surface.  In-package tests can still reach internals via relative imports; external callers cannot.

When neither reason applies — a package has only one `exports` entry, OR the `src/` file already exports exactly the public surface — the thunk module is superfluous and can be deleted in favor of pointing `package.json` `"main"` (and `"exports"`) at `./src/foo.js` directly.

When auditing thunk modules:

- If the thunk re-exports `*` (or every named export) from `./src/foo.js`, consider deleting it and pointing `main`/`exports` at `./src/foo.js` directly.
- If the thunk re-exports a strict subset, document the filtering intent in a comment at the top of the file so future maintainers understand why the indirection is load-bearing.
