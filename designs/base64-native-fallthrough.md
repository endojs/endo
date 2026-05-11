## `@endo/base64` — Native `Uint8Array` Base64 Fallthrough

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

`@endo/base64` is used throughout the Endo stack wherever bytes must be
represented as text.
It backs every `streamBase64` call in the daemon and `@endo/platform/fs`,
the bundle format at `@endo/bundle-source` and `@endo/import-bundle`
(`endoZipBase64`), the bytes reader/writer primitives at
`@endo/exo-stream`, and the bundle checker at `@endo/check-bundle`.
A typical daemon round trip for a single file passes every byte through
`encodeBase64` on the sender and `decodeBase64` on the receiver, often
twice — once across the CapTP boundary and once during content-addressed
store insertion.

Today, the package implements encode and decode in pure JavaScript.
The inner loop of `jsEncodeBase64` is a sextet-shifter written for
correctness on every engine, including XS.
It is correct and well-tested, but it is also measurably slower and
larger than the engine-native implementations now shipping in every
major JavaScript runtime under the TC39 "Uint8Array to/from base64"
proposal (stage 3, shipping in V8, SpiderMonkey, JavaScriptCore, and
Node.js 22+).
The native intrinsics — `Uint8Array.fromBase64`, the static method, and
`Uint8Array.prototype.toBase64`, the instance method — are implemented
in C++ or Rust and run an order of magnitude faster than the JS
polyfill on short strings, and several orders of magnitude faster on
the megabyte-scale inputs common for bundle transfer.
Shipping them as the default would also remove a few kilobytes of
polyfill code from every bundle that includes `@endo/base64`.

The package already contains the seed of this pattern.
The comment in `src/encode.js` explains that XSnap provides a native
`globalThis.Base64.encode`, and `encodeBase64` selects it when
available:

```js
export const encodeBase64 =
  globalThis.Base64 !== undefined ? globalThis.Base64.encode : jsEncodeBase64;
```

That mechanism is XS-specific and predates the TC39 proposal.
It also selects at module load time, which happens *before* SES
lockdown in some embeddings, and so it reads a possibly-mutable
`globalThis.Base64` that no longer exists on modern XS builds.

The specific problem this design addresses: let `@endo/base64` detect
the standard `Uint8Array.fromBase64` / `Uint8Array.prototype.toBase64`
intrinsics at module load and dispatch to them when present, falling
through to the existing JS polyfill when absent, without changing the
package's public API or observable behavior for any existing caller.
Environments that gain the native base64 intrinsics pay only the cost
of a `typeof` check; environments that lack them (older XS, older
Node.js, SES-frozen realms where someone deleted the intrinsic, or
pre-stage-3 engines) continue to work exactly as they do today.

This doc is one of two parallel proposals that adopt the same
ponyfill-shim pattern.
The sibling, `@endo/hex`, applies the same detection strategy to
`Uint8Array.fromHex` / `Uint8Array.prototype.toHex`, so the two
packages will share a common structure and a common test strategy.

## Design

### Detection Strategy

The native intrinsics, when present, are available as:

- `Uint8Array.fromBase64(string, options?) → Uint8Array` — static method.
- `Uint8Array.prototype.toBase64(options?) → string` — instance method.
- `Uint8Array.prototype.setFromBase64(string, options?) → { read, written }`
  — instance method that writes into an existing buffer.
  We do not use this; `decodeBase64` returns a fresh array.

Detection is a feature test that runs once at module initialization:

```js
const hasNativeToBase64 =
  typeof Uint8Array.prototype.toBase64 === 'function';
const hasNativeFromBase64 =
  typeof Uint8Array.fromBase64 === 'function';
```

These are independent.
A correct proposal implementation ships both, but we feature-test each
separately so that a partial or hand-patched environment does not
silently fall back on both paths when only one is missing.

The test runs *before* `lockdown()` freezes the intrinsics.
Because `@endo/base64` is a plain ESM module and SES performs lockdown
at a known point in the host bootstrap, the module's top level executes
early — `globalThis`, `Uint8Array`, and `Uint8Array.prototype` are still
mutable when this file loads, but any binding we close over at the top
level is preserved across lockdown.

Once detected, the package closes over direct references to the
intrinsics:

