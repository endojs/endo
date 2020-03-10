# Introducing SES 0.7

Here are the issues resolved with SES 0.7

## API Changed

- Simpler API based on `lockdown()`, `harden()`, and `Compartment()`

## Issues Resolved

### Security

- Single realm code:
  - Removed the dependency on the [Realms shim](https://github.com/Agoric/realms-shim).
  - Resolve all associated cross-realm leaks.
- Native node modules:
  - Removed the dependency on the [esm package](https://github.com/standard-things/esm).
  - No side-effect dues to `esm` package in tests (esm transpiles code, alters globals, and proxies module namespaces).
- Refactored whitelist of intrinsics.
  - Easier maintainability:
    - Simpler two-level map.
    - Implemented closer to how the ES262 standard is written.
  - More complete:
    - Added missing %RegExpStringIteratorPrototype%.
    - Added missing %FunctionPseudoConstructor%.
    - Test `prototype`, `__proto__`, and `constructor` properties.

### Completeness

- Whitelist on intrinsics runs last:
  - Detect errors in shims.

### Testing

- More unit tests.
- Added test262 runner packages:
  - Declarative test selection.
  - Used by many packages.
- Migrated from `tape` to `tap`: 
  - Better count of test skipped.
  - More stable for large test runs (no tests silently dropped).
  - Parallelization.
  - Test suites run in separate realms.
- Added eslint rules
  - Define global globalThis, non-writable
  - Error on unused ad-hoc rules

### Development

- Monorepo:
  - Based on yarn wokspaces + Lerna.
  - Automation to update package version.
- All packages are type module:
  - No reliance on `esm` package to support esm modules.
  - No reliance on `rollup` to create common js distribution files to combine packages.
- More granular, smaller, single-purpose packages (better division of concerns).
  - Increased specific test coverage.
- Code quality metrics:
  - Lint rules (error on unused lint rules).
  - Complexity: 8
  - Max lines per module: 300
  - etc.
- Removed support for node < 13.
- Make use of globalThis (removed all evaluation of "return this")
