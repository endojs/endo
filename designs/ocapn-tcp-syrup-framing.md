# OCapN TCP Syrup-Frame Transport Framing

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The OCapN TCP transport (`tcp-testing-only` today, see
`packages/ocapn/src/netlayers/tcp-test-only.js`) has a latent framing
problem and a latent redundancy problem.
Both can be resolved with the same change.

### The latent framing bug

The current `tcp-test-only` netlayer ships raw bytes straight from the TCP
socket into OCapN:

```js
// packages/ocapn/src/netlayers/tcp-test-only.js (lines 134-143)
socket.on('data', data => {
  const bytes = bufferToBytes(data);
  if (!connection.isDestroyed) {
    handlers.handleMessageData(connection, bytes);
  }
  ...
});
```

The handler at the other end constructs a fresh `SyrupReader` over each
chunk and loops until the reader is exhausted:

```js
// packages/ocapn/src/client/ocapn.js (lines 1194-1221)
const dispatchMessageData = data => {
  const syrupReader = makeSyrupReader(data);
  while (syrupReader.index < data.length) {
    ...
    message = readOcapnMessage(syrupReader);
    ...
  }
};
```

This works only so long as each TCP `data` event happens to contain a
whole number of Syrup records.
The kernel's TCP stack makes no such guarantee.
As soon as a single logical OCapN message is split across two TCP chunks
(because the network MTU, the sender's write, or Nagle's algorithm landed
a boundary mid-record), `readOcapnMessage` throws, and
`handleActiveSessionMessageData` aborts the session.

The same deficiency exists in `handleHandshakeMessageData`
(`packages/ocapn/src/client/handshake.js` lines 260-311).
The handshake has survived in practice because `op:start-session` is
small and tends to fit in a single TCP segment on loopback, but the code
is structurally incorrect.

### The redundancy that motivates the fix

The Endo daemon's own TCP transport
(`packages/daemon/src/networks/tcp-netstring.js`) does *not* have this
bug.
It wraps every CapTP/JSON message in a [Netstring][] using
`@endo/netstring`:

```text
<digits>:<payload>,
```

For example, the UTF-8 bytes `hello` frame as `5:hello,`.
The reader and writer are async iterables of `Uint8Array`, and the
reader correctly re-assembles frames across chunk boundaries.

The obvious fix for the OCapN TCP netlayer is to add the same netstring
framing around Syrup payloads.
But when we examine the two formats side by side, a peculiar redundancy
appears.
[Syrup][] (see `packages/ocapn/src/syrup/README.md`) encodes a byte
string as:

```text
<digits>:<bytes>
```

A Syrup byte string is exactly a [Netstring][] without the trailing
`,` separator.
OCapN messages are Syrup values, and the sequence of OCapN messages on
the wire is naturally a sequence of Syrup top-level values.
Wrapping each Syrup value in a netstring therefore inserts one layer of
length-prefix framing around a payload whose first bytes are *already* a
Syrup expression; the outer `<digits>:` plus the inner Syrup machinery
duplicate effort, and the trailing `,` is pure ceremony.

If we drop the trailing comma — using the grammar `<digits>:<bytes>`
without delimiter — the framed stream becomes literally a sequence of
Syrup byte-string records.
A framed message on the wire is indistinguishable from a Syrup byte
string carrying the serialized OCapN operation.
Framing and serialization share a grammar; the bridge between the wire
and the data model collapses to a single length-prefixed-bytes
abstraction.

This design proposes a new sibling package to `@endo/netstring`
implementing exactly this comma-less variant, and migrating the OCapN
TCP transport to use it.

## Design

### The new package

**Name.**
We want a name that is concise, honest about what the grammar is, and
doesn't overstate the connection to Syrup (this is *not* a full Syrup
codec, only the byte-string framing primitive).
Candidates considered:

| Name | Pros | Cons |
|---|---|---|
| `@endo/byte-string` | Most literal — this is a sequence of byte strings | Generic; `byte-string` means many things in different ecosystems |
| `@endo/syrup-frame` | Clear association with Syrup's role as the OCapN payload format | Misleading — the package has no dependency on Syrup and is usable as a generic framer |
| `@endo/length-prefixed` | Describes the grammar accurately | Too generic; does not distinguish from other length-prefixed formats (e.g., big-endian u32 prefix) |
| `@endo/netstring-lite` | Suggests the obvious kinship | Implies "lesser netstring"; the relationship to Syrup is the interesting property |
| `@endo/tethered-string` | Evokes the length-tether without a separator | Cute but obscure |

**Recommendation: `@endo/syrup-frame`.**
The package exists specifically to frame Syrup values on OCapN
transports.
Naming it after that purpose makes the call sites self-documenting
(`@endo/syrup-frame` at the top of an OCapN netlayer file telegraphs
"this stream is a sequence of Syrup records").
The alternative `@endo/byte-string` is tempting for its literal
accuracy, but the grammar is identical to Syrup's byte-string form by
*design*, not by coincidence; the package name should preserve that
intent.
We document in the README that the grammar happens to be independent of
any Syrup dependency and may be used as a bare length-prefixed framer,
but we do not pretend the naming is neutral.

The remainder of this document uses `@endo/syrup-frame` as the working
name.

### Grammar

```
frame   = length ":" payload
length  = 1*DIGIT
DIGIT   = "0" / "1" / "2" / "3" / "4" / "5" / "6" / "7" / "8" / "9"
payload = length * OCTET
```

Differences from [Netstring][]:

- No trailing `,` after the payload.
- Otherwise identical: decimal ASCII digits, a single `:`, then exactly
  `length` octets of payload.

Canonicalization notes:

- `length` MUST NOT have leading zeros except for the literal `0`.
  The encoding of a zero-length payload is `0:` (two octets).
- `length` MUST be the byte length of the payload, not the codepoint
  count.
- The parser MAY impose a maximum frame size.
  `@endo/netstring` defaults to `999999999` bytes
  (`packages/netstring/reader.js` line 18); `@endo/syrup-frame` will
  adopt the same default and expose the same `maxMessageLength` option.

Byte-level examples:

| Payload | Netstring encoding | Syrup-frame encoding |
|---|---|---|
| *empty* | `0:,` (2 bytes) | `0:` (2 bytes) |
| `A` | `1:A,` (4 bytes) | `1:A` (3 bytes) |
| `hello` | `5:hello,` (8 bytes) | `5:hello` (7 bytes) |
| `op:start-session` record (say 240 B) | `240:<240 bytes>,` (245 bytes) | `240:<240 bytes>` (244 bytes) |

### Package shape

The package mirrors `@endo/netstring` module-for-module so that the
migration is a mechanical rename at call sites.
File layout:

```
packages/syrup-frame/
  index.js          — re-exports from reader.js and writer.js
  reader.js         — makeSyrupFrameReader
  writer.js         — makeSyrupFrameWriter
  package.json
  README.md
  tsconfig.json
  tsconfig.build.json
  test/
    syrup-frame.test.js
```

Exports:

```js
// index.js
export { makeSyrupFrameReader } from './reader.js';
export { makeSyrupFrameWriter } from './writer.js';
```

Unlike `@endo/netstring`, we do *not* carry forward the legacy
`netstringReader` / `netstringWriter` aliases.
This package is new and has no legacy callers.

### Reader

```js
// @ts-check

import harden from '@endo/harden';

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.maxMessageLength]
 * @returns {import('@endo/stream').Reader<Uint8Array, undefined>}
 */
export const makeSyrupFrameReader = (input, opts) => { ... };
harden(makeSyrupFrameReader);
```

The implementation is derived from `packages/netstring/reader.js` with
exactly one behavioral change: after reading `remainingDataLength` bytes
into `dataBuffer`, the reader yields the frame and **immediately**
resets to `lengthBuffer = []` without looking for a `,` separator.
All of the "waiting for length" logic (digit accumulation, prefix-too-
long detection, chunk-boundary handling inside the length prefix) is
unchanged.

The `COMMA` check at `packages/netstring/reader.js` line 104-110 is
removed.
The "Invalid netstring separator" error class disappears entirely.