```js
// @ts-check
import { jsEncodeBase64 } from './src/encode.js';
import { jsDecodeBase64 } from './src/decode.js';

const nativeToBase64 = Uint8Array.prototype.toBase64;
const nativeFromBase64 = Uint8Array.fromBase64;

const encodeBase64Native = data =>
  nativeToBase64.call(data, { alphabet: 'base64', omitPadding: false });

const decodeBase64Native = (string, _name) =>
  nativeFromBase64.call(Uint8Array, string, {
    alphabet: 'base64',
    lastChunkHandling: 'strict',
  });

export const encodeBase64 =
  typeof nativeToBase64 === 'function' ? encodeBase64Native : jsEncodeBase64;
harden(encodeBase64);

export const decodeBase64 =
  typeof nativeFromBase64 === 'function'
    ? decodeBase64Native
    : jsDecodeBase64;
harden(decodeBase64);
```

The captured `nativeToBase64` / `nativeFromBase64` references are
resolved at module load.
This matters for hardened JavaScript: once the module is evaluated and
the exports are hardened, no later mutation to `Uint8Array` — by the
host, by a polyfill, or by an attacker — changes the behavior of the
ponyfilled functions.

### Module Layout

Today, `packages/base64/` has a flat layout where `encode.js` and
`decode.js` each re-export from `src/encode.js` and `src/decode.js`,
and the top-level `src/encode.js` itself contains the dispatch logic
(the `globalThis.Base64` check).
The new layout cleanly separates the polyfill from the dispatch.

```
packages/base64/
  index.js              # Re-exports from ./encode.js, ./decode.js, ./atob.js, ./btoa.js
  encode.js             # Dispatch: native vs polyfill
  decode.js             # Dispatch: native vs polyfill
  atob.js               # Unchanged (uses decodeBase64)
  btoa.js               # Unchanged (uses encodeBase64)
  shim.js               # Unchanged (installs atob/btoa globals)
  src/
    common.js           # Unchanged — alphabet64, monodu64, padding
    encode.js           # Exports jsEncodeBase64 (pure JS)
    decode.js           # Exports jsDecodeBase64 (pure JS)
    native.js           # Exports encodeBase64Native, decodeBase64Native
```

- `src/encode.js` and `src/decode.js` stay as the pure-JS
  implementations.
  Their `globalThis.Base64` check is removed; that was an XS-specific
  dispatch and is subsumed by the top-level dispatch.
  `jsEncodeBase64` and `jsDecodeBase64` are unchanged and remain
  exported for benchmarking and for forced-polyfill testing.

- `src/native.js` is new.
  It closes over `Uint8Array.fromBase64` and
  `Uint8Array.prototype.toBase64`, adapts their option bags to the
  `@endo/base64` semantic defaults, and exports
  `encodeBase64Native` / `decodeBase64Native`.
  If the intrinsics are absent, its exports are `undefined` and the
  top-level dispatch picks the polyfill.

- The top-level `encode.js` and `decode.js` become two-line dispatchers
  that pick between the native and JS implementations.
  This replaces the inline ternary currently in `src/encode.js` and
  `src/decode.js`.

This split matches the ponyfill pattern described in the prompt for
`@endo/hex`.
The two packages end up structurally isomorphic: `src/native.js`,
`src/encode.js` (pure JS), `src/decode.js` (pure JS), and a top-level
dispatcher.

### Option Mapping

The native intrinsics accept an option bag with three relevant fields:

| Option | Values | @endo/base64 default |
|---|---|---|
| `alphabet` | `'base64'`, `'base64url'` | `'base64'` (the `A-Za-z0-9+/` set) |
| `lastChunkHandling` | `'loose'`, `'strict'`, `'stop-before-partial'` | `'strict'` (reject incomplete final chunks) |
| `omitPadding` | `true`, `false` | `false` (emit `=` padding) |

The existing `@endo/base64` polyfill:

- Uses the standard base64 alphabet (`A–Z a–z 0–9 + /`), not base64url.
  → `alphabet: 'base64'`.

- Emits `=` padding, as enforced by the algorithm in `jsEncodeBase64`.
  → `omitPadding: false`.

