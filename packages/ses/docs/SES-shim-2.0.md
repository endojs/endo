# Introducing SES 2.0

Here are the issues resolved with SES 2.0

## API Changed

// TODO

## Issues Resolved

### Security

- Single realm code: resolve all cross-realm leaks
- Native node modules
  - no reliance on `esm` package
  - no side-effect in tests
- Refactored whitelist of intrinsics
  - easier readability
  - more complete
    - resolved missing %RegExpStringIteratorPrototype%
    - test `prototype`, `__proto__`, and `constructor` properties

### Completeness

- Whitelist last
  - detect errors in shims 

### Ergonomics

- Simpler API based on `lockdown()`, `harden()`, and `Compartment()`

### Testing

- More unit tests
- Added test262 runner packages
  - declarative test selection
  - used by many packages
- Converted from `tape` to `tap`: 
  - better count of test skipped
  - more stable for large test runs (no tests silently dropped)
  - parallelization
  - test suites run in separate realms

### Development

- Monorepo
- All packages are type module
  - no rollup of rollup necessary 
- More granular single-purpose packages (better division of concerns)
- Code quality metrics
  - complexity