The `name` and `maxMessageLength` options retain their netstring
semantics.
Error messages are reworded from "netstring" to "syrup-frame" so that
log diagnostics do not misattribute failures.

### Writer

```js
// @ts-check

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @param {object} [opts]
 * @param {boolean} [opts.chunked]
 * @returns {import('@endo/stream').Writer<Uint8Array | Uint8Array[], undefined>}
 */
export const makeSyrupFrameWriter = (output, { chunked = false } = {}) => {
  ...
};
harden(makeSyrupFrameWriter);
```

The implementation is derived from `packages/netstring/writer.js` with
two symmetrical changes:

1. The module-level `COMMA_BUFFER` constant is removed.
2. Every write sequence loses its terminal `output.next(COMMA_BUFFER)`
   call (in both chunked and unchunked modes), and the allocation of
   the output buffer shrinks by one byte.

The `chunked` option and its zero-copy behavior are preserved verbatim.
Back-pressure semantics, the concurrent-write handling, and the
close-early race are all unchanged.

### Tests

`test/syrup-frame.test.js` is ported from
`packages/netstring/test/netstring.test.js` with:

- String literals updated: `'5:hello,'` → `'5:hello'`,
  `'0:,'` → `'0:'`, etc.
- The "fails reading invalid separator" test (which asserts that `0:~`
  is rejected) is deleted — there is no separator to validate.
- A new test asserts that a trailing `,` after a valid frame is
  *not* consumed (it is the first byte of the next frame and should
  produce a parse error because `,` is not a digit).
- A new test exercises exactly the OCapN TCP bug described above:
  concurrent writes of small records whose encoded frames are expected
  to straddle arbitrary chunk boundaries.

### Dependencies

Same as `@endo/netstring`:

```json
{
  "dependencies": {
    "@endo/harden": "workspace:^",
    "@endo/init": "workspace:^",
    "@endo/promise-kit": "workspace:^",
    "@endo/stream": "workspace:^"
  }
}
```

## Migration

### Call sites affected in the OCapN packages

Searching for `@endo/netstring` in `packages/ocapn/` and
`packages/ocapn-noise/` yields **no direct imports today**.
The OCapN TCP netlayer does not currently use any framing; this design
*adds* framing where there is none.

The call sites that will be modified to introduce `@endo/syrup-frame`:

| File | Change |
|---|---|
| `packages/ocapn/src/netlayers/tcp-test-only.js` | Wire the raw `net.Socket` through an `@endo/syrup-frame` reader on incoming data and through a writer on outgoing `connection.write`. |
| `packages/ocapn/src/client/index.js` | `handleMessageData` and `handleActiveSessionMessageData` currently receive arbitrary-boundary byte chunks and hand them to `SyrupReader`. After the change, they receive whole frames (one Syrup value each) and may simplify: the `while (syrupReader.index < data.length)` loop in `dispatchMessageData` collapses to a single read. |
| `packages/ocapn/src/client/handshake.js` | Same: `handleHandshakeMessageData` becomes one-frame-one-call. |
| `packages/ocapn/src/client/ocapn.js` | `serializeAndSendMessage` (line 1181) wraps its Syrup output in a syrup-frame before invoking `connection.write`. Alternatively, the framing happens at the netlayer boundary and `serializeAndSendMessage` is unchanged — see *Where does framing live?* below. |
| `packages/ocapn/src/client/types.js` | `SocketOperations.write` stays `(bytes: Uint8Array) => void`; `NetlayerHandlers.handleMessageData` signature changes to emphasize that the `data` parameter is now a single decoded frame rather than an arbitrary chunk. |
| `packages/ocapn/package.json` | Add `@endo/syrup-frame` dependency. |

### Where does framing live?

Two options, with consequences:

**Option A: framing inside the netlayer (recommended).**
The `tcp-test-only` netlayer owns the framer.
On ingress, it adapts a `net.Socket` into an async iterable of byte
chunks, pipes that through `makeSyrupFrameReader`, and for each yielded
frame calls `handlers.handleMessageData(connection, frame)`.
On egress, it wraps the socket as a byte writer and layers
`makeSyrupFrameWriter` on top; `connection.write(bytes)` then means
"send one frame containing these bytes."
OCapN core sees whole messages and never has to worry about chunk
boundaries.
This is the Endo daemon's pattern
(`packages/daemon/src/networks/tcp-netstring.js` lines 88-95).