- Rejects trailing garbage, rejects non-alphabet characters, and
  rejects strings that are too short (missing final padding).
  These match the native `'strict'` mode.
  → `lastChunkHandling: 'strict'`.

These three defaults make `encodeBase64Native` and `decodeBase64Native`
observably equivalent to the JS polyfill for all well-formed inputs.

### Error Semantics

`jsDecodeBase64` throws `Error` with specific messages:

- `Invalid base64 character <c> in string <name>`
- `Missing padding at offset <i> of string <name>`
- `Base64 string has trailing garbage <rest> in string <name>`

The native `Uint8Array.fromBase64` throws `SyntaxError` with
implementation-defined messages.
The error *constructor* and *message text* are not part of the
`@endo/base64` public contract — the existing test suite regex-matches
specific substrings but it does so against its own polyfill, and no
downstream consumer in the monorepo (checked across `@endo/daemon`,
`@endo/captp`-style call sites, `@endo/bundle-source`,
`@endo/import-bundle`, `@endo/check-bundle`, `@endo/exo-stream`,
`@endo/platform/fs/*`) branches on the error message.

Two options for bridging:

1. **Accept the native error text.**
   Downstream consumers only care that decoding a malformed string
   throws.
   The substring-match tests in `test/main.test.js` are loosened or
   split between a "polyfill path" test file and a "native path" test
   file.
   This is the recommended approach.

2. **Re-throw with the polyfill's message.**
   Wrap `decodeBase64Native` in a `try/catch` that catches the native
   error and re-throws using `makeError` from `@endo/errors` with a
   message shaped like the polyfill's.
   The cost is a catch on every decode failure (not every decode —
   failures are rare) and some loss of fidelity in what the native
   decoder actually complained about.
   We do not recommend this unless a consumer is discovered that
   relies on the polyfill message text.

For the `name` argument (the second optional parameter of
`jsDecodeBase64`, used to provide context in error messages):
the native intrinsic does not accept a name.
In option 1, the `name` argument is simply ignored on the native path,
as it is part of the error-text contract that is being loosened.
In option 2, the wrapper rebuilds the message with the supplied name.
We recommend option 1 and retaining `name` only as an accepted-but-
unused parameter for backward compatibility of the function signature.

### Hardened-JS Considerations

The module pattern aligns with the project's hardened-JS conventions:

- `// @ts-check` at the top of every file.
- Every named export has an adjacent `harden(exportName)` call.
- No reliance on `globalThis` mutation after module load.
  All intrinsic references are captured at evaluation time; post-
  lockdown mutations to `Uint8Array.prototype` have no effect.
- Imports are grouped (external `@endo/*` first, then local), sorted.
- `@endo/errors` `makeError`/`X`/`q` are used for any error wrapping.

The module evaluates before `lockdown()`.
After lockdown the captured intrinsic references and the exported
dispatcher functions are all frozen.
A realm that ran lockdown with `overrideTaming: 'severe'` or that
later removed `Uint8Array.fromBase64` post-lockdown does not affect
already-exported bindings.

### What Callers See

All existing consumers keep their import and call sites unchanged:

```js
// @endo/platform/fs/reader-ref.js, @endo/daemon/src/reader-ref.js
import { encodeBase64 } from '@endo/base64';
```

```js
// @endo/import-bundle/src/index.js, @endo/check-bundle/lite.js
import { decodeBase64 } from '@endo/base64';
```

```js
// @endo/bundle-source/src/zip-base64.js
const endoZipBase64 = encodeBase64(bytes);
```

```js
// @endo/exo-stream/iterate-bytes-reader.js
const value = decodeBase64(base64Value);
```

No consumer passes a second argument to `encodeBase64`.
`decodeBase64` is occasionally called with a `name` string for error
context; under option 1 the second argument is silently ignored on the
native path, matching the current JS path's tolerance of extra
arguments.

`btoa` and `atob` continue to be thin wrappers that go through the
dispatched `encodeBase64` / `decodeBase64` exports, so they inherit
the native-path performance automatically.

## API Compatibility

### Public surface

The public entry points do not change:

```js
// index.js
export { encodeBase64 } from './encode.js';
export { decodeBase64 } from './decode.js';
export { btoa } from './btoa.js';
export { atob } from './atob.js';
```

