# `@endo/bytes`: Portable `Uint8Array` Helpers

| | |
|---|---|
| **Created** | 2026-05-08 |
| **Updated** | 2026-05-10 |
| **Author** | Designer (dispatched per kriskowal review) |
| **Status** | Implemented |
| **Source** | [PR 122 inline review comment 3205507716](https://github.com/endojs/endo-but-for-bots/pull/122#discussion_r3205507716) |
| **Implementation** | [PR #142](https://github.com/endojs/endo-but-for-bots/pull/142) |

## What is the Problem Being Solved?

Endo runs in three byte-handling platforms:
Node (where `Buffer` is ambient),
XS (no `Buffer`, no `globalThis.Buffer`),
and SES-locked compartments
(where `Buffer` may exist on the host platform but is intentionally not
propagated into the locked compartment, and where `Uint8Array` is the
only portable byte container).

The codebase has chosen `Uint8Array` as the cross-platform byte container.
The existing user-memory rule is explicit:
"Prefer Uint8Array over Node Buffer
Buffer is Node-only; use Uint8Array + TextDecoder/TextEncoder/atob for
portability across XS and SES platforms."
That rule has been honored at the call sites,
but every site has had to reinvent the same handful of `Uint8Array`
operations from scratch because there is no shared helper package.

The result is duplication.
PR 122 alone added three near-identical `concatChunks` helpers across
`packages/platform/src/fs-node/{file,directory,tree-writer}.js`,
each one a verbatim copy of the same nine-line function.
That triplication is the immediate trigger for this design,
but the audit (below) shows the duplication is older and broader:
at least five separate "concat a list of `Uint8Array` chunks" functions
already exist in the monorepo,
each with subtly different signatures
(`concat`, `concatChunks`, `concatUint8Arrays`, `asyncConcat`, plus
inline `Buffer.concat(...)` ports).

The duplication has three concrete costs:

1. **Each new caller invents another copy.**
   The PR 122 review comment is the visible evidence that reviewers
   are now flagging this and asking for a shared package.
2. **Subtle drift between copies.**
   `cli/src/commands/store.js` uses `byteLength`;
   the platform copies use `length`;
   the OCapN copy uses `Array.prototype.reduce` instead of a for-loop.
   All three are correct on `Uint8Array` inputs,
   but the inconsistency makes review and search harder.
3. **Buffer ports are still landing.**
   `packages/daemon/src/envelope.js` line 292 wraps a
   `Buffer.concat(chunks)` in a `new Uint8Array(...)`,
   keeping a Node-only dependency on a code path that ought to be
   portable.

`@endo/bytes` consolidates these into a single small package of
platform-portable `Uint8Array` helpers
that the platform, daemon, CLI, and OCapN packages can depend on
in place of their local copies.

## Goals and Scope

### In scope

- A new `packages/bytes/` workspace package, published as `@endo/bytes`.
- A minimum viable shape:
  the helpers we know we need today plus a small handful of obvious
  companions whose absence would force callers to keep importing
  `Buffer` for trivial reasons.
- Hardened-JS-friendly: every export goes through `harden()`,
  module-level state is immutable.
- A migration plan that reaches the three PR 122 sites,
  the OCapN duplicates, the CLI duplicate, and the `envelope.js`
  port without a flag-day rewrite.

### Out of scope

- A full `Buffer` replacement library.
  Mature options already exist
  (`buffer/` shim on npm, `feross/buffer`, etc.);
  this is the minimum viable shape for Endo's call sites,
  not a competitor to those.
- Hex encoding/decoding.
  `@endo/hex` is already proposed as a sibling package
  (see [hex-package.md](hex-package.md));
  `@endo/bytes` defers to it and does not duplicate `toHex`/`fromHex`.
- Base64 encoding/decoding.
  `@endo/base64` already exists and already mirrors the TC39 native
  shape; `@endo/bytes` defers to it and does not re-export.
- A streaming API.
  `@endo/stream` and `@endo/stream-node` cover async iteration of
  byte chunks; `@endo/bytes` operates on synchronous arrays of
  already-collected chunks.
  Async helpers like `cli/src/commands/store.js`'s `asyncConcat` are
  one-liners over the sync `concatBytes` plus a `for await` loop;
  callers compose them themselves.

## Design

### Package Layout

Mirrors the shape of `packages/base64/` and the proposed
`packages/hex/`,
with one structural choice specific to this package:
**no barrel module** (no aggregate `index.js` re-exporting every
helper).
Each export gets its own surface module at the package root,
which re-exports from the matching implementation file under `src/`.
Consumers import from `@endo/bytes/<helper>.js` directly.

```
packages/bytes/
  CHANGELOG.md
  LICENSE
  README.md
  SECURITY.md
  concat.js              # surface: re-exports concatBytes
  equals.js              # surface: re-exports bytesEqual
  from-string.js         # surface: re-exports bytesFromText
  to-string.js           # surface: re-exports bytesToText
  src/
    concat.js            # implementation of concatBytes
    equals.js            # implementation of bytesEqual
    from-string.js       # implementation of bytesFromText
    to-string.js         # implementation of bytesToText
  test/
    main.test.js         # round-trip + edge cases per helper
  package.json
  tsconfig.json
  tsconfig.build.json
  typedoc.json
```

Module specifiers use `kebab-case` for multi-word file names
(`from-string.js`, `to-string.js`) per the project's house naming
guide; single-word files keep their plain form (`concat.js`,
`equals.js`).
The exported identifier inside each file is `camelCase` and qualified
with the `bytes` prefix (`concatBytes`, `bytesEqual`, `bytesFromText`,
`bytesToText`), so call sites read unambiguously without
import-renaming.
The qualified-name discipline matches kriskowal's review feedback
on the PR 142 implementation:
the file name and the export name do not need to stutter; the file
says what it implements (`concat.js`), and the export carries the
qualifier (`concatBytes`).

### Exports

The `package.json` `exports` field declares each surface module as
its own entry, plus the conventional `package.json` re-export:

```jsonc
{
  "name": "@endo/bytes",
  "type": "module",
  "exports": {
    "./equals.js": "./equals.js",
    "./from-string.js": "./from-string.js",
    "./to-string.js": "./to-string.js",
    "./concat.js": "./concat.js",
    "./package.json": "./package.json"
  }
}
```

Each surface module is a thin re-export:

```js
// packages/bytes/concat.js
// @ts-check
export { concatBytes } from './src/concat.js';
```

```js
// packages/bytes/equals.js
// @ts-check
export { bytesEqual } from './src/equals.js';
```

```js
// packages/bytes/from-string.js
// @ts-check
export { bytesFromText } from './src/from-string.js';
```

```js
// packages/bytes/to-string.js
// @ts-check
export { bytesToText } from './src/to-string.js';
```

There is no `.` (root) export and no `index.js` aggregate;
the surface is per-helper by design.
The package's `files` field includes `./*.js` so the surface modules
ship in the published tarball alongside `src/`.

### Signatures

```js
/**
 * Concatenates a list of `Uint8Array` chunks into a single contiguous
 * `Uint8Array`.
 * Empty input yields an empty `Uint8Array`.
 *
 * @param {readonly Uint8Array[]} chunks
 * @returns {Uint8Array}
 */
export const concatBytes = chunks => { /* ... */ };

/**
 * Compares two `Uint8Array` values byte-for-byte.
 * Returns `true` when the two arrays have equal length and equal
 * contents.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
export const bytesEqual = (a, b) => { /* ... */ };

/**
 * Encodes a string as UTF-8 bytes.
 * Backed by a module-scoped `TextEncoder` captured at module load
 * so callers do not allocate one per call.
 *
 * @param {string} s
 * @returns {Uint8Array}
 */
export const bytesFromText = s => { /* ... */ };

/**
 * Decodes UTF-8 bytes to a string.
 * Backed by a module-scoped `TextDecoder` captured at module load.
 *
 * @param {Uint8Array} view
 * @returns {string}
 */
export const bytesToText = view => { /* ... */ };
```

### Reference implementation of `concatBytes`

The shape replicated three times in PR 122,
canonicalized:

```js
import harden from '@endo/harden';

export const concatBytes = chunks => {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};
harden(concatBytes);
```

`length` is preferred over `byteLength` for symmetry with the
`set(chunk, offset)` call, which uses the array's element count
(equal to byte count for `Uint8Array`).
The `cli/src/commands/store.js` variant uses `byteLength`;
both produce identical behavior on `Uint8Array`,
so the canonical version uses `length`.

### Helper rationale

| Helper | Why include in the first release | Existing duplicates |
|---|---|---|
| `concatBytes(chunks)` | The PR 122 trigger.  Three verbatim copies in `fs-node/`, plus one in `cli/src/commands/store.js`, plus `concatUint8Arrays` in `ocapn/src/buffer-utils.js`, plus several `Buffer.concat(chunks)` ports that should be portable.  Highest-value extraction. | 5+ |
| `bytesEqual(a, b)` | Tests across the codebase compare bytes via `t.deepEqual` or via ad-hoc `for`-loops.  A canonical helper is one line and well-defined.  Including it pre-empts the next reviewer flag. | Several inline loops; not yet a named helper. |
| `bytesFromText(s)` | Every place that constructs a `Uint8Array` from a string today calls `new TextEncoder().encode(s)`.  At least 8 daemon-side modules construct their own `TextEncoder` (see audit).  A shared helper avoids the per-module encoder allocation. | 8 module-scoped encoders in `daemon/src`, plus `connection.js`, plus `worker.js`. |
| `bytesToText(view)` | Symmetric to `bytesFromText`.  `daemon.js` lines 1742-1743 construct a fresh `TextDecoder` per call. | At least 4 sites. |

### Helpers explicitly deferred

| Helper | Reason for deferral |
|---|---|
| `slice(view, start?, end?)` | `Uint8Array.prototype.subarray` already does this with no copy.  Adding our own `slice` would either duplicate `subarray` (and confuse readers) or copy unnecessarily.  If a caller wants a copy, `view.slice()` is built in.  Defer until a real use case. |
| `fromBase64` / `toBase64` | Already covered by `@endo/base64`. |
| `fromHex` / `toHex` | Already covered (or about to be) by `@endo/hex` per [hex-package.md](hex-package.md).  PR 119 also flagged this with "We should use @endo/hex." |
| `compare(a, b)` (lex order) | No current call site needs lexicographic ordering of byte arrays.  Add when a consumer asks. |
| `concatInto(dest, chunks, offset)` | TC39 has `Uint8Array.prototype.setFromBase64` and similar in-place writers.  Symmetry suggests we may want `setFromConcat` someday, but no current call site asks for it. |
| `fromArrayBuffer(ab)` / `toArrayBuffer(view)` | `new Uint8Array(ab)` and `view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)` are one-liners.  The OCapN `concatArrayBuffers` is the only current case, and it has special immutable-ArrayBuffer handling that is OCapN-specific; do not generalize. |
| `bytesEqual` for `ArrayBuffer` inputs | The `Uint8Array` overload covers the common case;  callers with `ArrayBuffer` can wrap with `new Uint8Array(ab)` first. |

The principle (per the user's
"maximal-power-minimal-area" guidance):
ship the smallest API that retires the existing duplicates,
add helpers when a real consumer asks.

### SES and Hardening Considerations

- Every export is `harden()`-ed.
- Module-scoped `TextEncoder` and `TextDecoder` instances are created
  once at module load and frozen.
  They are passed as captured constants;
  no globals are read after module init.
- The native `TextEncoder`/`TextDecoder` are available in all our
  target platforms (Node, XS, browser, and SES-locked compartments
  where the host hands them through `globals.TextEncoder` /
  `globals.TextDecoder`).
  `daemon/src/worker.js` already imports them via the SES-locked
  globals shape (`{ TextEncoder, TextDecoder }`),
  so the precedent for treating them as portable is established.
- No mutable module state.
- Inputs are not validated beyond what the underlying primitives do;
  passing a non-`Uint8Array` to `concatBytes` will fault at the
  `.length` read or the `.set()` call.
  Adding a `passStyleOf`-style guard would add a `@endo/pass-style`
  dependency to a leaf utility package, which we want to avoid.

### Platform-portability notes

- **Node:** `Uint8Array` is the same global, so no special handling.
  Callers receive `Uint8Array` instances rather than `Buffer`,
  which is the goal.
- **XS:** No `Buffer` global, `Uint8Array` works as expected,
  `TextEncoder`/`TextDecoder` are available.
- **SES compartments:** `Uint8Array` is part of the SES whitelist
  (it is one of the safe intrinsics);
  `TextEncoder`/`TextDecoder` are added by the host before lockdown
  if needed.
  Our module captures them at init time, so post-lockdown deletion
  cannot defeat them.

### Versioning

The first release ships as `1.0.0` via a `'@endo/bytes': major`
changeset entry (`.changeset/<name>.md`).
The workspace `package.json` `version` stays at the `0.1.0` floor;
the changeset's major bump from a `0.x.y` baseline lands the published
version at `1.0.0`.
This matches the convention recently established for fresh utility
packages where the first published artifact is API-stable from day
one and there is no `0.x` line to leave behind.

## Test Plan

Test suite at `packages/bytes/test/main.test.js`,
modeled on `packages/base64/test/main.test.js`.
Each test name carries the helper as a prefix using the
`<funcName>: <description>` convention (space after the colon),
which keeps a focused `--match` invocation cheap.

Coverage targets:

- `concatBytes`:
  empty input,
  single chunk,
  many small chunks,
  one huge chunk plus zero-length chunks interleaved,
  alignment-sensitive lengths
  (lengths around 64-byte boundaries to catch any future SIMD
  optimization that assumes alignment).
- `bytesEqual`:
  identical refs,
  identical contents different refs,
  different lengths,
  same prefix different suffix,
  empty arrays.
- `bytesFromText` / `bytesToText`:
  empty string,
  ASCII,
  multi-byte UTF-8 (BMP and non-BMP),
  round-trip through `concatBytes` of multiple `bytesFromText`
  outputs.
- SES smoke:
  import under `@endo/ses-ava/prepare-endo.js`
  (same harness as `packages/base64/test/main.test.js`)
  to confirm the module loads and operates after lockdown.

## Affected Packages

### New

- `packages/bytes/`: the new `@endo/bytes` package per the layout
  above.

### Migrated (builder phase)

The first builder PR (#142) lands the package, the changeset, and
the consumer migrations in a single 3-commit set:
scaffold, implementation, and yarn.lock.

| File | Today | After |
|---|---|---|
| `packages/cli/src/commands/store.js` | local `concat` + `asyncConcat` | `import { concatBytes } from '@endo/bytes/concat.js'`; `asyncConcat` kept as a four-line wrapper over it |
| `packages/ocapn/src/buffer-utils.js` | `concatUint8Arrays` | `concatBytes` from `@endo/bytes/concat.js` (call sites updated) |
| `packages/daemon/src/envelope.js` | `new Uint8Array(Buffer.concat(chunks))` | `concatBytes(chunks)` (removes a `Buffer` use) |
| `packages/daemon/src/{bus-daemon-node-powers,bus-daemon-rust-xs,connection,daemon-go-powers,daemon-node-powers,daemon,debug-session,directory,worker}.js` | per-module `new TextEncoder()` / `new TextDecoder()` | `import { bytesFromText } from '@endo/bytes/from-string.js'` and `import { bytesToText } from '@endo/bytes/to-string.js'` |
| `packages/daemon/src/networks/ws-relay.js` | per-module text codec | `bytesFromText` / `bytesToText` from `@endo/bytes` |

### Not migrated in PR #142

- `packages/platform/src/fs-node/{file,directory,tree-writer}.js`:
  the three `concatChunks` PR 122 sites remain in PR 122's branch
  while that PR is in review.
  A follow-up after PR 122 merges will swap them to `concatBytes`.
- `packages/sandbox/src/drivers/{bwrap,podman}.js`,
  `packages/sandbox/test/`,
  `packages/bundle-source/test/`: these run only on Node and
  intentionally use `Buffer` for `.toString('utf8')` ergonomics.
  They are not portability targets.
  A future cleanup pass can migrate them to `concatBytes(...)` plus
  `bytesToText(...)` if the user wants Buffer-free test scaffolding,
  but it is not load-bearing for this proposal.
- `packages/daemon/src/daemon-node-powers.js` line 407
  (`Buffer.concat([ED25519_PKCS8_PREFIX, privateKey])`):
  lives in an explicitly Node-bound powers module and is fine.
- `packages/ses/test/error/permit-removal-warnings-node.test.js`:
  test scaffolding, Node-only, fine as-is.

## Decisions

The Open Questions raised by the original draft were resolved during
implementation (PR #142) and the kriskowal review on it.
They are recorded here as Decisions for future readers.

1. **Package name: `@endo/bytes`.**
   The reviewer's original ask used this name and the
   sibling-package precedent (`@endo/base64`, `@endo/hex`) uses the
   format, not the container, in its name.
   `bytes` is the conceptual unit the helpers operate on.

2. **`bytesEqual` is binary, not variadic.**
   Binary is the universal convention and matches `Buffer.compare`'s
   shape.
   A variadic mutual-equality helper has no current consumer.

3. **`bytesFromText` / `bytesToText` are UTF-8 only.**
   `TextEncoder` only ever encodes UTF-8 by spec.
   `TextDecoder` accepts other encodings, but Endo has no current
   consumer of non-UTF-8 byte strings.
   An encoding option can be added later if a consumer asks.

4. **No re-exports from `@endo/base64` or `@endo/hex`.**
   Adding peer deps to a leaf utility package risks circular
   ownership and pulls in code consumers may not want.
   `@endo/bytes` stays a minimal leaf;
   callers import `@endo/base64` and `@endo/hex` separately when
   they need them.

5. **Per-module surface, no barrel.**
   Each export gets its own surface module
   (`packages/bytes/<helper>.js`) re-exporting from
   `packages/bytes/src/<helper>.js`.
   There is no `index.js` aggregating all helpers and no `.` root
   export in the `package.json` `exports` map.
   Consumers import from `@endo/bytes/<helper>.js` directly.
   Per-module surfaces improve tree-shaking and keep the
   per-helper surface area easy to audit;
   this is the discipline kriskowal asked for during the PR 142
   implementation review.

6. **Qualified export names.**
   The exported identifier carries the `bytes` qualifier
   (`concatBytes`, `bytesEqual`, `bytesFromText`, `bytesToText`)
   so the call site reads unambiguously without an import rename.
   The file name does not stutter:
   `concat.js` exports `concatBytes`, `equals.js` exports
   `bytesEqual`.
   Per kriskowal on PR 142:
   "the exported module names do not need to stutter 'bytes'.
   Just the exported names."

7. **Kebab-case file names for multi-word modules.**
   `from-string.js` and `to-string.js`, not `fromString.js` or
   `from_string.js`.
   Single-word modules (`concat.js`, `equals.js`) keep their plain
   form.
   Per the project house naming guide.

8. **First release at `1.0.0`.**
   Shipped via a `'@endo/bytes': major` changeset entry; the
   workspace `package.json` `version: 0.1.0` is the floor and the
   major bump publishes `1.0.0` from it.

## Out of Scope, Future Work

- A `./shim.js` that installs the helpers as `Uint8Array` static or
  prototype methods.
  TC39 may or may not standardize a `Uint8Array.concat`
  (proposal-arraybuffer-base64 does not include it as of 2026-05);
  if a future proposal does, we add a fallthrough pattern matching
  `@endo/hex` and `@endo/base64`.
- Streaming variants
  (`concatStream(asyncIterable)` returning `Promise<Uint8Array>`).
  Already a one-liner over `concatBytes`;
  ship if a consumer wants it as a named helper.
- A `compare(a, b)` that returns `-1`/`0`/`1` for sorted-byte-string
  ordering.
  Not needed today;
  add when a consumer asks.
- Migrating the sandbox/test scaffolding sites.
  Separate cleanup pass.
- Migrating the three `concatChunks` PR 122 sites once PR 122 merges.
  Trivial follow-up; deferred only because PR 122 is the source of
  the trigger and is still in review.

## Migration

The package is shipped first and adopted incrementally;
no call-site rewrites are load-bearing for the package itself.
PR #142 shipped Phase 1 and the bulk of Phase 3 in a single set of
three commits (scaffold, implementation, yarn.lock).

### Phase 1: Create `@endo/bytes` (PR #142)

Add the package under `packages/bytes/` per the layout above.

- `package.json` with `"name": "@endo/bytes"`, `"version": "0.1.0"`,
  per-module entries in `exports` (no `.` root), and `@endo/harden`
  as the lone runtime dependency.
- `src/concat.js`, `src/equals.js`, `src/from-string.js`,
  `src/to-string.js` per the signatures above.
- `concat.js`, `equals.js`, `from-string.js`, `to-string.js` at
  the package root: each a one-line re-export of the matching
  symbol from `./src/<same>.js`.
- `tsconfig.json`, `tsconfig.build.json`, `typedoc.json` modeled on
  `@endo/base64`.
- `README.md` modeled on `packages/base64/README.md`.
- `CHANGELOG.md`: regenerated by changesets at release.
- `.changeset/<name>.md` with `'@endo/bytes': major` so the first
  publish lands at `1.0.0`.
- `test/main.test.js` per the test plan.

### Phase 2: Migrate the PR 122 triplication

Replace the three `concatChunks` definitions in
`packages/platform/src/fs-node/{file,directory,tree-writer}.js`
with `import { concatBytes } from '@endo/bytes/concat.js'`.
Coordinate with PR 122:
either layer the migration on top of PR 122's branch
(if PR 122 has not merged when the builder reaches this phase),
or open a fresh branch off `bots-ssh/llm` (if PR 122 has merged).

Adds `@endo/bytes` to `packages/platform/package.json` `dependencies`.
Fits in **S** (< 100 LOC).

### Phase 3: Migrate the sibling duplicates (PR #142)

- `packages/cli/src/commands/store.js`:
  delete local `concat`, import `concatBytes` from
  `@endo/bytes/concat.js`;
  keep `asyncConcat` as a four-line wrapper over it.
- `packages/ocapn/src/buffer-utils.js`:
  delete local `concatUint8Arrays`, replace call sites with
  `concatBytes` from `@endo/bytes/concat.js`.
- `packages/daemon/src/envelope.js`:
  swap `new Uint8Array(Buffer.concat(chunks))` for
  `concatBytes(chunks)`.

Each adds `@endo/bytes` to its `package.json` `dependencies`.
Fits in **S** (< 50 LOC each).

### Phase 4: Migrate `TextEncoder`/`TextDecoder` instantiations (PR #142)

Walk the daemon-side modules that construct their own
`TextEncoder` and `TextDecoder`,
replace with `bytesFromText` and `bytesToText` imports from
`@endo/bytes/from-string.js` and `@endo/bytes/to-string.js`.

PR #142 covered the daemon's `bus-daemon-node-powers.js`,
`bus-daemon-rust-xs.js`, `connection.js`, `daemon-go-powers.js`,
`daemon-node-powers.js`, `daemon.js`, `debug-session.js`,
`directory.js`, `worker.js`, and `networks/ws-relay.js`.

### Consumer pattern

```js
import { concatBytes } from '@endo/bytes/concat.js';
import { bytesEqual } from '@endo/bytes/equals.js';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToText } from '@endo/bytes/to-string.js';

const greeting = bytesFromText('hello');
const farewell = bytesFromText('goodbye');
const both = concatBytes([greeting, farewell]);
bytesToText(both); // 'hellogoodbye'
bytesEqual(greeting, bytesFromText('hello')); // true
```

Each helper lives behind its own subpath import.
This keeps the per-import dependency narrow and lets a tree-shaker
drop unused helpers without inspecting a barrel.

## Prompt

> Write a design document at `designs/endo-bytes.md` for a new
> `@endo/bytes` package extracting the `concatChunks` helper
> currently triplicated across `packages/platform/src/fs-node/`,
> per kriskowal's PR 122 inline review comment 3205507716.
>
> Audit the broader codebase for sibling `Uint8Array` helpers,
> propose the smallest API that retires existing duplicates
> (maximal-power-minimal-area), and stage a migration plan that
> reaches the existing call sites without a flag-day rewrite.
>
> Defer to `@endo/base64` and `@endo/hex` for those formats;
> this package is for the operations that have no shared home today.
>
> Follow the project Markdown Style Guide (80-100 cols, one
> sentence per line, no em-dashes).
> Match the depth of `designs/hex-package.md` and the structure of
> `designs/platform-fs.md`.