**Option B: framing in OCapN core.**
OCapN core accepts arbitrary byte chunks and internally maintains a
per-connection frame parser.
This keeps the netlayer's `SocketOperations` interface dumb-bytes.
Downside: every future OCapN network that uses stream framing
reimplements the same plumbing, and the current chunk-boundary bug is
preserved in the API surface even if fixed internally.

We recommend Option A.
It aligns with
`designs/ocapn-network-transport-separation.md`, which establishes that
networks own transport concerns and deliver sessions (and, by extension,
framed messages) to the core.
Framing is a transport concern.

### Sequencing

The two-sided nature of a wire-format change dictates the rollout order:

1. **Land `@endo/syrup-frame`** as a standalone package with tests.
   This is a pure addition; nothing consumes it yet.
2. **Migrate the `tcp-test-only` netlayer** to wrap its socket in the
   new framer.
   Update all OCapN tests that construct two peers through the
   `tcp-test-only` netlayer simultaneously — they upgrade as a pair in
   the same commit and remain interoperable.
   The python test suite
   (`packages/ocapn/test/python-test-suite/`) is an interop target and
   will stop working until the upstream Python implementation is also
   updated; see *Compatibility* below.
3. **Optionally rename** the netlayer identifier from `tcp-testing-only`
   to something that signals the new framing
   (e.g. `tcp-syrup-frame-testing`).
   This is a locator-format change and affects the URI serialization in
   `packages/ocapn/src/client/util.js`.
   Whether to do it depends on whether we want the locator to advertise
   the framing variant; see the next section.

### No dual-protocol support

We do not plan to implement a compatibility mode that reads either
netstrings or syrup-frames.
The `tcp-testing-only` transport is used only between Endo peers and the
OCapN Python test suite for spec-compliance testing.
Both sides can upgrade in lockstep.
Complicating the reader with a peek-for-comma fallback would permanently
poison the grammar.

## Compatibility with Other OCapN Implementations

The OCapN draft specification describes a netlayer for "TCP with
netstring framing."
If we deviate by dropping the comma, our `tcp-testing-only` variant is
no longer on-the-wire compatible with other OCapN implementations that
read the spec literally.
This is the central compatibility question.

Three ways to answer it:

**Option 1: Propose the change upstream.**
Argue to the OCapN community that, given Syrup's byte-string grammar is
identical to a netstring minus the comma, the spec should adopt the
comma-less variant for any transport whose payloads are Syrup values.
The payoff is small but real: 1 byte per message saved, and a cleaner
conceptual model where framing and serialization share a primitive.
The cost is coordination with Spritely and other OCapN participants and
a compatibility-break for any existing implementations.
Not a trivial ask.

**Option 2: Endo-internal variant on a distinct identifier.**
Register a new transport name — e.g., `tcp-syrup-frame` — alongside the
existing `tcp-testing-only`.
Keep `tcp-testing-only` netstring-compliant (adding real netstring
framing with a comma, which we have to do anyway to fix the chunk-
boundary bug) and use `tcp-syrup-frame` for Endo-to-Endo traffic.
This requires implementing *both* framers; `@endo/netstring` already
exists, so the cost is only wiring.
Locators advertise which variant they speak.

**Option 3: Make it the default for test-only traffic and upstream later.**
Since `tcp-testing-only` is explicitly a spec-stage, test-oriented
transport (its name is a self-warning), we may change its framing
unilaterally, document the deviation, and propose upstream
rationalization when the OCapN spec moves toward 1.0.
Interop with the Python test suite breaks until the test suite is
upgraded — in exchange, we avoid carrying two framers.

**Recommendation: Option 2 in the short term, argue for Option 1 in
parallel.**
A new transport identifier is cheap, preserves Python-test-suite
interop for the transports that already work, and gives us a clean
venue to validate the new framing without pressuring upstream.
The existing `tcp-testing-only` netlayer gets a correctness fix
(actually adopt `@endo/netstring` so that chunk-boundaries are handled)
and a new sibling netlayer (`tcp-syrup-frame`) gets the comma-less
framing.
If and when OCapN adopts the change, `tcp-testing-only` can be retired.