And the conditional subpath exports at `./encode.js`, `./decode.js`,
`./atob.js`, `./btoa.js`, and `./shim.js` are preserved exactly as
declared in `package.json`.

### Signatures

```ts
export const encodeBase64: (data: Uint8Array) => string;
export const decodeBase64: (string: string, name?: string) => Uint8Array;
export const atob: (encodedData: string) => string;
export const btoa: (stringToEncode: string) => string;
```

The `name` parameter of `decodeBase64` continues to be accepted.
On the JS path it continues to appear in error messages.
On the native path it is ignored (see Error Semantics above).

### Observable differences

For well-formed inputs there is no observable difference.
For malformed inputs:

| Malformed input | JS path | Native path |
|---|---|---|
| `'%'` | `Error: Invalid base64 character % ...` | `SyntaxError: ...` |
| `'Z'` (missing padding) | `Error: Missing padding at offset 1 ...` | `SyntaxError: ...` |
| `'Zg==%'` (trailing garbage) | `Error: ... trailing garbage % ...` | `SyntaxError: ...` |

The error *type* widens from `Error` to `SyntaxError | Error`, and the
message text changes.
Consumers who today `try { decodeBase64(x) } catch (_) { ... }` continue
to work.
Consumers who regex-match error messages — of which there are none in
the monorepo — would need to loosen their matching.

### Non-observable differences

Engine-native encoders may produce their output with different internal
timing or allocation behavior; the return value is byte-identical.
The native decoder returns a fresh `Uint8Array` whose `.buffer` is a
fresh `ArrayBuffer`, matching the current polyfill's behavior (the
polyfill allocates an oversized `Uint8Array` and returns a `subarray`
of it, whose `.buffer` is the oversized buffer — a subtle difference
already tolerated by all consumers, but worth calling out).

## Testing

### Existing Test Suite

`test/main.test.js` contains three tests:

1. `bytes conversions` — round-trips a variety of inputs through
   `encodeBase64` / `decodeBase64`, cross-checking against the host's
   `atob` / `btoa`.
   This exercises correctness on well-formed inputs and must pass on
   both paths.

2. `btoa rejects non-latin1 characters` — tests the `btoa` wrapper
   specifically, unrelated to the native/polyfill choice.

3. `invalid encodings` — asserts `throws` on each of fifteen
   malformed inputs, and for most asserts a regex against the thrown
   message.
   These message regexes are polyfill-specific.

### Gating the Runtime Choice for Tests

We add an internal `src/select.js` that decides which path to use,
driven by environment variables:

```js
// src/select.js
/* global process */
// @ts-check

const force = typeof process !== 'undefined' && process.env
  ? process.env.ENDO_BASE64_FORCE
  : undefined;

export const forcedPath =
  force === 'native' || force === 'polyfill' ? force : undefined;
```

The dispatchers in `encode.js` and `decode.js` consult `forcedPath`:

- `ENDO_BASE64_FORCE=polyfill` — always use `jsEncodeBase64` /
  `jsDecodeBase64`, even when the native intrinsics are present.
- `ENDO_BASE64_FORCE=native` — always use the native path; throw at
  module load if the intrinsics are absent.
- Unset — use native if present, else polyfill.

This gating is a *test-only affordance*.
In production the env var is unset and detection is automatic.
We do **not** ship a runtime switch on `globalThis` because that would
create a footgun: any tenant in a multi-tenant realm could flip the
switch at module load.

### Test Runner Configuration

The existing `ava` config runs all tests under one Node invocation.
We split the invalid-encoding assertions:

```
test/
  main.test.js            # Unchanged: round-trip tests (native or polyfill)
  invalid-polyfill.test.js  # Polyfill-specific error-message regexes
  invalid-native.test.js    # Native-path error-type assertions
```

Each invalid-encoding file runs under the appropriate `ENDO_BASE64_FORCE`
environment, set either by `ava`'s `environmentVariables` config or by
two `package.json` scripts that invoke `ava` with different env:

```json
"test": "yarn test:native && yarn test:polyfill",
"test:native":   "ENDO_BASE64_FORCE=native   ava",
"test:polyfill": "ENDO_BASE64_FORCE=polyfill ava"
```

