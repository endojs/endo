# `@endo/hex` — Hex Encode/Decode Ponyfill

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Updated** | 2026-05-18 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |

## Status

Shipped on `llm`: `@endo/hex` exists at `packages/hex/` with
encode/decode entry points and tests, and the dev-dependency cycle
was broken via `@endo/hex-test` per PR
[#211](https://github.com/endojs/endo-but-for-bots/pull/211). Earlier
consumer migration (daemon, OCapN) landed via `kriskowal-hex`
follow-up commits. Synthetic `@endo/hex-test` package (Cut 2 of the
break-dev-dependency-cycles design) is also merged.

## What is the Problem Being Solved?

Hex encoding and decoding of byte arrays is reimplemented ad-hoc across
the Endo monorepo.
At least four independent implementations currently coexist, each with
slightly different conventions, error handling, and runtime assumptions.

The duplication has three concrete costs:

1. **Inconsistent semantics.**
   `packages/daemon/src/hex.js` silently truncates on odd-length input;
   `packages/ocapn/src/buffer-utils.js` throws;
   `packages/relay-server/src/protocol.js` truncates.
   Callers that move bytes between these subsystems cannot rely on a
   single error contract.

2. **Native fast paths are only wired up in one package.**
   `packages/daemon/src/hex.js` is the only implementation that detects
   and delegates to `Uint8Array.prototype.toHex` and
   `Uint8Array.fromHex` (TC39 proposal-arraybuffer-base64, Stage 3+,
   already permitted in `packages/ses/src/permits.js`).
   Every other site is stuck on the slow
   `Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')`
   fallback even on modern engines.

3. **No canonical home.**
   Consumers that need hex pull from `Buffer.from(...).toString('hex')`
   (Node-only), from `./hex.js` relative paths (daemon-internal),
   or inline the arithmetic fresh.
   There is no package-level import analogous to
   `import { encodeBase64, decodeBase64 } from '@endo/base64'`.

`@endo/hex` consolidates these into a single
Hardened-JavaScript-compatible ponyfill that mirrors `@endo/base64`
exactly, including package shape, tooling, and test scaffolding.
When the TC39 native methods are available, calls short-circuit to
them; otherwise a portable implementation runs.

## Design

### Package Layout

Mirrors `packages/base64/` file-for-file.

```
packages/hex/
  CHANGELOG.md
  LICENSE
  README.md
  SECURITY.md
  index.js               # Re-exports encodeHex, decodeHex
  encode.js              # Re-export of src/encode.js
  decode.js              # Re-export of src/decode.js
  src/
    common.js            # Shared alphabet constants, freeze()
    encode.js            # jsEncodeHex + encodeHex with native short-circuit
    decode.js            # jsDecodeHex + decodeHex with native short-circuit
  test/
    main.test.js         # Round-trip, fixture, and error-path tests
    _bench-main.js       # Optional micro-benchmark, mirrors base64's
  package.json
  tsconfig.json
  tsconfig.build.json
  typedoc.json
```

Unlike `@endo/base64`, there is **no** analogue of `atob.js`, `btoa.js`,
or `shim.js`.
Those files exist in `@endo/base64` to provide globals that the
browser platform already defines for base64 (legacy BOM).
There are no hex equivalents in any host environment, so the shim
surface is omitted.
If TC39 native methods ship and we want to force them into scope,
a future `shim.js` can install them onto `Uint8Array.prototype`.

### Exports

The `package.json` `exports` field mirrors `@endo/base64`, minus the
unused shim entries:

```jsonc
{
  "name": "@endo/hex",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./encode.js": "./encode.js",
    "./decode.js": "./decode.js",
    "./package.json": "./package.json"
  }
}
```

Top-level named exports:

```js
// @endo/hex
export { encodeHex } from './src/encode.js';
export { decodeHex } from './src/decode.js';
```

### Signatures

```js
/**
 * Encodes a Uint8Array as a hex string.
 * Default alphabet is lowercase; pass { uppercase: true } for uppercase.
 *
 * @param {Uint8Array} bytes
 * @param {{ uppercase?: boolean }} [options]
 * @returns {string}
 */
export const encodeHex = (bytes, options) => { ... };

/**
 * Decodes a hex string to a Uint8Array.  Accepts both upper- and
 * lowercase inputs.  Throws on odd-length strings and non-hex
 * characters.
 *
 * @param {string} string
 * @param {string} [name]  Name of the string for error diagnostics.
 * @returns {Uint8Array}
 */
export const decodeHex = (string, name) => { ... };
```

The shape of `decodeHex(string, name)` matches
`decodeBase64(string, name)` in `@endo/base64` — the second argument
is the label used in error messages, not a functional option.

### Native Fallthrough Detection

The detection pattern matches the one currently in
`packages/daemon/src/hex.js`, extended with SES-safe method extraction
and parity with `@endo/base64`'s native-fallthrough pattern:

```js
// src/encode.js
// @ts-check
/* global globalThis */

const ArrayFromCharCode = String.fromCharCode;
const { from: uint8ArrayFrom } = Uint8Array;

// Detected once at module load.  The proposal-arraybuffer-base64
// methods are own properties on Uint8Array / Uint8Array.prototype.
const nativeToHex =
  typeof (/** @type {any} */ (Uint8Array.prototype).toHex) === 'function'
    ? /** @type {(bytes: Uint8Array) => string} */ (
        /** @type {any} */ (Uint8Array.prototype).toHex
      )
    : undefined;

const hexAlphabetLower = '0123456789abcdef';
const hexAlphabetUpper = '0123456789ABCDEF';

/**
 * Portable fallback implementation.  Exported for benchmarks and
 * conformance testing; not part of the module's public API.
 *
 * @param {Uint8Array} bytes
 * @param {{ uppercase?: boolean }} [options]
 * @returns {string}
 */
export const jsEncodeHex = (bytes, options) => {
  const alphabet = options?.uppercase ? hexAlphabetUpper : hexAlphabetLower;
  let string = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    string += alphabet[b >>> 4] + alphabet[b & 0x0f];
  }
  return string;
};

/**
 * @type {typeof jsEncodeHex}
 */
export const encodeHex =
  nativeToHex !== undefined
    ? (bytes, options) => {
        if (options?.uppercase) {
          // TC39 native only produces lowercase.  Uppercase is rare
          // enough that falling back to the JS path is acceptable.
          return jsEncodeHex(bytes, options);
        }
        return nativeToHex.call(bytes);
      }
    : jsEncodeHex;
```

```js
// src/decode.js
// @ts-check
/* global globalThis */

const nativeFromHex =
  typeof (/** @type {any} */ (Uint8Array).fromHex) === 'function'
    ? /** @type {(hex: string) => Uint8Array} */ (
        /** @type {any} */ (Uint8Array).fromHex
      )
    : undefined;

/**
 * Portable fallback implementation.
 *
 * @param {string} string
 * @param {string} [name]
 * @returns {Uint8Array}
 */
export const jsDecodeHex = (string, name = '<unknown>') => {
  if (string.length % 2 !== 0) {
    throw Error(
      `Hex string must have an even length, got ${string.length} in string ${name}`,
    );
  }
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const hi = hexDigitValue(string.charCodeAt(i * 2));
    const lo = hexDigitValue(string.charCodeAt(i * 2 + 1));
    if (hi < 0 || lo < 0) {
      throw Error(
        `Invalid hex character at offset ${hi < 0 ? i * 2 : i * 2 + 1} of string ${name}`,
      );
    }
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
};

/** @type {typeof jsDecodeHex} */
export const decodeHex =
  nativeFromHex !== undefined
    ? (string, name) => {
        try {
          return nativeFromHex(string);
        } catch (e) {
          // Native throws SyntaxError with no caller context.  Rewrap
          // to match the fallback's error shape.
          throw Error(
            `Invalid hex in string ${name ?? '<unknown>'}: ${/** @type {Error} */ (e).message}`,
          );
        }
      }
    : jsDecodeHex;
```

### SES and Hardening Considerations

- Every named export has a companion `harden()` call.
  Module-level constants (`hexAlphabetLower`, `hexAlphabetUpper`) are
  hardened at declaration.
- The native method is looked up **once** at module load and bound
  into a local `const`.
  A malicious compartment that tampers with
  `Uint8Array.prototype.toHex` after module initialization cannot
  redirect our call site.
  (SES lockdown already freezes the prototype, but the pattern matches
  `@endo/base64`'s defensive stance regardless.)
- Input validation happens in the JS path unconditionally.
  When we delegate to the native path, we rewrap native errors so that
  consumers can match on a stable error message shape across engines.
- No module-scope mutable state;
  detection is pure and deterministic.

### Parity with `@endo/base64`

| Concern | `@endo/base64` | `@endo/hex` |
|---------|----------------|-------------|
| Named exports | `encodeBase64`, `decodeBase64`, `atob`, `btoa` | `encodeHex`, `decodeHex` |
| Secondary entry points | `./atob.js`, `./btoa.js`, `./encode.js`, `./decode.js`, `./shim.js` | `./encode.js`, `./decode.js` |
| Native fast path | `globalThis.Base64.encode` / `.decode` (XS) | `Uint8Array.prototype.toHex` / `Uint8Array.fromHex` (TC39) |
| Fallback algorithm | Bit-register quantum accumulator | Byte-wise nibble lookup |
| Error API | `Error("Invalid base64 character …")`, includes string name | `Error("Invalid hex character …")`, includes string name |
| Exported slow path | `jsEncodeBase64`, `jsDecodeBase64` (not re-exported from index) | `jsEncodeHex`, `jsDecodeHex` (not re-exported from index) |
| `shim.js` | Installs `atob`/`btoa` globals | **Omitted** (no hex globals to shim; reserved for future Uint8Array prototype install) |
| Benchmark harness | `test/_bench-main.js` | `test/_bench-main.js` (same skeleton) |

## Audit

Every byte-level hex encode/decode site in the monorepo, excluding the
vendored `packages/test262-runner/test262/` fixtures (which are
externally maintained and not migration targets).

Sites that use `toString(16)` or `parseInt(x, 16)` for non-byte-array
purposes (number-to-hex formatting, IPv6 group parsing, Unicode escape
parsing) are listed separately and are **not** migration targets —
`@endo/hex` is specifically for `Uint8Array ↔ string`.

### Byte-array hex sites (migration targets)

| File | Lines | Direction | Case | Form | Notes |
|---|---|---|---|---|---|
| `packages/daemon/src/hex.js` | 14–20, 28–39 | encode + decode | lower | `toString(16).padStart(2, '0')` / `parseInt(slice, 16)` | Existing ponyfill with native short-circuit. Exports `toHex`, `fromHex`. **Delete and re-export from `@endo/hex`** (or retain as thin adapter if rename is costly). |
| `packages/daemon/test/hex.test.js` | 1–24 | test | lower | — | Five assertions: encode, empty encode, decode, empty decode, round-trip. **Migrate to `@endo/hex` test suite**; retain a shim test if the daemon re-export survives. |
| `packages/daemon/src/daemon.js` | 50, 2359, 3346, 3353, 3354, 3510, 3517, 3518, 4873 | encode + decode | lower | via `./hex.js` | Keypair hex serialization, `sign(hexBytes)` RPC. **Change import to `@endo/hex`**. No call-site rewriting needed. |
| `packages/daemon/src/daemon-node-powers.js` | 15, 319, 455–465 | encode + decode | lower | via `./hex.js` and `bytes.toString('hex')` | Uses both the ponyfill and Node `Buffer.toString('hex')`. `randomHex256` (line 319) should either stream bytes through `encodeHex` or stay Node-native — see Design Decision 4. |
| `packages/daemon/src/daemon-node-powers.js` | 309 | encode | lower | `digester.digest('hex')` | `makeSha256().digestHex()` delegates to Node's `crypto.createHash().digest('hex')`. Retained at the Node-powers boundary; callers still receive lowercase hex. |
| `packages/daemon/src/daemon-node-powers.js` | 325–328 | decode | lower | `Buffer.from(str, 'hex')` | Decodes the fixed PKCS8 DER prefix for Ed25519 keys. **Replace with `decodeHex`**; preserves the constant as `Uint8Array`. |
| `packages/daemon/src/host.js` | 25, 946 | encode + decode | lower | via `./hex.js` | `sign(hexBytes)` at the host boundary. **Change import to `@endo/hex`**. |
| `packages/daemon/src/networks/ws-relay.js` | 12, 103, 329, 331, 419 | encode + decode | lower | via `../hex.js` | Node ID hex serialization, challenge/response signing on the relay wire. **Change import to `@endo/hex`**. |
| `packages/daemon/src/networks/libp2p.js` | 22, 290 | decode | lower | via `../hex.js` | Node-ID-hex → seed bytes for libp2p key derivation. **Change import to `@endo/hex`**. |
| `packages/relay-server/src/protocol.js` | 29–30, 33–39 | encode + decode | lower | inline JS | Duplicate of the daemon ponyfill, sans native fallthrough. Relay server must remain a leaf package with no Node-specific imports, so `@endo/hex` is a better dependency than `@endo/daemon/hex.js`. **Delete local impl, depend on `@endo/hex`**. |
| `packages/relay-server/src/relay.js` | 25, 193, 234 | encode | lower | via `./protocol.js` | `hexNodeId` and `targetHex` for diagnostic logging and session key derivation. **No call-site change** after `protocol.js` re-exports or imports from `@endo/hex`. |
| `packages/ocapn/src/client/util.js` | 18–20 | encode | lower | `Buffer.from(bytes).toString('hex')` | `toHex(value: ArrayBufferLike)` helper. **Replace** `Buffer.from(...).toString('hex')` with `encodeHex(immutableArrayBufferToUint8Array(value))`. Removes a Node-only `Buffer` import from this module. |
| `packages/ocapn/src/client/ocapn.js` | 32, 537, 580, 591, 604, 644 | encode | lower | via `./util.js` | Session-id and gift-id hex keys in multimap lookup, diagnostic messages. No call-site change. |
| `packages/ocapn/src/client/index.js` | 16, 114, 165 | encode | lower | via `./util.js` | Session-id-to-public-key map keyed by hex. No call-site change. |
| `packages/ocapn/src/buffer-utils.js` | 61–72 | decode | lower | inline JS + length check | `hexToArrayBuffer(hexString)`. Throws on odd length. Returns an immutable `ArrayBuffer` rather than a `Uint8Array`. **Keep the wrapper**; internally call `decodeHex(hexString)` and feed through `uint8ArrayToImmutableArrayBuffer`. |
| `packages/ocapn/test/buffer-utils.test.js` | 305–310 | encode (test fixture) | lower | `toString(16).padStart(2, '0')` | Builds the `'00'..'ff'` string to round-trip through `hexToArrayBuffer`. **Migrate to `encodeHex`** or retain inline as a spec fixture. Low priority. |
| `packages/ocapn/test/codecs/_codecs_util.js` | 39–43, 356–359 | encode | lower | `Buffer.from(buffer).toString('hex')` and inline `toString(16)` | Test snapshot formatting for non-UTF-8 syrup bytes. **Migrate to `encodeHex`** to remove the `Buffer` dependency from test scaffolding. |
| `packages/ocapn/test/codecs/passable-fuzz.test.js` | 158 | encode | lower | `Buffer.from(bytes).toString('hex')` | Fuzz diagnostic. **Migrate to `encodeHex`**. |
| `packages/check-bundle/index.js` | 14 | encode | lower | `hash.digest().toString('hex')` | Node `crypto.createHash('sha512').digest('hex')` — SHA-512 digest at the Node powers boundary. **Retained as-is**: the hash digest already returns a hex string directly from Node; converting through `encodeHex` would require `digest()` + conversion with no benefit. Marked as "boundary" — not a migration target. |
| `packages/check-bundle/test/check-bundle.test.js` | 30 | encode | lower | `hash.digest().toString('hex')` | Same as above. Not a migration target. |
| `packages/compartment-mapper/src/node-powers.js` | 162–168 | encode | lower | `hash.digest().toString('hex')` | Same pattern. Not a migration target. |
| `packages/compartment-mapper/demo/policy/app.js` | 15–18 | decode | lower | `Buffer.from(str, 'hex')` | Demo code parsing a hex-encoded 32-byte key. Could migrate for consistency; **low priority**, not on the critical migration path. |
| `packages/cli/src/random.js` | 9 | encode | lower | `bytes.toString('hex')` | Node `crypto.randomBytes(16).toString('hex')`. Same boundary concern — the Node primitive returns hex directly. **Retained as-is** at the Node boundary. |
| `packages/base64/test/main.test.js` | 20 | format | lower | `byte.toString(16).padStart(4, '0')` | **Not a byte-array site** — formats a single 16-bit Unicode code point in a diagnostic. Out of scope. |

### Non-migration sites (non-byte-array hex)

Sites that touch hex but do not encode/decode `Uint8Array`.
These are listed for completeness; `@endo/hex` does **not** replace them.

| File | Purpose |
|---|---|
| `packages/marshal/src/encodePassable.js` line 137 | 64-bit `BigInt.toString(16)` for passable-number encoding. Not a byte-array. |
| `packages/marshal/src/encodePassable.js` line 147 | Reverse: `BigInt("0x" + suffix)`. Not a byte-array. |
| `packages/marshal/test/encodePassable.test.js` lines 272, 333 | Unicode code point formatting (`U+XXXX`). |
| `packages/daemon/src/cidr.js` line 79 | Parse IPv6 group (`parseInt(group, 16)`). Not a byte-array, four-digit groups. |
| `packages/zip/src/format-reader.js` line 354 | Error diagnostic: `bitFlag.toString(16)`. |
| `packages/genie/src/dom-parser/tokenizer.js` line 80 | HTML numeric character reference `&#xABCD;` code-point parse. |
| `packages/whylip/src/hooks/useConversation.js` line 52 | JSON escape `\\uXXXX` code-point parse. |
| `packages/fae/test/whylip-json-encoding.test.js` line 73 | Same. |
| `packages/ses/test/tame-nan-sidechannel.test.js` line 30 | `BigInt.toString(16)` for debugging. |

### Edge cases the new API must support

- **Lowercase is the default.**
  All existing Endo call sites produce lowercase hex.
  The native `Uint8Array.prototype.toHex` is specified to produce
  lowercase.
- **Uppercase on demand.**
  No current Endo caller needs uppercase, but the option is carried so
  future callers (e.g., canonical JSON or RFC-specified wire formats)
  have it.
- **Prefixed forms are not the ponyfill's concern.**
  `0x…`, spaced `de ad be ef`, and grouped hex are handled by the
  caller before/after `encodeHex` / `decodeHex`.
  The ponyfill accepts only a bare hex string (even length, `[0-9a-fA-F]*`).
- **Length validation.**
  `decodeHex` throws on odd-length input.
  This matches `ocapn/src/buffer-utils.js` and the TC39 native spec.
  It fixes the silent-truncation behavior in the existing daemon
  ponyfill and in `relay-server/src/protocol.js`.
- **Invalid characters.**
  `decodeHex` throws on any character outside `[0-9a-fA-F]`.
  Again, matches the TC39 native spec.

## Migration

The package is shipped first and adopted incrementally.
No call-site rewrites are load-bearing for the package itself.

### Phase 1: Create `@endo/hex`

Add the package under `packages/hex/` as a cloned-and-renamed
`packages/base64/`.

- `package.json` with `"name": "@endo/hex"`, `"version": "0.1.0"`,
  same `devDependencies`, `scripts`, `exports` (minus `atob.js`,
  `btoa.js`, `shim.js`), and `eslintConfig` as `@endo/base64`.
- `src/common.js`, `src/encode.js`, `src/decode.js` as specified in the
  Design section.
- `index.js`, `encode.js`, `decode.js` re-exports.
- `tsconfig.json`, `tsconfig.build.json`, `typedoc.json` copied
  verbatim with the package path adjusted.
- `README.md` modeled on `packages/base64/README.md`.
- `CHANGELOG.md` entry: "Initial release.
  Ponyfill for TC39 proposal-arraybuffer-base64 hex methods."
- `test/main.test.js` with round-trip, fixture, error-path, and
  (where available) native-path tests.
  Mirrors the structure of `packages/base64/test/main.test.js`.

No downstream consumers import the new package yet.
Package lands with full test coverage;
fits in **S** (< 500 LOC impact).

### Phase 2: Migrate the daemon

Replace `packages/daemon/src/hex.js` with a re-export from `@endo/hex`:

```js
// packages/daemon/src/hex.js (transitional)
export { encodeHex as toHex, decodeHex as fromHex } from '@endo/hex';
```

The name mismatch (`toHex` vs `encodeHex`) is handled by the re-export
alias.
All daemon call sites (`daemon.js`, `daemon-node-powers.js`, `host.js`,
`networks/ws-relay.js`, `networks/libp2p.js`) continue to import from
`./hex.js` or `../hex.js`.
No semantic change;
tests should pass unmodified.

A follow-up commit migrates imports to `@endo/hex` directly and
deletes `packages/daemon/src/hex.js`.
Fits in **S** (1 day).

### Phase 3: Migrate the relay server

Delete the `toHex` and `fromHex` definitions from
`packages/relay-server/src/protocol.js` (lines 26–39) and re-export
from `@endo/hex`:

```js
// packages/relay-server/src/protocol.js
export { encodeHex as toHex, decodeHex as fromHex } from '@endo/hex';
```

`packages/relay-server/src/relay.js` is unchanged.
Adds `@endo/hex` to `packages/relay-server/package.json`
`dependencies`.
The relay server gets native-fast-path hex for free.
Fits in **S** (< 1 hour).

### Phase 4: Migrate OCapN

1. `packages/ocapn/src/client/util.js`:
   replace the `Buffer.from(...).toString('hex')` body of `toHex` with
   `encodeHex(immutableArrayBufferToUint8Array(value))`.
   Removes `import { Buffer } from 'buffer'` from this module.
2. `packages/ocapn/src/buffer-utils.js`:
   rewrite `hexToArrayBuffer` to delegate to `decodeHex`, then wrap
   with `uint8ArrayToImmutableArrayBuffer`.
   Preserves the existing error message about even length by leaning
   on `decodeHex`'s error path.
3. Test files (`test/buffer-utils.test.js`, `test/codecs/_codecs_util.js`,
   `test/codecs/passable-fuzz.test.js`) migrate to `encodeHex` to remove
   Node `Buffer` imports from test scaffolding.

Adds `@endo/hex` to `packages/ocapn/package.json` `dependencies`.
Fits in **S** (half day).

### Phase 5: Document and release

- Add a `CHANGELOG.md` entry under `@endo/hex` noting the initial
  release.
- Update `packages/daemon/CHANGELOG.md` to note the consolidation.
- Update the README under `designs/` per the global convention.
- Publish to npm with `publishConfig.access: public` at the same
  cadence as `@endo/base64`.

### Deferred / out of scope

- `packages/compartment-mapper/demo/policy/app.js` — demo code,
  migrate opportunistically.
- `packages/check-bundle/*` and `packages/compartment-mapper/src/node-powers.js` —
  these call `hash.digest('hex')` at the Node `crypto` boundary,
  where the digest already returns hex.
  Converting to `digest()` → `encodeHex` would allocate an
  intermediate `Uint8Array` with no clarity gain.
  Flagged "boundary" and left alone.
- `packages/cli/src/random.js`,
  `packages/daemon/src/daemon-node-powers.js` line 319 —
  same boundary concern for `crypto.randomBytes(n).toString('hex')`.
  Could migrate by changing to `crypto.randomBytes(n)` and piping
  through `encodeHex` for uniformity;
  not done in the initial migration.

## API Compatibility

- `@endo/hex` is a **new** package;
  there is no prior `@endo/hex` to be compatible with.
- The migration preserves the existing `toHex` / `fromHex` call-site
  surface within the daemon and relay server during Phase 2–3 via
  re-export aliases.
- The native `Uint8Array.fromHex` is specified to throw `SyntaxError`
  on invalid input;
  the `jsDecodeHex` fallback throws a plain `Error` with a message
  that includes the offending string's name.
  `decodeHex` rewraps native errors into the fallback's error shape so
  consumers can rely on a single error-message format across engines.
- The existing `hexToArrayBuffer` in `@endo/ocapn` retains its error
  messages (`"Hex string must have an even length"`) so its tests
  continue to pass.

## Testing

Test suite lives at `packages/hex/test/main.test.js` and mirrors the
structure of `packages/base64/test/main.test.js`.
Coverage targets:

- **Round-trip across the full byte space.**
  `encodeHex(fromHex(s))` and `fromHex(encodeHex(b))` for fixtures
  including empty, single-byte, all 256 byte values in sequence, and
  randomized sequences at a range of lengths.
- **Case folding.**
  `decodeHex` accepts uppercase, lowercase, and mixed-case input.
  `encodeHex` produces lowercase by default, uppercase under
  `{ uppercase: true }`.
- **Odd-length input rejection.**
  `decodeHex('a')`, `decodeHex('abc')`, etc., throw with message
  including the string length and caller-supplied name.
- **Invalid-character rejection.**
  `decodeHex('gg')`, `decodeHex('0z')`, `decodeHex(' 0a')`, etc.,
  throw with message identifying offset and name.
- **Empty-string handling.**
  `encodeHex(new Uint8Array([])) === ''` and
  `decodeHex('')` returns a zero-length `Uint8Array`.
- **Native-path conformance.**
  When `Uint8Array.prototype.toHex` is available, a test captures its
  output and asserts byte-for-byte equality with the JS fallback.
  Mirrors `_capture-atob-btoa.js` but captures the TypedArray
  prototype methods instead.
- **SES compatibility.**
  A test imports `@endo/hex` under `@endo/ses-ava/prepare-endo.js`
  (same as `packages/daemon/test/hex.test.js`) to confirm the module
  loads and operates after lockdown.

An `_bench-main.js` harness measures encode and decode throughput for
native vs JS paths, modeled after `packages/base64/test/_bench-main.js`.

## Dependencies

| Design | Relationship |
|---|---|
| `base64-native-fallthrough.md` (sibling, in parallel) | Shares the runtime-detection pattern.  Both packages should use the same shape for `const native... = typeof X === 'function' ? X : undefined` and the same error-rewrap strategy.  If one design diverges, the other should be updated for consistency. |
| [daemon-256-bit-identifiers](daemon-256-bit-identifiers.md) | **Complete.**  Identifiers are 256-bit values rendered as 64-character lowercase hex.  The identifier pipeline (`deriveId`, `digestHex`, `toHex`) is the largest single consumer of the new package. |
| [daemon-agent-network-identity](daemon-agent-network-identity.md) | Planned.  Agent keypair bytes are exchanged over the wire as hex.  Will depend on `@endo/hex` from the outset. |
| [ocapn-noise-network](ocapn-noise-network.md) | Planned.  Noise handshake involves 32-byte public keys and 16-byte nonces, canonically rendered as hex for diagnostics and test vectors.  Will import from `@endo/hex`. |

## Design Decisions

1. **New package, not an addition to `@endo/base64`.**
   The two packages have orthogonal scope (base64 RFC 4648 vs hex
   RFC 4648 § 8).
   Keeping them separate matches TC39's own split (two separate
   Uint8Array method pairs) and keeps the bundler cost of `@endo/hex`
   scoped to callers that actually use it.

2. **`encodeHex` / `decodeHex` naming, not `toHex` / `fromHex`.**
   Matches `encodeBase64` / `decodeBase64` in `@endo/base64`, which is
   the canonical model.
   Existing daemon call sites use `toHex` / `fromHex`;
   they are migrated via re-export alias in Phase 2 without call-site
   edits.

3. **No `shim.js`.**
   There is no legacy global analogous to `atob` / `btoa` for hex.
   A future `shim.js` that installs the TC39 methods onto
   `Uint8Array.prototype` can be added when/if it becomes useful, but
   is not part of the initial surface.
   SES lockdown will have already frozen the prototype by the time
   userland code runs, so a shim has to load before lockdown
   regardless, matching the `@endo/base64/shim.js` usage pattern.

4. **Node boundaries keep their direct hex usage.**
   `crypto.createHash().digest('hex')`,
   `crypto.randomBytes(n).toString('hex')`,
   and `Buffer.from(str, 'hex')` at the Node `daemon-node-powers.js`
   boundary are **not** migrated.
   They live in an already-Node-specific module and the hex format is
   provided by the Node primitive directly.
   Forcing them through `@endo/hex` would add a `Uint8Array`
   allocation without clarity benefit.
   The policy: inside SES-locked compartments and platform-agnostic
   code, use `@endo/hex`;
   at the Node powers boundary, use whatever the `crypto` API gives
   you.

5. **`options.uppercase` only on encode;  `decodeHex` accepts both.**
   Symmetric to the native TC39 proposal:
   `Uint8Array.prototype.toHex` takes no case option (output is
   lowercase);
   `Uint8Array.fromHex` accepts both cases.
   Our `options.uppercase` is an additive extension that falls back to
   the JS path when set, matching the proposal's philosophy of
   delegating to user code for non-default behavior.

6. **Error rewrapping at the native boundary.**
   Native `fromHex` throws `SyntaxError`;
   our fallback throws `Error`.
   We rewrap native errors into the fallback's shape so callers who
   write `catch (e) { if (/Invalid hex/.test(e.message)) ... }` see
   the same shape on both paths.
   Cost: an extra try/catch and an allocation on the error path.
   Benefit: a stable error contract.

7. **Detection is one-shot at module load.**
   The native method reference is captured once, at import time, into
   a module-private `const`.
   This is the standard Hardened-JS pattern for protecting against
   later prototype tampering.
   SES lockdown already freezes the prototype, so the defensive
   measure is belt-and-suspenders — but it matches `@endo/base64`.

8. **Audit drives scope.**
   The audit table is deliberately exhaustive so the migration review
   can be a mechanical check against it.
   Non-migration sites are listed so reviewers can confirm nothing is
   missed and so future hex usage can be framed against the same
   distinction.

## Known Gaps

- [ ] Native TC39 `Uint8Array.prototype.toHex` does not accept an
      options bag.
      If the proposal adds `{ uppercase }` before Stage 4, revisit the
      encode fast path to avoid the fallback on uppercase.
- [ ] `packages/compartment-mapper/demo/policy/app.js` migration is
      deferred because the demo is CommonJS and requires a richer
      interop story.
- [ ] No benchmark numbers are included here.
      `_bench-main.js` will produce them;
      a follow-up commit on the package can publish a comparison
      between native and JS paths for representative identifier sizes
      (16, 32, 64 bytes).
- [ ] `@endo/hex` does not yet have a `./lite` export for environments
      that want to avoid the native-detection branch (e.g., XS under
      benchmarking).
      Add if/when a consumer asks.
- [ ] `Uint8Array.prototype.setFromHex` (writes into an existing
      buffer) is not mirrored.
      Add if a consumer asks;
      the two-function surface is sufficient for all current call
      sites.

## Prompt

> Write a design document at `designs/hex-package.md` for introducing
> a new `@endo/hex` package — a hex encode/decode ponyfill shim modeled
> on `@endo/base64`, that falls through to the native `Uint8Array` hex
> methods when available.
>
> Audit every hex encode/decode in the monorepo (grep the whole repo,
> excluding `node_modules/`) and present it as a table, including the
> daemon 256-bit identifiers, OCapN wire formats, netstring,
> errors/marshal digests, and any other package surface.
> Record file path and line number, encode vs decode, case, special
> handling (prefix, padding, byte groups, separators), and exported
> utility if any.
>
> Model the API on `@endo/base64`:
> exports `encodeHex(bytes)` and `decodeHex(string)`.
> Consider option-bag parity with the native proposal.
> Verify the exact TC39 native names before writing.
>
> Metadata: **Created** 2026-04-23,
> **Author** `Kris Kowal (prompted)`,
> **Status** `Not Started`.
> Sections: Problem, Design, Audit, Migration, API Compatibility,
> Testing, Dependencies, Design Decisions, Known Gaps, Prompt.
> Follow the project Markdown Style Guide (80–100 cols, one sentence
> per line).
> Do NOT edit `designs/README.md`.
> Aim for the depth of `designs/platform-fs.md` and structure the
> audit like `designs/daemon-mount.md`'s concrete file enumeration.
