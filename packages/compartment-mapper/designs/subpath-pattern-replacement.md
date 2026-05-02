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
`*` **matches across `/` separators** — it is not limited to a single
path segment.

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

### Rules

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
   Globstar entries are silently ignored.

## Implementation

### Pattern Matching (`src/pattern-replacement.js`)

`makeMultiSubpathReplacer` accepts an array of `PatternDescriptor`
entries and returns a `SubpathReplacer` function.

Exact entries (no `*`) are stored in a `Map` for O(1) lookup.
Wildcard entries are decomposed into prefix/suffix pairs and sorted by
prefix length descending.
Matching proceeds by checking exact entries first, then trying wildcard
entries in specificity order.
The first wildcard whose prefix and suffix match the specifier wins.
The captured substring between prefix and suffix is substituted into
the replacement template.

Null-target patterns (`to: null`) match normally but return
`{ result: null }` to signal exclusion.

### Inference from `package.json` (`src/infer-exports.js`)

`inferExportsAliasesAndPatterns` processes the `exports` and `imports`
fields and separates entries into:

- **Concrete aliases** (no `*`) — added to `externalAliases` or
  `internalAliases`.
- **Wildcard patterns** (contain `*`) — added to the `patterns` array
  as `PatternDescriptor` entries.
- **Null-target patterns** (wildcard key, `null` value) — added to the
  `patterns` array with `to: null`.
- **Globstar entries** (`**`) — silently skipped.

Conditional pattern values (condition objects) are resolved by
`interpretExports` recursively before yielding, so pattern entries
arrive as already-resolved strings.

`interpretImports` handles the `imports` field with the same logic,
restricted to `#`-prefixed keys.

### Compartment Map Representation

An optional `patterns` array on `PackageCompartmentDescriptor` holds
the extracted wildcard patterns:

```ts
interface PatternDescriptor {
  from: string;         // e.g., "./*.js"
  to: string | null;    // e.g., "./src/*.js", or null for exclusion
  compartment?: string; // foreign compartment for dependency patterns
}
```

Patterns are stored separately from concrete module aliases because they
require runtime resolution (the full set of matching modules is not known
statically).

### Cross-Package Pattern Propagation (`src/node-modules.js`)

When building the compartment map, export patterns from dependency
packages are propagated to dependee compartments.
If `patterns-lib` declares:

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

### Pattern Resolution at Link Time (`src/link.js`)

The `moduleMapHook` resolves specifiers in this order:

1. **Concrete module descriptors** (exact matches, highest priority).
2. **Patterns** (wildcard replacement).
3. **Scope descriptors** (package-scope resolution, lowest priority).

When a pattern matches, the resolved path is written back into
`moduleDescriptors` as a concrete entry (with `__createdBy: 'link-pattern'`).
This write-back serves three purposes: caching subsequent imports of the
same specifier, enabling policy enforcement (which checks `modules[specifier]`),
and capturing the expansion for archival.

Null-target matches throw an error, preventing resolution even if a
scope descriptor would match.

Cross-compartment patterns resolve to the dependency's compartment via
the `compartment` field on the `PatternDescriptor`.

Policy enforcement via `enforcePolicyByModule` runs after the write-back
so the specifier is visible in `modules`.

### Archiving

Patterns are removed from the compartment map during archiving.
`digestCompartmentMap` constructs result objects with only the fields
recognized by the Agoric chain runtime — `patterns` is never included.
All pattern-matched modules that were actually used are captured as
concrete module descriptors via the write-back in `link.js`.

Type-level enforcement: `DigestedCompartmentDescriptor` has
`patterns: never`.

## Eschewed Alternatives

**Per-segment matching via prefix tree.**
An earlier approach split specifiers on `/` and matched `*` within a
single path segment using a prefix tree.
This did not match Node.js semantics, where `*` spans `/` boundaries.
Prefix/suffix string matching on the full specifier is simpler and
correct.