Under `test:polyfill`, the existing regex assertions are used unchanged.
Under `test:native`, the file asserts that `decodeBase64` throws
without matching on message text, possibly asserting
`err instanceof SyntaxError` (when the native path is active).

### Coverage

CI matrix runs both invocations on every supported Node version.
On Node versions that pre-date the native intrinsics, `test:native` is
skipped via a `process.version` guard.
On XS-based runners, both paths are exercised if XS ships the
intrinsics; otherwise only the polyfill path runs.
The floor for "native available" is tracked in a single constant
(`MIN_NODE_WITH_BASE64_INTRINSIC`) in `test/_runtime-gate.js`.

### Benchmark

The existing `test/_bench-main.js` is extended with a third axis — it
already compares `encodeBase64` (dispatched) against `jsEncodeBase64`
(direct).
After this change, on a runtime with the native intrinsic, the
dispatched function exercises the native code path, and the benchmark
measures native-vs-JS throughput directly.
This produces the numbers that will justify the change in the NEWS
entry.

## Dependencies

| Design | Relationship |
|---|---|
| `@endo/hex` (sibling, parallel proposal) | Same ponyfill-shim pattern applied to `Uint8Array.fromHex` / `Uint8Array.prototype.toHex`. Structurally isomorphic modules; shared testing strategy. |
| `daemon-message-streaming` | Heavy consumer of `encodeBase64` / `decodeBase64` via `@endo/exo-stream`. Benefits proportionally from native throughput on every base64-encoded stream chunk. |
| `platform-fs` | `@endo/platform/fs/reader-ref.js` wraps `encodeBase64` in a `mapReader`. Benefits from this change transparently. |

## Phases

### Phase 1: Module Restructuring (S)

- Split dispatch out of `src/encode.js` and `src/decode.js`.
  `jsEncodeBase64` and `jsDecodeBase64` stay in `src/` and drop the
  `globalThis.Base64` check.
- Move the dispatch logic into `encode.js` and `decode.js` at the
  package root.
- Add `src/native.js` with the intrinsic references and option-bag
  adapters.
- Add `src/select.js` for the `ENDO_BASE64_FORCE` test hook.
- `harden` every named export.
- Full test suite continues to pass on both paths.

No public API change; no version bump beyond patch.

### Phase 2: Test Split and CI Matrix (S)

- Rename `test/main.test.js`'s "invalid encodings" test into
  `test/invalid-polyfill.test.js` (messages regex-matched).
- Add `test/invalid-native.test.js` (error-type assertions).
- Add `package.json` scripts `test:native`, `test:polyfill`; make the
  default `test` run both.
- Add `_runtime-gate.js` with the minimum Node version constant.
- CI runs both paths on all supported Node versions that ship the
  intrinsic; older Node versions skip `test:native`.

### Phase 3: NEWS and Documentation (S)

- Update `CHANGELOG.md` with a new minor-version entry describing the
  native fallthrough, the unchanged API, and the loosened error-
  message contract.
- Update `README.md` with a short section noting that the package is
  a ponyfill for `Uint8Array.fromBase64` / `Uint8Array.prototype.toBase64`
  and specifying the runtime floor for the native path.
- Benchmark numbers on one representative Node version go into the
  NEWS entry.

## Design Decisions

1. **Detect once, close over references.**
   The intrinsic lookup happens at module load and is captured in a
   local binding before any caller can reach `encodeBase64`.
   Post-lockdown mutation cannot redirect the function.
   This is the same pattern used throughout Endo (e.g., capturing
   `Object.freeze` or `Array.prototype.push` at module scope).

2. **Feature-test `toBase64` and `fromBase64` independently.**
   A realm that ships only one — not observed in the wild, but
   cheap to guard against — still works correctly.
   Neither direction falsely claims the other.

3. **Preserve `jsEncodeBase64` / `jsDecodeBase64` as named exports.**
   They remain exported from `src/encode.js` and `src/decode.js` for
   benchmark use, for the forced-polyfill test path, and so that any
   downstream who has pinned to the polyfill's exact error messages
   can continue to import it directly during migration.

