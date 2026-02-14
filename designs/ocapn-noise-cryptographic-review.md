## What is the Problem Being Solved?

The OCapN-Noise implementation makes two cryptographic design choices that
warrant review before stabilization:

1. **Noise XX handshake pattern**: The current implementation uses the XX
   pattern (mutual authentication where neither party knows the other's static
   key in advance). However, in OCapN the initiator **must** know the
   responder's public key — it's embedded in the locator and prefixed on the SYN
   message (32 bytes of intended-responder-key). If the initiator always knows
   the responder's key, a different Noise pattern might be more appropriate.

2. **Key derivation complexity**: The current implementation uses Ed25519 for
   signing and generates separate ephemeral x25519 keys for the Noise DH
   exchange, with an elaborate bonding mechanism to link the ephemeral x25519
   identity to the Ed25519 identity via signatures. If we could derive x25519
   keys directly from Ed25519 keys (a well-known conversion), the bonding
   ceremony might be simplified.

These are open design questions that should be resolved before the OCapN-Noise
network is implemented (work item: ocapn-noise-network).

## Description of the Design

### Open Question 1: Noise Handshake Pattern

#### Current: XX (Mutual Unknown)

```
XX:
  → e
  ← e, ee, s, es
  → s, se
```

Both parties transmit their static keys during the handshake. The initiator's
static key is encrypted under the first DH result; the responder's static key
is encrypted similarly. This provides mutual authentication and identity hiding
from passive observers.

The current implementation (`packages/ocapn-noise/src/bindings.js`)
layer additional validation on top of XX:

- SYN is prefixed with 32 bytes of the intended responder's Ed25519 public key
  (lines 285-313), so the responder can immediately reject misdirected
  connections.
- SYNACK includes the responder's Ed25519 key and a signature (lines 325-411).
- ACK includes the initiator's signature (lines 421-518).

#### Alternative: IK (Initiator Knows Responder)

```
IK:
  → e, es, s, ss
  ← e, ee, se
```

The initiator already has the responder's static key. This saves one round of
DH and reveals less about the handshake state to passive observers (the
initiator's first message is already encrypted to the responder's static key).