### Implications for ocapn-network-transport-separation and
ocapn-tcp-for-test-extraction

This design layers cleanly on top of both precursor designs.

From `designs/ocapn-network-transport-separation.md`, the network is the
abstraction that owns transport selection.
A `tcp-syrup-frame` network registers under a distinct network
identifier and carries its own framing choice.
The `OcapnNetwork.connect` contract — "return a session ready for
CapTP" — is unchanged.

From `designs/ocapn-tcp-for-test-extraction.md`, the `op:start-session`
handshake moves into the tcp-for-test network.
That handshake is itself a Syrup record; it flows through the same
framing as regular session traffic.
With `@endo/syrup-frame`, `handleHandshakeMessageData` reads exactly one
frame, decodes one Syrup record, and hands off — no more
`while (syrupReader.index < data.length)` loop.

## Package Layout

```
packages/
  netstring/                  — unchanged; classic <len>:<bytes>, framing
    index.js
    reader.js
    writer.js
    test/netstring.test.js
  syrup-frame/                — NEW; <len>:<bytes> framing
    index.js
    reader.js
    writer.js
    test/syrup-frame.test.js
  ocapn/
    src/
      netlayers/
        tcp-test-only.js      — keep; add @endo/netstring framing (bug fix)
        tcp-syrup-frame.js    — NEW; uses @endo/syrup-frame
      client/
        index.js              — handleMessageData gets whole frames
        handshake.js          — one frame = one op:start-session
        ocapn.js              — dispatchMessageData simplifies
```

What lives where:

- **`@endo/netstring`**: unchanged.
  Continues to serve the daemon's `tcp+netstring+json+captp0`
  transport and any current or future callers that want strict
  netstring compliance.
- **`@endo/syrup-frame`**: comma-less length-prefixed framing.
  No dependency on `@endo/ocapn` — it is a stream primitive usable
  anywhere.
- **`packages/ocapn/src/netlayers/`**: both the fixed legacy
  `tcp-test-only.js` (with real `@endo/netstring` framing to address
  the chunk-boundary bug) and the new `tcp-syrup-frame.js`.

## Dependencies

| Design | Relationship |
|---|---|
| [ocapn-network-transport-separation](ocapn-network-transport-separation.md) | Prerequisite. Establishes the `OcapnNetwork` interface under which a syrup-frame-using network registers. |
| [ocapn-tcp-for-test-extraction](ocapn-tcp-for-test-extraction.md) | Sibling. The handshake logic moving into the TCP network flows through the syrup-frame framer. |
| [ocapn-noise-network](ocapn-noise-network.md) | Independent. Noise transport has its own framing (Noise transport messages carry their own length). Syrup-frame applies only to TCP-variant networks. |

## Phased Implementation

1. **Phase 1: Publish `@endo/syrup-frame`.**
   Port `reader.js`, `writer.js`, and tests from `@endo/netstring` with
   the comma removed.
   Add `package.json`, `README.md`, `tsconfig*.json` mirrored from
   netstring.
   Land independently; no consumers yet.

2. **Phase 2: Fix `tcp-test-only` framing with `@endo/netstring`.**
   Wrap the `net.Socket` data stream and `socket.write` in real
   netstring framing.
   This closes the chunk-boundary bug on the existing transport
   without any wire-format change against the Python test suite.
   Simplify `dispatchMessageData` and `handleHandshakeMessageData` now
   that callers receive whole frames.

3. **Phase 3: Add `tcp-syrup-frame` netlayer.**
   New file `packages/ocapn/src/netlayers/tcp-syrup-frame.js` derived
   from `tcp-test-only.js` but using `@endo/syrup-frame`.
   Register under a new transport identifier (or network identifier,
   per the transport-separation design).
   Add an interop test that exercises two Endo peers over the new
   netlayer end-to-end.

