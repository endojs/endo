
## What is the Problem Being Solved?

The `op:start-session` handshake is currently implemented in OCapN core
(`packages/ocapn/src/client/handshake.js`) and runs for every session regardless
of network type. This forces all networks to use the same session negotiation
protocol, which is wrong for OCapN-Noise: the Noise Protocol handshake already
authenticates both parties and establishes encrypted channels, making
`op:start-session` redundant and potentially conflicting.

The tcp-for-test network (`packages/ocapn/src/netlayers/tcp-test-only.js`) is
the only network that genuinely needs `op:start-session` for its session
establishment. It should own that handshake rather than inheriting it from the
core.

## Description of the Design

### Step 1: Move `op:start-session` into tcp-for-test

Move the handshake logic from `packages/ocapn/src/client/handshake.js` into the
tcp-for-test network implementation. After this change:

- **tcp-for-test** sends and receives `op:start-session` as part of its
  `connect()` method, returning an authenticated session to OCapN core.
- **OCapN core** no longer sends `op:start-session`. It receives a session
  object from the network and proceeds directly to CapTP message exchange.

The current handshake flow in `packages/ocapn/src/client/handshake.js`
(lines 30-41, 129-247) includes:

- `sendHandshake()` — constructs and writes `op:start-session` with CapTP
  version, session public key, location, and location signature.
- `receiveHandshake()` — reads and validates the peer's `op:start-session`,
  checks version compatibility, validates location signature, handles crossed
  hellos.

All of this moves into tcp-for-test's `connect()` and incoming connection
handler.

### Step 2: Define the session handoff interface

The boundary between a network and OCapN core becomes a **session** object:

```js
/**
 * @typedef {object} NetworkSession
 * @property {string} sessionId - Unique session identifier
 * @property {PublicKeyId} localKeyId - Our key ID for this session
 * @property {PublicKeyId} remoteKeyId - Peer's key ID
 * @property {OcapnLocation} remoteLocation - Peer's location
 * @property {(bytes: Uint8Array) => void} write - Send bytes to peer
 * @property {() => void} close - Terminate session
 * @property {boolean} isInitiator - Whether we initiated this session
 */
```

For tcp-for-test, the session is established via `op:start-session` exchange
over raw TCP. For OCapN-Noise, the session is established via Noise Protocol
handshake. Both deliver the same `NetworkSession` interface to OCapN core.

### Step 3: Clean up handshake.js

After extraction, `packages/ocapn/src/client/handshake.js` can either:

- Be deleted entirely (if all its logic moves into tcp-for-test).
- Be retained as a shared utility that tcp-for-test imports, but it is no
  longer called by OCapN core.

The `op:start-session` codec in `packages/ocapn/src/codecs/operations.js`
(lines 33-42) remains available for networks that want to use it but is no
longer a core protocol requirement.

### Step 4: Update crossed-hellos handling

The current crossed-hellos logic (simultaneous connection attempts resolved by
comparing public key IDs) is in the handshake module. This logic is
network-specific:

- **tcp-for-test**: Needs crossed-hellos because connections are anonymous until
  `op:start-session` is exchanged.
- **OCapN-Noise**: The initiator already knows the responder's public key (it's
  in the SYN prefix), so crossed-hellos resolution may work differently.

Each network should implement its own crossed-hellos strategy.

### Affected Files

| File | Change |
|------|--------|
| `packages/ocapn/src/client/handshake.js` | Extract into tcp-for-test or delete |
| `packages/ocapn/src/client/index.js` | Remove handshake calls from `establishSession` |
| `packages/ocapn/src/netlayers/tcp-test-only.js` | Absorb handshake logic; implement `OcapnNetwork.connect()` |
| `packages/ocapn/src/client/types.js` | Define `NetworkSession` type |
| `packages/ocapn/test/` | Update test utilities to work with new session interface |

### Dependency

This work item depends on **ocapn-network-transport-separation** being
completed first, since it relies on the `OcapnNetwork` interface and the
network registration mechanism.

## Security Considerations

- The `op:start-session` handshake for tcp-for-test provides weak security
  (Ed25519 signature verification but no encryption). This is acceptable for
  testing only. Moving it into tcp-for-test makes this security boundary
  explicit rather than implicit.
- OCapN core should document that it trusts the network to deliver
  authenticated sessions. The core does not independently verify peer identity.
- The `op:start-session` message includes a location signature to prevent
  identity spoofing. This property is preserved by moving the check into
  tcp-for-test.

## Scaling Considerations

- No scaling impact.

## Test Plan

- All existing handshake tests should pass when run against tcp-for-test
  directly.
- New test: OCapN core receives a pre-authenticated session (mocked) and
  proceeds to CapTP without sending `op:start-session`.
- Integration test: two tcp-for-test peers connect and exchange CapTP messages
  end-to-end.

## Compatibility Considerations

- The wire protocol for tcp-for-test is unchanged (`op:start-session` is still
  exchanged). Only the code organization changes.
- Other OCapN implementations that rely on `op:start-session` being sent by the
  core will need to adapt. Since the OCapN spec is still in draft, this is the
  right time to make this change.

## Upgrade Considerations

- The daemon's peer connection logic routes through OCapN and will need to
  handle the new session-based interface.
- The `loopback-network` formula in the daemon may need updates if it currently
  relies on the core handshake.
