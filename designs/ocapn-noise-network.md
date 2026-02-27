# OCapN-Noise Network

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The `@endo/ocapn-noise` package (v0.1.0) currently provides Noise Protocol
cryptographic bindings (`packages/ocapn-noise/src/bindings.js`) but does not
implement a full OCapN network. It provides the handshake primitives
(`asInitiator`, `asResponder`, `initiatorWriteSyn`, `responderReadSynWriteSynack`,
etc.) and encryption/decryption functions, but:

1. There is no `OcapnNetwork` implementation that plugs into the OCapN client.
2. There is no transport layer abstraction — no WebSocket or TCP transport that
   carries the Noise handshake bytes.
3. The handshake is tightly coupled to raw byte arrays with no transport framing.
4. Connection hints don't encode transport selection.

OCapN-Noise needs to become a proper network, designated by `"np"`, that accepts
pluggable transports and integrates with the OCapN client via the `OcapnNetwork`
interface (from the network-transport-separation work item).

## Description of the Design

### Network Identifier

OCapN-Noise is designated by `"np"` in locators:

```
ocapn://<designator>.np?ws:host=example.com&ws:port=443
ocapn://<designator>.np?tcp:host=127.0.0.1&tcp:port=9000
```

The `designator` is derived from the node's Ed25519 public key (as it is
today — double-SHA256 hash of the serialized public key descriptor).

### Transport Plugin Architecture

A transport plugin provides a way to establish a bidirectional byte stream.
The network uses that byte stream to run the Noise Protocol handshake and
subsequent encrypted messaging.

```js
/**
 * @typedef {object} OcapnNoiseTransport
 * @property {string} scheme - Transport scheme (e.g., 'ws', 'tcp')
 * @property {(hints: Record<string, string>) => Promise<ByteStream>} connect
 *   Open an outgoing byte stream to a peer using transport-specific hints.
 * @property {(options: ListenOptions) => Promise<TransportListener>} listen
 *   Start listening for incoming byte stream connections.
 * @property {() => void} shutdown
 */

/**
 * @typedef {object} ByteStream
 * @property {(bytes: Uint8Array) => void} write
 * @property {() => void} end
 * @property {AsyncIterable<Uint8Array>} incoming
 */
```

### Transport Hint Format

Connection hints encode transport information with a scheme prefix:

| Hint Key | Example Value | Meaning |
|----------|---------------|---------|
| `ws:host` | `example.com` | WebSocket host |
| `ws:port` | `443` | WebSocket port |
| `tcp:host` | `127.0.0.1` | TCP host |
| `tcp:port` | `9000` | TCP port |

When connecting, the network iterates available transports and selects one
matching the hint prefixes. If multiple transports match, try them in order
(preference configurable).

### Concrete Transport Implementations

#### `ocapn-noise-websocket`

- Uses the WebSocket API (browser-compatible).
- Noise handshake bytes are sent as binary WebSocket messages.
- Each encrypted OCapN message is a single WebSocket binary frame.
- No additional framing needed — WebSocket provides message boundaries.

#### `ocapn-noise-tcp`

- Uses Node.js `net` module.
- Noise handshake bytes are sent as raw TCP.
- Encrypted OCapN messages are framed with **netstrings**
  (`@endo/netstring`) to provide message boundaries over the TCP byte stream.
- The handshake phase uses fixed-length messages (SYN: 164 bytes, SYNACK: 193
  bytes, ACK: 64 bytes per `packages/ocapn-noise/src/bindings.js`) so netstring
  framing is only needed for the post-handshake encrypted message phase.

### Network Implementation

```js
const makeOcapnNoiseNetwork = async ({ signingKeys, transports, handlers }) => {
  // 1. Generate or accept Ed25519 signing keys
  // 2. Register transport plugins
  // 3. Start listeners on all transports
  // 4. Return OcapnNetwork interface

  return harden({
    identifier: 'np',
    location: { type: 'ocapn-peer', network: 'np', designator, hints },

    async connect(remoteLocation) {
      // a. Select transport from remote hints
      // b. Open byte stream via transport.connect(hints)
      // c. Run Noise XX handshake as initiator:
      //    - Write SYN (prefixed with intended responder key)
      //    - Read SYNACK, validate responder identity
      //    - Write ACK
      // d. Obtain encrypt/decrypt functions from completed handshake
      // e. Return NetworkSession with encrypted write/read
    },

    shutdown() { /* close all listeners and connections */ },
  });
};
```

