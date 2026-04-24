# Endo Project Guidelines

## Hardened JavaScript (SES) Conventions

### harden() is mandatory

- Every named export MUST have a corresponding `harden(exportName)` call immediately after the declaration. This is enforced by the `@endo/harden-exports` ESLint rule.
- Objects returned from factory functions should be hardened: `return harden({ ... })`.
- Module-level constant data structures (arrays, objects) should be hardened at declaration: `const foo = harden([...])`.

### @ts-check and JSDoc types

- Every `.js` source file must start with `// @ts-check`.
- Use `@param`, `@returns`, `@typedef`, and `@type` annotations throughout.
- Import types with the `@import` JSDoc tag: `/** @import { FarEndoGuest } from '@endo/daemon/src/types.js' */`
- Prefer `@import` over dynamic `import()` in type positions. Use `/** @import { Foo } from './bar.js' */` at the top of the file instead of inline `/** @type {import('./bar.js').Foo} */`.
- Cast `catch` error variables: `/** @type {Error} */ (e).message`
- Cast untyped inputs from external APIs with inline `/** @type {T} */` assertions.

### Type-assertion discipline

- Before reaching for `/** @type {T} */ (v)` or `@ts-expect-error`, try:
  type narrowing, an additional overload, or an `assertXxx` helper that
  returns the refined type.
  `@ts-expect-error` is brittle because it flips to an error as soon as
  the upstream types improve.
- For strings that have been validated (pet names, name paths, formula
  ids, file URLs), prefer a **branded** return type from the validator
  over raw `string` in the rest of the code.
  This pushes assertions to the boundary where they are cheap and makes
  downstream sites check-free.

### Modernisms

- Prefer `{ __proto__: Proto }` over `Object.create(Proto)` when all you
  want is a syntactic prototype link.
  The former depends only on syntax; the latter depends on the current
  binding of `Object.create`.
- Prefer `Uint8Array` + `TextEncoder`/`TextDecoder`/`atob`/`btoa` over
  Node `Buffer`.
  `Buffer` is Node-only; the others are portable across XS, browsers,
  and SES realms.

### Error handling

- Use `@endo/errors` for structured errors: `import { makeError, q, X } from '@endo/errors'`.
- Use `q()` to safely quote values in error messages.
- Use tagged template errors where appropriate: `throw makeError(X\`No formula for ${ref}\`)`.

## Code Style

### Imports

- Group imports: external `@endo/*` packages first, then local imports, separated by a blank line.
- Sort imports within each group.

### Modules and exports

- Unconfined guest modules export `make(powers)` as their entry point.
- Prefer `makeExo()` with an `M.interface()` guard over `Far()` for
  remotable objects.
  `makeExo` automatically provides `__getMethodNames__()`, which CapTP
  introspection relies on, and enforces method guards at the boundary.
  `Far()` is still appropriate for lightweight one-off remotables that
  do not need runtime type checking.
- The `help()` method is conventional on capabilities and should return
  a descriptive string.

### Eventual send

- Always use `E(ref).method()` for remote/eventual calls, never direct
  invocation.
- `E()` calls return promises; chain with `await` or further `E()` sends.

### CapTP introspection

- Use `E(ref).__getMethodNames__()` to discover a remote object's
  interface rather than duck-typing by calling individual methods.
  Duck-typing generates noisy failed CapTP calls for each method that
  does not exist on the target.
- `makeExo` objects provide `__getMethodNames__()` automatically.

```js
const methods = await E(ref).__getMethodNames__();
if (methods.includes('followNameChanges')) {
  // NameHub — live registry
} else if (methods.includes('list')) {
  // ReadableTree — immutable snapshot
}
```

## ESLint

- The project uses `plugin:@endo/internal` which extends `prettier`, `plugin:@jessie.js/recommended`, and `plugin:@endo/strict`.
- This enforces harden-exports, restricts plus operands, and requires PascalCase for interfaces.

## Build and Test

- Yarn 4 via corepack: `npx corepack yarn install`
- Package tests: `cd packages/<name> && npx ava`
- Daemon integration tests: `cd packages/daemon && npx ava test/endo.test.js --timeout=120s`
- Syntax check without SES runtime: `node --check <file.js>`
- Full module loading requires the Endo daemon (SES lockdown provides `harden` as a global).

### Pre-PR checklist

Reviewers repeatedly flag the same classes of fix-up.
Running the following before pushing avoids the churn:

- `yarn format` — Prettier drift is the single most common review nit.
- `yarn lint` in the changed package (and root, if the changes are
  cross-cutting) — catches ESLint-only rules such as `harden-exports`
  and `no-underscore-dangle`.
- `yarn docs` or `tsc --build` — catches missing members on exported
  interfaces, type-too-narrow/too-wide drift, and broken `@import`
  specifiers.
- The package's `npx ava` — at least the tests nearest the change.
- If the change adds or updates a dependency, commit `yarn.lock`
  **in its own commit**, separately from the `package.json` change,
  with the message `chore: Update yarn.lock`.
  A separate lock-file commit can be dropped and regenerated cleanly
  on rebase; a combined commit turns lock-file churn into merge
  conflicts.

### Lint-rule gotchas

- Do **not** rename "intentionally unused" identifiers with a leading
  underscore.
  This conflicts with `no-underscore-dangle`.
  Use `// eslint-disable-next-line no-unused-vars` instead, or delete
  the unused declaration.
- `/** @type {T} */` binds to the **next declaration**, not the
  enclosing block.
  When refactoring, keep the tag adjacent to the thing it annotates;
  hoisting a local above its type comment silently retypes the local.

### Testing with AVA

- Register a teardown for every resource a test acquires:
  `t.teardown(() => cleanup())` for `fs.mkdtemp`, forked processes,
  opened ports, spawned daemons.
  Leaked temp directories and daemons are the usual cause of "works on
  my machine" flakes.
- Put an explicit `t.timeout(...)` on any test guarding a deadlock,
  hang, or stall regression, so CI fails fast rather than waiting for
  the global AVA timeout.
- Prefer `t.throwsAsync(fn, { message: /.../, instanceOf: X })` over
  bare `t.throws`/`try/catch`.
  The regex form gives a usable failure message when the guard regresses.
- Prefer inline assertions (`t.is`, `t.deepEqual`, `t.like`) over
  `t.snapshot` when the expected value is small enough to fit in the
  test file.
  Snapshots are appropriate for large structured output where the
  volume of assertions would obscure the intent.
- Gateway, daemon, and fork-based tests must be `test.serial` —
  they fork a full daemon per test and share filesystem state.

### Diagnostic discipline

- Libraries should be **silent by default**.
  No `console.log` from library code.
- Use `console.error` for diagnostics so output lands on stderr and
  does not interleave with a caller's stdout.
- When rendering a passable value for a log message, use
  `passableAsJustin` from `@endo/marshal` rather than
  `JSON.stringify`, which produces ambiguous output for remotables and
  promises.

## Familiar (Electron shell)

### Testing

- **Unit tests**: `npx ava packages/daemon/test/gateway.test.js packages/daemon/test/formula-identifier.test.js --timeout=90s`
- **Build**: `cd packages/familiar && yarn bundle && yarn package`
- **Lint**: `cd packages/familiar && yarn lint`
- Gateway tests fork a full daemon per test. They must be `test.serial` to avoid resource contention.
- Tests set `ENDO_ADDR=127.0.0.1:0` so the gateway binds to an OS-assigned port, avoiding conflicts with a running daemon on the default port 8920.
- Kill leftover daemon processes between test runs: `pkill -f "daemon-node.*packages/daemon/tmp"` and `rm -rf packages/daemon/tmp/`.
- Worker logs are in `packages/daemon/tmp/<test>/state/worker/<id>/worker.log` — check these when the APPS formula hangs silently.

### Architecture constraints

- The Electron main process must **never** import `@endo/init` or `ses`. SES lockdown freezes Electron internals.
- Unconfined plugins (e.g., `web-server-node.js`) run inside an already-locked-down worker and must **not** import `ses` or `@endo/init` themselves; doing so causes double-lockdown errors.
- Electron Forge requires `electron` in `devDependencies` to detect the version. If it's only in `dependencies`, packaging fails with "Could not find any Electron packages in devDependencies".
- Port 0 (OS-assigned) is falsy in JavaScript. Use `port !== '' ? Number(port) : default` instead of `Number(port) || default`.

## Markdown Style

- Wrap lines at 80 to 100 columns.
- Start each sentence on a new line so that diffs are per-sentence.
- See `CONTRIBUTING.md` § "Markdown Style Guide" for full details.

## Package Structure

- Monorepo with `packages/` workspace layout.
- Workspace dependencies use `"workspace:^"` version specifiers.
- Each package has its own `tsconfig.json` and `tsconfig.build.json`.
- No copyright headers in source files; license is declared in `package.json`.