**Advantages of IK:**
- One fewer message pattern element.
- The initiator's identity is protected from passive observers from the first
  message (encrypted under the responder's static key).
- More accurately models the OCapN trust relationship: you need a locator
  (containing the public key) to connect.

**Disadvantages of IK:**
- If the responder's static key is compromised, an attacker can decrypt the
  initiator's identity from recorded traffic (weaker identity hiding than XX).
- Less flexibility if we ever want anonymous or exploratory connections.

#### Alternative: XK (Responder Known, Initiator Transmits)

```
XK:
  → e, es
  ← e, ee
  → s, se
```

The initiator knows the responder's static key but still transmits their own
static key in the third message.

**Advantages of XK:**
- Simpler than XX while preserving forward secrecy.
- The initiator's static key is encrypted under the DH result before
  transmission.

#### Recommendation

Leave this as an open design review question. The choice depends on:

- Whether identity hiding from passive observers is a priority for OCapN.  We
  probably cannot afford to hide the identity of the intended responder because
  relays and user agents will need to multiplex with a single addressable
  socket.
- Whether the responder ever needs to accept connections from unknown
  initiators (favors XX) vs. only from peers who have been given a locator
  (favors IK or XK).
  We probably do not need to respond to unknown initiators.
- Whether the additional signature bonding in the current XX implementation
  would be simplified or complicated by switching patterns.

### Open Question 2: Key Derivation Simplification

#### Current Approach

The current implementation (`packages/ocapn-noise/src/bindings.js`)
uses:

- **Ed25519** keys for long-term identity (signing, location signatures).
- **Ephemeral x25519** keys generated fresh for each Noise handshake.
- A **bonding** mechanism: the Ed25519 key signs the ephemeral x25519 key to
  prove they belong to the same entity. This bonding is checked during the
  SYNACK/ACK signature validation.

This is sound but complex. The bonding ceremony adds bytes to the handshake
messages and validation logic to both sides.

#### Proposed Simplification

Ed25519 and x25519 share the same underlying curve (Curve25519). It is
well-established that an Ed25519 private key can be converted to an x25519
private key, and the corresponding Ed25519 public key can be converted to an
x25519 public key. Libraries like `libsodium` provide
`crypto_sign_ed25519_pk_to_curve25519` and
`crypto_sign_ed25519_sk_to_curve25519` for exactly this purpose.

If we derive the **static** x25519 key from the Ed25519 key:

- The Noise handshake uses the derived x25519 static key directly.
- No bonding ceremony is needed — the x25519 key is mathematically tied to the
  Ed25519 key.
- The ephemeral x25519 key is still generated fresh per-handshake by the Noise
  protocol itself (this is intrinsic to Noise and provides forward secrecy).
- The handshake messages shrink (no bonding signatures).

**Concerns:**

- The Ed25519-to-x25519 conversion is a one-way function (you can go from
  Ed25519 to x25519 but not back). This is fine — we only need the x25519 key
  for DH, and we keep the Ed25519 key for signing.
- Some cryptographers advise against using the same key material for both
  signing and key exchange. However, this specific conversion is widely used
  (libsodium, age encryption, WireGuard tooling) and considered safe for
  Ed25519/x25519 specifically.
- The Noise protocol's ephemeral keys already provide forward secrecy. The
  static x25519 key derived from Ed25519 is used only for initial key agreement,
  not for encrypting messages directly.
- The WASM module (`packages/ocapn-noise/gen/ocapn-noise.wasm`) may need
  changes to support this derivation internally.

#### Recommendation

Investigate whether the Noise Protocol's built-in ephemeral key management
sufficiently covers the security properties that the current bonding ceremony
provides. If so, simplify by:

1. Deriving static x25519 from Ed25519 (one function call).
2. Letting Noise generate and manage ephemeral x25519 keys (it already does).
3. Removing the bonding signatures from the handshake.
4. Retaining Ed25519 signatures only for location signing and any
   application-level authentication needs.

### Deliverables

This work item produces a **design document** (not code) that:

1. Evaluates XX vs. IK vs. XK for OCapN-Noise with concrete security analysis.
2. Evaluates the Ed25519-to-x25519 derivation simplification.
3. Analyzes the interaction between the two choices (e.g., IK + derived keys
   may further simplify the protocol).
4. Provides a recommendation with rationale.
5. Is reviewed by at least one cryptography-aware contributor.

The resulting decisions feed into the **ocapn-noise-network** implementation.

## Security Considerations

- This is the most security-critical design decision in OCapN-Noise. The
  handshake pattern determines what an attacker can learn from passive
  observation, active MITM, and key compromise.
- The key derivation approach affects the blast radius of key compromise.
  If the same key material is used for signing and DH, compromising it
  compromises both.
- Forward secrecy is provided by Noise's ephemeral keys regardless of which
  pattern or key derivation approach is chosen.

## Scaling Considerations

- Simpler handshake patterns (IK) complete in fewer round-trips, reducing
  connection establishment latency. This matters for systems with many
  short-lived peer connections.

## Test Plan

- The design review itself is the deliverable. Implementation tests will be
  part of the ocapn-noise-network work item.
- If the handshake pattern changes, the existing Noise binding tests in
  `packages/ocapn-noise/test/` must be updated to reflect the new pattern.

## Compatibility Considerations

- Changing the handshake pattern is a breaking wire-protocol change. It must
  happen before OCapN-Noise is deployed in production.
- The design review should settle the protocol before implementation begins,
  avoiding a breaking change after deployment.

## Upgrade Considerations

- Since OCapN-Noise is not yet deployed as a network (only the bindings exist),
  there is no upgrade path to worry about. The design decisions made here will
  be the initial protocol.