### Session Establishment

The Noise handshake replaces `op:start-session` entirely:

1. **Initiator** opens a byte stream via the selected transport.
2. **Initiator** writes the SYN message (164 bytes): intended responder's
   Ed25519 public key (32 bytes) + Noise XX first message (132 bytes).
3. **Responder** reads SYN, verifies it's intended for them, writes SYNACK
   (193 bytes): contains responder's Ed25519 public key, encoding negotiation,
   signature.
4. **Initiator** reads SYNACK, verifies responder identity and signature,
   writes ACK (64 bytes).
5. Both sides now have `encrypt` and `decrypt` functions (ChaCha20-Poly1305).
6. The `NetworkSession` is delivered to OCapN core. All subsequent CapTP
   messages are encrypted.

No `op:start-session` is sent. The Noise handshake provides:
- Mutual authentication (both parties prove possession of their Ed25519 keys).
- Key agreement (ephemeral x25519 keys negotiated by Noise).
- Encryption (ChaCha20-Poly1305 from the Noise session).
- Encoding negotiation (piggybacked on SYNACK per current implementation).

### Package Structure

```
packages/
  ocapn-noise/          # Existing: Noise Protocol bindings (WASM + JS)
    src/bindings.js     # Handshake state machine, encrypt/decrypt
  ocapn-noise-network/  # New: OCapN-Noise network implementation
    src/
      network.js        # makeOcapnNoiseNetwork
      transport.js      # Transport plugin interface
  ocapn-noise-ws/       # New: WebSocket transport plugin
    src/index.js
  ocapn-noise-tcp/      # New: TCP + netstring transport plugin
    src/index.js
```

Alternatively, the transport plugins could be subdirectories of
`ocapn-noise-network` if separate packages feel like over-modularization.

### Affected Packages

- `packages/ocapn-noise` — no changes (bindings are consumed as-is)
- `packages/ocapn-noise-network` (new) — network implementation
- `packages/ocapn-noise-ws` (new) — WebSocket transport
- `packages/ocapn-noise-tcp` (new) — TCP transport using `@endo/netstring`
- `packages/ocapn` — must support the `OcapnNetwork` interface (from
  network-transport-separation work item)

### Dependencies

- **ocapn-network-transport-separation** — provides the `OcapnNetwork` interface
  and registration mechanism.
- **ocapn-tcp-for-test-extraction** — moves `op:start-session` out of core so
  OCapN-Noise doesn't inherit it.

## Security Considerations

- The Noise Protocol (XX pattern) provides strong forward secrecy and mutual
  authentication. This is a significant security improvement over tcp-for-test.
- Encrypted messages have a max size of 65535 - 16 = 65519 bytes (ChaCha20-Poly1305
  with 16-byte auth tag). Larger OCapN messages must be chunked. This limit
  should be documented.
- Transport-level security (e.g., WSS/TLS for WebSocket) is defense-in-depth
  but not required — Noise provides its own encryption layer.
- The intended-responder-key prefix on SYN prevents misdirected connections.

## Scaling Considerations

- Each transport listener is a separate server socket. Running multiple
  transports multiplies the number of listening ports.
- The Noise handshake adds 3 round-trips (SYN, SYNACK, ACK) before CapTP
  messages can flow. This is comparable to TLS.
- Encryption/decryption overhead is minimal (ChaCha20-Poly1305 is fast).

## Test Plan

- Unit test: `makeOcapnNoiseNetwork` with a mock transport completes the
  handshake and returns encrypted sessions.
- Integration test: two OCapN-Noise peers connect over TCP transport, exchange
  CapTP messages.
- Integration test: two OCapN-Noise peers connect over WebSocket transport.
- Integration test: peer with both transports connects to peer with only one.
- Cross-network test: OCapN-Noise peer cannot connect to tcp-for-test peer
  (different network identifiers, incompatible handshakes).

## Compatibility Considerations

- This is a new network. No existing wire compatibility to maintain.
- The `"np"` network identifier must be registered with the OCapN spec group.
- The Noise handshake byte format is already defined in
  `packages/ocapn-noise/src/bindings.js` and should be stable.

## Upgrade Considerations

- The daemon will need a new formula type or configuration to enable the
  OCapN-Noise network alongside or instead of the existing loopback/test
  networks.
- Peers using tcp-for-test cannot communicate with peers using OCapN-Noise.
  Migration requires both sides to upgrade.
