# Introducing SES 2.0

Here are the issues resolved with SES 2.0

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
  - Detect errors in shims .

### Testing

- More unit tests.
- Added test262 runner packages:
  - Declarative test selection.
  - Used by many packages.
- Converted from `tape` to `tap`: 
  - Better count of test skipped.
  - More stable for large test runs (no tests silently dropped).
  - Parallelization.
  - Test suites run in separate realms.

### Development

- Monorepo:
  - Based on yarn wokspaces + Lerna.
- All packages are type module:
  - No reliance on `esm` package to support esm modules.
  - No reliance on `rollup` to publish and import esm package.
- More granular single-purpose packages (better division of concerns).
- Code quality metrics:
  - Lint rules (error on unused lint rules).
  - Complexity.
  - Max lines per module.
  - etc.
- Removed support for node < 13.
