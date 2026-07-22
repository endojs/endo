# Endor native ZIP DEFLATE for XS

| | |
|---|---|
| **Created** | 2026-07-22 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | [PR #160 review](https://github.com/endojs/endo-but-for-bots/pull/160#discussion_r3628160416) |

## What is the Problem Being Solved?

`@endo/zip` deliberately leaves compression pluggable.  The helpers exported at
`@endo/zip/deflate.js` and `@endo/zip/inflate.js` currently implement raw
DEFLATE through `CompressionStream('deflate-raw')` and
`DecompressionStream('deflate-raw')`.
That is an appropriate web implementation, but XS does not provide those web
stream APIs.
The exo zip and unzip adapters therefore probe for the APIs and fall back to
STORE entries or fail when they encounter a DEFLATE entry.

Endor already embeds XS in Rust and registers native byte-oriented functions
before SES lockdown.
The compression operation is a pure transformation, not a filesystem, network,
or process capability.
Endor should expose it through that existing host-function boundary and select
the small XS adapter at bundle resolution time, without changing the public
`@endo/zip` API or putting a web-stream shim in XS.

## Design

### Conditional package surface

`packages/zip/package.json` will give the existing `./deflate.js` and
`./inflate.js` subpath exports an `xs` branch before their `default` branch.
The `default` branch remains the current `CompressionStream` implementation.
The `xs` branches select `packages/zip/src-xs/deflate.js` and
`packages/zip/src-xs/inflate.js` when the bundle is built with `-C xs`.
Direct imports of the private `src/` files remain unsupported.

Both adapters retain the public asynchronous signatures:

```js
export const deflate = async uncompressedBytes =>
  new Uint8Array(hostDeflateRaw(uncompressedBytes));

export const inflate = async (compressedBytes, options = {}) =>
  new Uint8Array(hostInflateRaw(compressedBytes, options.maximumOutputBytes));
```

The native calls complete synchronously, but the async wrappers preserve the
`Promise<Uint8Array>` contract used by `ZipWriter.set()` and `ZipReader.get()`.
Each named export is hardened.
No runtime feature probe is used on the XS path: selecting `xs` promises an
Endor XS host that registered these functions.
Other engines keep their web-stream behavior and do not acquire an Endor
dependency.

### Native host functions

Add `rust/endo/xsnap/src/powers/compression.rs`, registered after the existing
power modules, with these byte-only functions:

| XS function | Arguments | Result |
|---|---|---|
| `hostDeflateRaw` | `Uint8Array` | fresh `ArrayBuffer` containing a raw RFC 1951 DEFLATE stream |
| `hostInflateRaw` | `Uint8Array`, maximum decoded byte count | fresh `ArrayBuffer` containing the decoded bytes |

The implementation uses `flate2`'s raw `DeflateEncoder` and
`DeflateDecoder`, with its explicit pure-Rust `rust_backend` feature.
`rust/endo` already uses `flate2`; `xsnap` declares the same pinned dependency
so the host implementation remains in the crate that owns the XS FFI.
This design does not use the Rust `zip` crate: JavaScript remains responsible
for ZIP directory parsing, metadata, CRC-32 checking, and choosing compression
method 8.

The callbacks read a typed-array view with the existing XS byte helpers and
return a newly allocated `ArrayBuffer` using the existing ownership pattern.
They must reject malformed input by throwing an XS `Error`, not by returning an
`"Error: ..."` string as data.
The message identifies `deflate-raw` or `inflate-raw` and whether the failure
was invalid data or the output limit.

`hostInflateRaw` stops and throws once output would exceed its supplied limit.
`ZipReader` widens its internal decompressor call to pass an archive entry's
declared `uncompressedLength` as `maximumOutputBytes`.
Existing user-provided decompressors may ignore the optional second argument.
The public `inflate(bytes)` helper accepts no limit for compatibility and uses
a documented Endor host ceiling when called outside `ZipReader`.
The ceiling is a defensive last resort, not a replacement for the per-entry
ZIP bound.

The functions are installed before lockdown, exposed under the `host...` names
used by the XS adapters, and added to the XS ambient host declarations.
They are pure compute powers and carry no host handle or authority.
They are available only to the XS host realm and bundles explicitly resolved
with `-C xs`; ordinary guest compartments do not receive them as endowments.

### Endor snapshot compatibility

Adding callbacks changes the external callback table that XS snapshots use.
Registration and `worker_snapshot_callbacks()` append the two compression
callbacks at the end of the existing table in the same order as registration.
The snapshot signature changes from `endo-xs 1` to `endo-xs 2`.
Old snapshots consequently fail the existing signature check and restart from
their source/bootstrap path rather than restoring against shifted callback
indices.
Future host callbacks must remain append-only.

### ZIP integration and compatibility

`ZipWriter` continues to select DEFLATE only when given a compressor, and
`ZipReader` continues to require an inflater for method 8.
The change is solely that an XS-resolved import supplies those capabilities.
STORE-only archives and all non-XS callers are unchanged.

`@endo/exo-zip` and `@endo/exo-unzip` may remove their
`CompressionStream`/`DecompressionStream` probes after they depend on the
conditional `@endo/zip` exports.
Their Node and browser builds retain the default helpers.
The adapters must not silently change a failed native DEFLATE operation into a
STORE archive, because callers that requested compression need a visible error.

## Testing

1. Add Rust unit tests for empty, short, and multi-block raw-DEFLATE round
   trips, the checked-in native-DEFLATE ZIP fixture, corrupt streams, and a
   stream whose expansion exceeds the supplied limit.
2. Extend `packages/zip/test/zip.test.js` with portable golden vectors and
   `ZipWriter`/`ZipReader` round trips.  The default path continues to use its
   web-stream implementation; the XS test bundle proves the same vectors
   through the conditional exports.
3. Build a fixture with `-C xs`, assert that both `@endo/zip` subpaths resolve
   to the XS adapters, and run it under `endor` without `CompressionStream` or
   `DecompressionStream` globals.
4. Verify an XS `@endo/exo-zip` archive writes method 8 entries and an XS
   `@endo/exo-unzip` reads the existing DEFLATE fixture with CRC-32 checking.
5. Exercise snapshot suspend and restore after the callback-table change, and
   separately assert that an `endo-xs 1` snapshot is rejected cleanly.

## Dependencies

| Design | Relationship |
|---|---|
| [exo-zip-package](exo-zip-package.md) | Consumer.  Its writer and reader adapters gain working method-8 support in Endor XS. |
| [endor-run-expanded](endor-run-expanded.md) | Consumer.  `endor run` can execute archives whose dependency tree uses the ZIP helpers under XS. |

## Design Decisions

1. **Conditional exports instead of a web-stream shim.** The implementation
   selects at build time with `-C xs`; it does not make every XS program carry
   Blob, Response, and stream emulation just to transform one byte array.
2. **Raw DEFLATE only.** ZIP method 8 requires RFC 1951 bytes, not zlib or gzip
   framing.  Higher-level archive parsing remains in `@endo/zip`.
3. **Bound inflation at the ZIP call site.** The central directory already
   supplies the expected decoded length.  Passing it to the host function
   prevents a compressed entry from allocating without limit.
4. **Preserve asynchronous JavaScript helpers.** The native operation need not
   force a synchronous public API or split downstream callers by engine.
5. **Invalidate old snapshots deliberately.** Callback identity is positional
   in XS snapshots; a signature bump is safer than attempting compatibility
   with an altered table.

## Alternatives Considered

- **Implement DEFLATE in JavaScript for XS.** Rejected: it duplicates a mature
  Rust capability in the Endor binary and adds substantial code to XS bundles.
- **Provide `CompressionStream` and `DecompressionStream` polyfills.**
  Rejected: the ZIP helpers need whole-byte-array transforms, not the broad web
  stream, Blob, and Response surface.
- **Use Endor's full Rust ZIP reader.** Rejected: that would duplicate the
  JavaScript ZIP parser and bypass its established path validation and CRC
  behavior.

## Prompt

> Design an amendment to the zip/deflate and zip/inflate modules so Endor
> supports these algorithms with simpler native Rust implementations and
> exposed host functions, which are used in the presence of the `xs` build
> condition, `-C xs`.
