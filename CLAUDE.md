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

## Package Structure

- Monorepo with `packages/` workspace layout.
- Workspace dependencies use `"workspace:^"` version specifiers.
- Each package has its own `tsconfig.json` and `tsconfig.build.json`.
- No copyright headers in source files; license is declared in `package.json`.
