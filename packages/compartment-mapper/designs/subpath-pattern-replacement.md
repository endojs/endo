# Subpath Pattern Replacement

## Objective

Achieve parity with Node.js subpath pattern replacement for the `exports`
and `imports` fields of `package.json`.
Node.js specifies this behavior in the
[Packages](https://nodejs.org/api/packages.html) documentation under
"Subpath patterns."

## Node.js Semantics

In Node.js, the `*` wildcard in subpath patterns is a **string replacement
token**, not a glob.
All instances of `*` on the right side of a pattern are replaced with the
text matched by `*` on the left side.
Crucially, `*` **matches across `/` separators**—it is not limited to a
single path segment.

```json
{
  "exports": {
    "./features/*.js": "./src/features/*.js"
  }
}
```

```js
import x from 'pkg/features/x.js';
// resolves to ./src/features/x.js

import y from 'pkg/features/y/y.js';
// resolves to ./src/features/y/y.js
// * matched "y/y", which spans a "/" separator
```

The same semantics apply to the `imports` field, where keys begin with `#`:

```json
{
  "imports": {
    "#internal/*.js": "./src/internal/*.js"
  }
}
```

```js
import z from '#internal/z.js';
// resolves to ./src/internal/z.js
```

### Key Rules

1. **One `*` per side.** Node.js allows exactly one `*` in each pattern
   key and one `*` in each pattern value.
   Having zero `*` on one side and one on the other is an error.
2. **`*` matches any substring**, including substrings that contain `/`.
3. **Exact entries take precedence** over pattern entries.
   If both `"./foo"` and `"./*"` exist, `"./foo"` wins.
4. **Pattern specificity.** When multiple patterns could match, Node.js
   selects the pattern with the longest matching prefix before the `*`.
5. **Null targets** can exclude subpaths:
   `"./features/private/*": null` prevents resolution into that subtree
   even if a broader pattern would match.
6. **Conditional patterns.** Pattern values can be condition objects,
   following the same condition-matching rules as non-pattern exports.
7. **No `**` (globstar).** Subpath patterns do not support globstar.

### Correction Applied to Draft Implementation

The draft implementation (`src/pattern-replacement.js`) used a prefix-tree
that split on `/` and matched `*` within a single path segment only.
This did not match Node.js semantics, where `*` spans `/` boundaries.
The implementation has been replaced with prefix/suffix string matching on
the full specifier, which correctly handles cross-separator matching.
Pattern specificity is determined by prefix length (longest prefix wins),
and exact entries always take precedence over wildcard patterns.

## Design

### Compartment Map Representation

A new optional `patterns` array on `PackageCompartmentDescriptor` holds
extracted wildcard patterns:

```ts
interface PatternDescriptor {
  from: string; // e.g., "./*.js"
  to: string;   // e.g., "./src/*.js"
}
```

Patterns are stored separately from concrete module aliases because they
require runtime resolution (the full set of matching modules is not known
statically).

### Pattern Resolution at Link Time

In `link.js`, the `moduleMapHook` resolves specifiers in this order:

1. **Concrete module descriptors** (exact matches, highest priority).
2. **Patterns** (wildcard replacement).
3. **Scope descriptors** (package-scope resolution, lowest priority).

Patterns may resolve within the same compartment (internal patterns like
`#internal/*.js`) or to a foreign compartment (dependency export patterns
like `dep/features/*.js`).
The `PatternDescriptor` carries an optional `compartment` field to support
cross-compartment resolution.

When a pattern matches, the resolved path is written back into
`moduleDescriptors` for caching and archival.

### Cross-Package Pattern Propagation

When building the compartment map in `node-modules.js`, export patterns
from dependency packages are propagated to dependee compartments.
For example, if `patterns-lib` declares:

```json
{ "exports": { "./features/*.js": "./src/features/*.js" } }
```

Then `app` (which depends on `patterns-lib`) receives a pattern entry:

```
{ from: "patterns-lib/features/*.js", to: "./src/features/*.js", compartment: "<patterns-lib-location>" }
```

This allows `import 'patterns-lib/features/alpha.js'` to resolve via
pattern matching in `app`'s `moduleMapHook`, targeting the `patterns-lib`
compartment.

Import patterns (starting with `#`) are **not** propagated — they are
internal to the declaring package.

### Archiving

Patterns must be **removed** from the compartment map during
archiving/bundling.
All pattern-matched modules that were actually used must be expanded into
concrete module descriptors.
This is a hard requirement: the Agoric chain runtime rejects compartment
maps with unrecognized properties.

### Inference from `package.json`

In `infer-exports.js`, the `inferExportsAliasesAndPatterns` function
processes the `exports` and `imports` fields and separates entries into:

- **Concrete aliases** (no `*`) — added to `externalAliases` or
  `internalAliases`.
- **Patterns** (contain `*`) — added to the `patterns` array as
  `PatternDescriptor` entries.

## Test Fixtures

### Parity Testing Strategy

Test fixtures should be structured so that the same fixture can be
exercised by both Node.js and the Compartment Mapper, and the results
compared for equivalence.

The approach:

1. Each fixture is a self-contained `node_modules` tree, following the
   existing convention in `test/fixtures-*`.
2. Each fixture's entry module (`main.js`) imports from various subpath
   patterns and re-exports the resolved values as a namespace.
3. A **Node.js parity script** (`test/node-parity.test.js`) runs each
   fixture under plain Node.js (using dynamic `import()`) and verifies
   that the same namespace values emerge.
4. A **Compartment Mapper test** (`test/subpath-patterns.test.js`) runs
   each fixture through the `scaffold()` harness, which automatically
   exercises `loadLocation`, `importLocation`, `makeArchive`,
   `parseArchive`, `writeArchive`, `loadArchive`, and `importArchive`.
5. Both tests assert the same expected namespace, so parity is verified
   by construction.

### Fixture: `fixtures-subpath-patterns`

This is the primary fixture for testing subpath pattern replacement with
Node.js parity.
It exercises cross-package patterns (dependency exports) and validates
that `*` matches across `/` separators.

#### Package Structure

```
fixtures-subpath-patterns/
  node_modules/
    app/
      package.json          # depends on patterns-lib
      main.js               # imports from patterns-lib using subpath patterns
    patterns-lib/
      package.json          # exports and imports with * patterns
      src/
        main.js             # re-exports #internal/helper.js
        features/
          alpha.js           # single-segment match target
          beta/
            gamma.js         # cross-separator match target
        internal/
          helper.js          # imports pattern target
```

#### `patterns-lib/package.json`

```json
{
  "name": "patterns-lib",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./src/main.js",
    "./features/*.js": "./src/features/*.js",
    "./features/beta/exact": "./src/features/beta/gamma.js"
  },
  "imports": {
    "#internal/*.js": "./src/internal/*.js"
  }
}
```

#### Test Cases Covered

1. **Single-segment match.** `patterns-lib/features/alpha.js` resolves
   to `./src/features/alpha.js`.
2. **Cross-separator match.** `patterns-lib/features/beta/gamma.js`
   resolves to `./src/features/beta/gamma.js`, demonstrating that `*`
   matches `beta/gamma` across a `/`.
3. **Exact over pattern.** `patterns-lib/features/beta/exact` resolves
   to `./src/features/beta/gamma.js` (the exact entry), not via the
   `./features/*.js` pattern.
4. **Imports pattern.** `#internal/helper.js` resolves to
   `./src/internal/helper.js` within the `patterns-lib` package.

### Fixture: `fixtures-export-patterns`

This is the original draft fixture, updated for Node.js parity.
It exercises self-referencing export patterns within a single package,
demonstrating that `*` matches across `/` in self-imports.

### Node.js Parity Testing

Each fixture is verified under both Node.js and the Compartment Mapper.
Parity is ensured by construction:

- `test/node-parity-subpath-patterns.test.js` runs the fixture under
  Node.js using dynamic `import()` and asserts the expected namespace.
- `test/subpath-patterns.test.js` runs the fixture through the
  `scaffold()` harness, exercising `loadLocation`, `importLocation`,
  `makeArchive`, `parseArchive`, `writeArchive`, `loadArchive`, and
  `importArchive`.
- Both tests assert the same expected values.

## Work Plan

### Completed

1. **Build fixtures.** Created `fixtures-subpath-patterns` exercising
   cross-package patterns, cross-separator matching, exact-over-pattern
   precedence, and imports patterns.
   Updated `fixtures-export-patterns` for Node.js parity.
2. **Write Node.js parity test.** `node-parity-subpath-patterns.test.js`
   verifies fixtures work under plain Node.js.
3. **Write Compartment Mapper test.** `subpath-patterns.test.js` uses
   `scaffold()` to exercise all execution paths (11 tests).
4. **Fix `*` semantics.** Rewrote `pattern-replacement.js` so `*`
   matches across `/` separators, matching Node.js behavior.
   Replaced prefix-tree per-segment matching with prefix/suffix string
   matching.
5. **Cross-package pattern propagation.** Updated `node-modules.js` to
   propagate dependency export patterns to dependee compartments with
   compartment tracking.
6. **Cross-compartment resolution.** Updated `link.js` to resolve
   pattern matches to foreign compartments when the pattern carries a
   `compartment` field.
7. **Verify archival.** Patterns are materialized as concrete module
   descriptors during linking, and archive tests pass.
8. **Updated unit tests.** `pattern-replacement.test.js` updated for
   new API and Node.js-compatible `*` semantics.

### Remaining

1. **Null-target support.** Handle `null` pattern values (exclusions)
   in `infer-exports.js` and `pattern-replacement.js`.
2. **Conditional pattern support.** Verify that pattern values which
   are condition objects (not strings) resolve correctly through
   `interpretExports`.
3. **Pattern stripping during archiving.** Verify that the `patterns`
   property is stripped from the serialized compartment map in archives.
   Add a test that inspects the archived `compartment-map.json`.
4. **Additional parity fixtures.** Consider fixtures for edge cases:
   - Pattern with no extension filter (e.g., `"./*": "./src/*"`)
   - Multiple patterns with overlapping prefixes
   - Self-referencing patterns via package name
5. **Type cleanup.** Remove `@ts-expect-error` for `patterns` in
   `link.js` by adding `patterns` to the compartment descriptor type.
