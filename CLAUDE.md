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
- Cast `catch` error variables: `/** @type {Error} */ (e).message`
- Cast untyped inputs from external APIs with inline `/** @type {T} */` assertions.

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
- Use `makeExo()` with an `M.interface()` guard definition for exo objects.
- Use `Far()` for far-reference objects.
- The `help()` method is conventional on capabilities and should return a descriptive string.

### Eventual send

- Always use `E(ref).method()` for remote/eventual calls, never direct invocation.
- `E()` calls return promises; chain with `await` or further `E()` sends.

## ESLint

- The project uses `plugin:@endo/internal` which extends `prettier`, `plugin:@jessie.js/recommended`, and `plugin:@endo/strict`.
- This enforces harden-exports, restricts plus operands, and requires PascalCase for interfaces.

## Build and Test

- Yarn 4 via corepack: `npx corepack yarn install`
- Package tests: `cd packages/<name> && npx ava`
- Daemon integration tests: `cd packages/daemon && npx ava test/endo.test.js --timeout=120s`
- Syntax check without SES runtime: `node --check <file.js>`
- Full module loading requires the Endo daemon (SES lockdown provides `harden` as a global).

## Package Structure

- Monorepo with `packages/` workspace layout.
- Workspace dependencies use `"workspace:^"` version specifiers.
- Each package has its own `tsconfig.json` and `tsconfig.build.json`.
- No copyright headers in source files; license is declared in `package.json`.
