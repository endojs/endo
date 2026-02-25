# OCapN Network/Transport Separation

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## What is the Problem Being Solved?

OCapN currently conflates the concepts of "network" and "transport". The
`OcapnLocation` type has a `transport` field (e.g., `'tcp-testing-only'`) that
simultaneously identifies what protocol family a peer belongs to and how to
physically connect to it. The `netlayers` map in
`packages/ocapn/src/client/index.js` registers implementations by transport
name, and the `establishSession` function looks up a netlayer by
`location.transport`.

This conflation creates several problems:

1. A network like OCapN-Noise may support multiple transports (WebSocket, TCP
   with Netstring, Tor) but must register each as a separate "netlayer", losing
   the shared identity and session semantics of the network.
2. A locator should designate a **network** (the protocol that authenticates and
   multiplexes sessions) not a **transport** (the byte-stream carrier). The
   network is what gives a locator its security and identity properties.
3. The `op:start-session` handshake is baked into the OCapN core
   (`packages/ocapn/src/client/handshake.js`), but different networks need
   different session negotiation. OCapN-Noise piggybacks authentication on the
   Noise Protocol handshake and should not be forced through `op:start-session`.
4. OCapN networks should also manage "crossed-hellos" and ensure authenticity
   of the initiator and responder regardless of whether the local or remote
   party initiated the session.

## Description of the Design

### New Conceptual Model

```
OCapN Core
  └── Network (e.g., "np" for OCapN-Noise, "tcp-testing-only" for test)
        └── Transport (e.g., "ws:", "tcp:")
              └── Physical connection (WebSocket, TCP socket, etc.)
```

- **Locator**: Designates a network. The `transport` field on `OcapnLocation`
  should be renamed to `network` (or a new `network` field added).
- **Network**: Responsible for session establishment, authentication, and
  encryption. Defines its own handshake protocol. Registered with OCapN by
  network identifier.
- **Transport**: A byte-stream carrier used by a network. A network may support
  multiple transports. Transports are a concern of the network, not of OCapN
  core.
- **Connection hints**: Encode transport information. A hint like `ws:` or
  `tcp:` prefixed on an address tells the network which transport to use for a
  particular connection attempt.

### Refactoring Steps

#### 1. Introduce `OcapnNetwork` interface

Define a new interface that each network must implement:

```js
/**
 * @typedef {object} OcapnNetwork
 * @property {string} identifier - Network identifier (e.g., 'np', 'tcp-testing-only')
 * @property {OcapnLocation} location - This node's location on this network
 * @property {(location: OcapnLocation) => Promise<Session>} connect
 *   Establish a session to a peer. The network handles transport selection,
 *   handshake, authentication, and encryption.
 * @property {() => void} shutdown
 */
```

The key difference from today's `NetLayer` is that `connect` returns a
**session** (authenticated, encrypted, ready for CapTP), not a raw
**connection** (unauthenticated byte stream). The network owns the full
lifecycle from transport selection through session establishment.

#### 2. Rename `transport` to `network` in `OcapnLocation`

```js
// Before
{ type: 'ocapn-peer', designator: 'A', transport: 'tcp-testing-only', hints: { ... } }

// After
{ type: 'ocapn-peer', designator: 'A', network: 'tcp-testing-only', hints: { ... } }
```

Update the Syrup codec in `packages/ocapn/src/codecs/components.js` and the
URI serialization in `packages/ocapn/src/client/util.js`.

#### 3. Replace `netlayers` map with `networks` map

In `packages/ocapn/src/client/index.js`:

- Rename `netlayers` → `networks`.
- `registerNetlayer(makeNetlayer)` → `registerNetwork(makeNetwork)`.
- `establishSession` should call `network.connect(location)` instead of
  creating a raw connection and then running a generic handshake.

#### 4. Move handshake responsibility into networks

The current `sendHandshake` / `receiveHandshake` in
`packages/ocapn/src/client/handshake.js` becomes the handshake for the
tcp-for-test network only. OCapN core should not mandate a specific handshake
protocol.

The OCapN core's responsibility becomes:

- Routing: given a locator, find the right network.
- CapTP session management: once a network delivers an authenticated session,
  run CapTP over it.
- GC, descriptors, operations: the message-level protocol.

### Affected Files

| File | Change |
|------|--------|
| `packages/ocapn/src/client/index.js` | Replace netlayer registration with network registration |
| `packages/ocapn/src/client/handshake.js` | Extract into tcp-for-test; remove from core |
| `packages/ocapn/src/client/types.js` | New `OcapnNetwork` type; rename `NetLayer` |
| `packages/ocapn/src/codecs/components.js` | `transport` → `network` in OcapnLocation codec |
| `packages/ocapn/src/client/util.js` | Update URI serialization |
| `packages/ocapn/src/netlayers/tcp-test-only.js` | Adapt to new network interface |
| `packages/ocapn/test/` | Update all test utilities |

## Security Considerations

- This is a structural refactoring. No security properties change.
- The refactoring makes security boundaries clearer: the network is the trust
  boundary, not the transport.
- Each network is responsible for its own authentication guarantees. OCapN core
  should document what security properties it expects from a network (e.g.,
  confidentiality, integrity, peer authentication).

## Scaling Considerations

- No scaling impact. The number of registered networks is small (typically 1-2).
- Session routing adds negligible overhead.

## Test Plan

- All existing OCapN tests must pass after refactoring (with updated
  registration calls).
- New unit test: register multiple networks, verify locator routing dispatches
  to the correct network.
- Integration test: tcp-for-test network works end-to-end through the new
  interface.

## Compatibility Considerations

- This is a breaking change to the `@endo/ocapn` API surface:
  - `registerNetlayer` → `registerNetwork`
  - `OcapnLocation.transport` → `OcapnLocation.network`
  - `NetLayer` type replaced by `OcapnNetwork`
- Syrup wire format for locators changes (field name). This affects
  interoperability with other OCapN implementations. Coordinate with the OCapN
  spec group.
- The `@endo/ocapn` package is pre-1.0 (v0.2.2), so breaking changes are
  expected.

## Upgrade Considerations

- Daemon's `loopback-network` formula and peer connection logic will need to
  adapt to the new registration API.
- Any external consumers of `@endo/ocapn` will need to update their netlayer
  registrations.