4. **Phase 4 (optional): Propose upstream.**
   Draft a change proposal for the OCapN spec arguing that
   Syrup-carrying transports should use the comma-less variant.
   Outcome of this phase is out of scope for Endo's own roadmap; it
   happens opportunistically.

## Design Decisions

1. **Grammar is comma-less, not length-in-binary.**
   We considered more radical departures (big-endian `u32` length
   prefix, varint).
   The ASCII-decimal length prefix is kept because it preserves exact
   byte-for-byte equivalence with a Syrup byte string, which is the
   whole motivation.
   A binary length prefix would not be a "Syrup frame."

2. **New package rather than a flag on `@endo/netstring`.**
   Adding a `{ separator: false }` option to `@endo/netstring` would
   keep one package, but it would blur the identity of a netstring — a
   netstring with no separator is *not* a netstring, and DJB's spec is
   explicit on the point.
   A separate package is more honest.

3. **Name chosen for intent, not for neutrality.**
   `@endo/syrup-frame` is named after the purpose — framing Syrup
   values on OCapN transports — rather than being named neutrally
   (`@endo/byte-string`, `@endo/length-prefixed`).
   The grammar happens to be independent of Syrup, and the README
   documents this, but the package exists because of OCapN.

4. **Framing at the netlayer, not in OCapN core.**
   See *Where does framing live?* above.
   Consistent with the direction of
   `ocapn-network-transport-separation`.

5. **No backward-compat reader.**
   The reader does not peek for a `,` to support both formats.
   The `tcp-testing-only` and `tcp-syrup-frame` transports are
   registered under distinct network identifiers; the locator
   disambiguates.

6. **Preserve the `chunked` zero-copy writer mode.**
   The Endo daemon relies on it (`tcp-netstring.js` line 89).
   The new writer carries it forward unchanged, minus the trailing
   `COMMA_BUFFER` part of the concurrent writes.

## Known Gaps and TODOs

- [ ] Decide definitively on the package name (`syrup-frame` vs.
  `byte-string`) before publishing.
  This document recommends `syrup-frame` but the choice is reversible
  prior to Phase 1.
- [ ] Decide whether to rename `tcp-testing-only` once it has real
  netstring framing or leave the name to signal "spec-draft, not
  production."
- [ ] Coordinate with the OCapN community before or after Phase 3.
  A prior conversation with Spritely would shape whether Phase 4
  becomes a spec proposal or remains an Endo-internal variant.
- [ ] Confirm the behavior of `@endo/stream`'s `mapReader` /
  `mapWriter` combinators with the new framer; the daemon's
  `tcp-netstring.js` pattern
  (`mapWriter(makeNetstringWriter(bytesWriter, { chunked: true }),
  messageToBytes)`) should translate directly.

## Prompt

````
Write a design document at
`/home/kris/designer/designs/ocapn-tcp-syrup-framing.md` for
refactoring the OCapN TCP network/netlayer/transport protocol so that
it frames messages using a comma-less netstring variant — equivalent
to a sequence of Syrup byte-string records. The new framing should
live in a NEW sibling package to `@endo/netstring` (working name e.g.
`@endo/byte-string` or `@endo/syrup-frame`; argue for the best name).

Context to absorb: `designs/CLAUDE.md`, `designs/README.md`,
`designs/ocapn-network-transport-separation.md`,
`designs/ocapn-tcp-for-test-extraction.md`, `packages/netstring/` in
full, `packages/ocapn/` and `packages/ocapn-noise/` to identify TCP
transport call sites, and the Syrup byte-string grammar.

Required output: metadata table (2026-04-23, Kris Kowal (prompted),
Not Started); problem statement naming the redundancy between
netstring framing and Syrup byte-string framing on OCapN TCP;
design of the new package with precise grammar; migration list
for OCapN call sites; compatibility discussion with other OCapN
implementations; package layout; dependencies; phased
implementation; design decisions; known gaps; and a ## Prompt
section with this instruction.

Do NOT edit `designs/README.md`; the user will synchronize it after
all seven design docs land.
````

[Netstring]: https://cr.yp.to/proto/netstrings.txt
[Syrup]: https://github.com/ocapn/syrup