**Array fallback values.**
Node.js allows array values in exports as fallback lists, where each
entry is tried in order and the first file that exists on disk is used.
Pattern resolution in the compartment-mapper is a pure string operation
with no filesystem access.
Array fallbacks would require threading read powers through the pattern
matcher and changing the `SubpathReplacer` signature.
Node.js documentation discourages array fallbacks.
If a pattern value is an array, `interpretExports` yields all elements
as separate entries and the first match wins without fallback probing.

## Testing

### Parity Strategy

Each fixture is exercised by both Node.js and the Compartment Mapper.
Assertions are shared via `_subpath-patterns-assertions.js`, so parity
is verified by construction: if both test suites pass, the behaviors
are equivalent.

- `subpath-patterns-node-parity.test.js` runs fixtures under plain
  Node.js using dynamic `import()`.
- `subpath-patterns-node-condition.node-condition.test.js` runs under
  `--conditions=blue-moon` via ses-ava (`nodeArguments: ['-C', 'blue-moon']`
  in `_ava-node-condition.config.js`).
- `subpath-patterns.test.js` runs fixtures through the `scaffold()`
  harness, exercising `loadLocation`, `importLocation`, `makeArchive`,
  `parseArchive`, `writeArchive`, `loadArchive`, and `importArchive`.

### Unit Tests (`pattern-replacement.test.js`)

13 tests covering: exact match, single-segment wildcard, cross-`/`
matching, specificity ordering, `#`-imports patterns, null-target
exclusion, globstar rejection, wildcard count mismatch, and various
input formats (tuples, `PatternDescriptor` array, record object).

### Fixture: `fixtures-package-imports-exports`

Primary fixture for cross-package subpath patterns.

#### Packages

- **`patterns-lib`** — exports with `*` patterns, an exact entry,
  a null-target exclusion, specificity ordering, and `#`-imports.
- **`cond-patterns-lib`** — conditional pattern:
  `"./things/*.js": { "blue-moon": "./src/blue/*.js", "default": "./src/default/*.js" }`.
- **`multi-star-lib`** — multi-`*` pattern (silently ignored by Node.js).
- **`globstar-lib`** — globstar pattern (silently ignored by Node.js).
- **`app`** — entry package that imports from all of the above.

#### Cases Covered

| Case | Specifier | Resolves to |
|------|-----------|-------------|
| Single-segment match | `patterns-lib/features/alpha.js` | `./src/features/alpha.js` |
| Cross-separator match | `patterns-lib/features/beta/gamma.js` | `./src/features/beta/gamma.js` |
| Exact over pattern | `patterns-lib/features/beta/exact` | `./src/features/beta/exact-target.js` |
| Imports pattern | `#internal/helper.js` | `./src/internal/helper.js` |
| Specificity | `patterns-lib/utils/private/thing.js` | `./src/private/thing.js` |
| Null-target exclusion | `patterns-lib/features/secret/data.js` | throws |
| Conditional (blue-moon) | `cond-patterns-lib/things/widget.js` | `./src/blue/widget.js` |
| Conditional (default) | `cond-patterns-lib/things/widget.js` | `./src/default/widget.js` |
| Multi-star | `multi-star-lib/x/foo/y/bar/z.js` | silently ignored |
| Globstar | `globstar-lib/deep/nested/thing.js` | silently ignored |

### Integration Tests (`subpath-patterns.test.js`)

- Scaffold tests through all execution paths.
- Pattern stripping: inspects archived `compartment-map.json` and
  asserts no compartment has a `patterns` property.
- Policy: verifies pattern-matched imports are allowed when the package
  is permitted by policy and rejected when not.
- Conditional: verifies user-specified condition selects the correct
  branch, and omitting it falls back to `"default"`.
- Null-target: verifies the exclusion throws.

### Fixture: `fixtures-export-patterns`

Exercises self-referencing export patterns and `#`-imports within a
single package.