4. **Loosen the error-message contract.**
   The existing error-message regexes in `test/main.test.js` are
   polyfill-internal.
   No downstream consumer matches them.
   Keeping them intact would require re-throwing every native
   `SyntaxError`, which is either free (happy path) or pure cost
   (error path) with no benefit.
   Documenting the loosening in `CHANGELOG.md` is sufficient.

5. **Ignore the `name` parameter on the native path.**
   `name` was an error-message embellishment.
   The native path's error messages do not include it.
   Silently accepting and ignoring the argument preserves the
   function signature; no caller becomes a type error.

6. **`ENDO_BASE64_FORCE` is test-only, env-driven.**
   A global switch would be a capability leak.
   An import-time flag would force every consumer into deciding the
   path.
   An environment variable keeps the affordance out of the code path
   that ships to production, where detection is automatic.

7. **No `base64url` alphabet in this change.**
   `@endo/base64` has only ever supported the RFC 4648 §4 alphabet.
   Adding `base64url` — or making the alphabet an option — is a
   separate feature that could piggyback on the native intrinsic's
   option bag, but would widen the API surface and is out of scope
   here.

8. **No `omitPadding` option exposed.**
   The package has always emitted padding.
   Changing that is a separate API decision.

9. **Do not remove the `globalThis.Base64` XS path entirely.**
   Earlier XSnap builds still ship `globalThis.Base64` and no native
   `Uint8Array.fromBase64`.
   If either of those runtime variants is supported, the dispatch in
   `src/native.js` can fall through a *second* time to
   `globalThis.Base64.encode` / `globalThis.Base64.decode` before
   giving up and selecting the pure-JS polyfill.
   The adapter for the `globalThis.Base64.decode` case that returns
   an `ArrayBuffer` (currently `adaptDecoder`) is preserved.
   If no supported XS build ships `globalThis.Base64` without also
   shipping `Uint8Array.fromBase64`, this branch is removed.

## Known Gaps

- [ ] Confirm the minimum Node version that ships
      `Uint8Array.fromBase64` and record it in `_runtime-gate.js`.
      As of writing, Node 22 ships it; verify against the current
      `engines.node` floor in the monorepo root `package.json`.
- [ ] Confirm that `ses` under `lockdown` does not attenuate or remove
      `Uint8Array.fromBase64`.
      If it does, the module can still capture the reference pre-
      lockdown, but the test suite needs a `lockdown`-on path to
      verify.
- [ ] Benchmark and publish throughput numbers for at least one
      short-string workload and one megabyte-scale workload, on native
      and polyfill paths, on one representative Node version.
- [ ] Decide whether `@endo/hex` and `@endo/base64` should share a
      single `select.js` or each carry their own.
      A shared module adds a cross-package dependency; the duplication
      is ~10 lines.
- [ ] Decide whether to drop the `globalThis.Base64` XS-specific
      dispatch entirely.
      This requires confirming no supported Endo runtime lacks
      `Uint8Array.fromBase64` while providing `globalThis.Base64`.
- [ ] Decide whether to lift the `name` parameter of `decodeBase64`
      into a formal deprecation.
      It continues to be accepted and ignored on the native path; a
      future major version could remove it.

## Prompt

> Write a design document for refactoring `@endo/base64` so that it
> falls through to the native `Uint8Array` base64 implementation when
> available, retaining its existing public API.
>
> Research the native `Uint8Array.fromBase64` /
> `Uint8Array.prototype.toBase64` proposal (TC39 "Uint8Array to/from
> base64"); document what runtimes have it; note option bags
> (`alphabet`, `lastChunkHandling`, `omitPadding`).
>
> Outline the detection strategy
> (`typeof Uint8Array.fromBase64 === 'function'`), how to wire it
> inside a hardened module, how to preserve current behavior (option
> mapping from @endo/base64's current defaults to the native option
> bag), the new internal shape (split into a thin entry point
> selecting native vs. polyfill).
>
> Document API compatibility, including subtle differences in error
> semantics between the current polyfill and the native, and how to
> bridge them.
>
> Describe testing: run the existing test suite under both paths:
> force the polyfill (`--delete-fromBase64`) and force native; gate
> the runtime choice for tests.
>
> Model the ponyfill shim pattern that `@endo/hex` will also adopt.
