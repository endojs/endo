# Daemon 256-bit Identifiers

| | |
|---|---|
| **Date** | 2026-02-24 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Core migration and per-agent keypairs complete; network registration and null-node locators are future work |

## What is the Problem Being Solved?

The Endo daemon originally used 512-bit (128-character hex) identifiers for
formula numbers, node identifiers, and content addresses. This was larger than
necessary and misaligned with the OCapN-Noise network protocol, which uses
Ed25519 public keys (256-bit / 64-character hex) for peer identification.

Original state:

| Component          | Size     | Encoding       | Source                      |
|--------------------|----------|----------------|------------------------------|
| Node/Peer ID       | 512 bits | 128-char hex   | SHA-512(rootNonce + "node") |
| Formula Number     | 512 bits | 128-char hex   | Random or SHA-512           |
| Formula Identifier | 257 chars| `{number}:{node}` | Composite                |
| Content Address    | 512 bits | 128-char hex   | SHA-512(content)            |

Problems with the original approach:

1. **Excessive identifier size**: 512-bit random identifiers provided far more
   collision resistance than necessary (2^256 is already astronomical).
2. **Misalignment with OCapN-Noise**: The network protocol uses Ed25519 keys
   (256-bit) for peer identity. The daemon's 512-bit node identifier was
   redundant — it should be the Ed25519 public key directly.
3. **Storage inefficiency**: Every formula path, pet store entry, and message
   reference carried 128-character hex strings where 64 would suffice.
4. **SHA-256 is sufficient**: For content addressing, SHA-256 provides adequate
   collision resistance and is more widely deployed.

## Current State

All core identifier migration work and per-agent keypairs are complete.

| Component          | Size     | Encoding     | Source                  |
|--------------------|----------|--------------|--------------------------|
| Node/Peer ID       | 256 bits | 64-char hex  | Ed25519 public key      |
| Formula Number     | 256 bits | 64-char hex  | Random or SHA-256       |
| Formula Identifier | 129 chars| `{number}:{node}` | Composite          |
| Content Address    | 256 bits | 64-char hex  | SHA-256(content)        |

### What Was Done

#### Peer Identification

The SHA-512 derived node identifier was replaced with an Ed25519 public key.
The daemon generates a **root keypair** at first start, stored at
`{statePath}/keypair` alongside the `nonce` file. The public key hex serves as
`localNodeNumber`.

```js
// daemon.js — daemon initialization
const { keypair: rootKeypair } =
  await persistencePowers.provideRootKeypair();
const localNodeNumber = Array.from(rootKeypair.publicKey, byte =>
  byte.toString(16).padStart(2, '0'),
).join('');
```

#### Formula Number Generation

512-bit random was replaced with 256-bit random for all formula numbers:

```js
// daemon-node-powers.js
const randomHex256 = () =>
  new Promise((resolve, reject) =>
    crypto.randomBytes(32, (err, bytes) => {
      if (err) {
        reject(err);
      } else {
        resolve(bytes.toString('hex'));
      }
    }),
  );
```

#### Content Addressing

SHA-512 was replaced with SHA-256 for content-addressed formulas
(`makeContentSha256Store`).

#### CryptoPowers Interface

```typescript
// types.d.ts
export type Sha256 = {
  update: (chunk: Uint8Array) => void;
  updateText: (chunk: string) => void;
  digestHex: () => string;
};

export type Ed25519Keypair = {
  publicKey: Uint8Array;  // 32 bytes
  privateKey: Uint8Array; // 32 bytes (seed)
};

export type CryptoPowers = {
  makeSha256: () => Sha256;
  randomHex256: () => Promise<string>;
  generateEd25519Keypair: () => Promise<Ed25519Keypair>;
};
```

Key *persistence* is not a crypto concern — it belongs in
`DaemonicPersistencePowers`. `CryptoPowers` only generates keypairs; the
caller is responsible for storing them via the persistence layer.

#### Validation Patterns

```js
// formula-identifier.js
const numberPattern = /^[0-9a-f]{64}$/;
const idPattern = /^(?<number>[0-9a-f]{64}):(?<node>[0-9a-f]{64})$/;
```

#### Locator Format

The locator format is unchanged but uses shorter identifiers:

```
endo://{64-char node}/?id={64-char number}&type={type}
```

#### Storage Path Format

```
{statePath}/formulas/{head(2)}/{tail(62)}.json
```

#### Branded Types

```typescript
// types.d.ts
/** A 64-character hex string identifying a formula within a node */
export type FormulaNumber = string & { [FormulaNumberBrand]: true };

/** A 64-character hex string (Ed25519 public key) identifying a node */
export type NodeNumber = string & { [NodeNumberBrand]: true };
```

### Per-Agent Keypairs

Each host and guest agent now has its own Ed25519 keypair, stored as a
`keypair` formula in the formula graph. The keypair is generated when the
agent is formulated, and the agent can look up its own keypair via the
`KEYPAIR` special name.

#### KeypairFormula

```typescript
type KeypairFormula = {
  type: 'keypair';
  publicKey: string;   // 64-char hex Ed25519 public key
  privateKey: string;  // 64-char hex Ed25519 private key (seed)
};
```

The keypair formula contains the key material directly. This keeps the formula
graph as the single source of truth — keypair lifecycle follows formula
lifecycle (deleting the formula deletes the keys), and no new persistence
powers are needed. The private key in a formula JSON file has the same security
posture as the existing `nonce` file: plaintext on disk, protected by
filesystem permissions.

Keypair formulas have no dependencies (empty `extractDeps` return) and their
maker simply exposes the public key:

```js
// daemon.js makers table
keypair: ({ publicKey }) => harden({ publicKey }),
```

#### Agent Formulas

Both `HostFormula` and `GuestFormula` now include a required `keypair` field:

```typescript
type HostFormula = {
  type: 'host';
  handle: FormulaIdentifier;
  hostHandle: FormulaIdentifier;
  keypair: FormulaIdentifier;
  worker: FormulaIdentifier;
  inspector: FormulaIdentifier;
  petStore: FormulaIdentifier;
  mailboxStore: FormulaIdentifier;
  mailHub: FormulaIdentifier;
  endo: FormulaIdentifier;
  networks: FormulaIdentifier;
  pins: FormulaIdentifier;
};

type GuestFormula = {
  type: 'guest';
  handle: FormulaIdentifier;
  keypair: FormulaIdentifier;
  hostHandle: FormulaIdentifier;
  hostAgent: FormulaIdentifier;
  petStore: FormulaIdentifier;
  mailboxStore: FormulaIdentifier;
  mailHub: FormulaIdentifier;
  worker: FormulaIdentifier;
};
```

#### Formulation Flow

When a host or guest is formulated, `formulateKeypair()` generates a fresh
Ed25519 keypair, hex-encodes the keys using `Array.from().join('')` (SES-safe,
no `Buffer`), and writes it as a keypair formula:

```js
const formulateKeypair = async () => {
  const keypair = await generateEd25519Keypair();
  const publicKeyHex = Array.from(keypair.publicKey, byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const privateKeyHex = Array.from(keypair.privateKey, byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const keypairFormulaNumber = await randomHex256();
  const formula = { type: 'keypair', publicKey: publicKeyHex, privateKey: privateKeyHex };
  const { id: keypairId } = await formulate(keypairFormulaNumber, formula);
  return { keypairId };
};
```

The returned `keypairId` is included in `formulateHostDependencies` and
`formulateGuestDependencies`, then stored in the host/guest formula.

#### Special Names

Both `makeHost` and `makeGuest` accept a `keypairId` parameter and register it
as the `KEYPAIR` special name, allowing agents to look up their own keypair:

```js
// host.js
const specialNames = {
  ...platformNames,
  AGENT: hostId,
  SELF: handleId,
  HOST: hostHandleId ?? handleId,
  KEYPAIR: keypairId,
  MAIN: mainWorkerId,
  ENDO: endoId,
  // ...
};

// guest.js
const specialNames = {
  AGENT: guestId,
  SELF: handleId,
  HOST: hostHandleId,
  KEYPAIR: keypairId,
};
```

#### Formula Types

The complete set of 26 formula types (`formula-type.js`):

`directory`, `endo`, `eval`, `guest`, `handle`, `host`, `invitation`,
`keypair`, `known-peers-store`, `least-authority`, `lookup`,
`loopback-network`, `mail-hub`, `mailbox-store`, `make-bundle`,
`make-unconfined`, `marshal`, `message`, `peer`, `pet-inspector`,
`pet-store`, `promise`, `readable-blob`, `resolver`, `worker`.

## Future Work

### Network Registration

Each installed network (accessible through the NETS formula) will need to know
the public keys of all active agents so the network layer can accept and
negotiate connections on behalf of any persona.

**Registration flow:**

1. When a new agent with a keypair is created, the daemon registers that
   agent's public key with every installed network.
2. Each agent tracks its own set of retained agents (via its pet store) and
   maintains the list of known keys for each installed network incrementally.
3. When a network receives an inbound connection, it can identify which local
   agent the remote peer is trying to reach by matching the target public key.

**Interface sketch:**

```typescript
// On the network object (Far reference)
interface EndoNetwork {
  // ... existing methods ...
  registerAgentKey(publicKey: string, agentId: FormulaIdentifier): Promise<void>;
  unregisterAgentKey(publicKey: string): Promise<void>;
}
```

This is additive — networks that do not support multi-key registration simply
ignore the calls. The daemon root keypair is always registered as the default.

### Per-Agent Connection Hints

Each agent/persona can independently manage connection hints that control how
peers reach them on the network.

**Examples of per-agent connection policies:**

- **Require anonymizing relay**: A pseudonymous persona may require all inbound
  connections to arrive through a relay, never revealing the daemon's network
  address.
- **Allow direct connections**: A named persona may accept direct TCP
  connections for lower latency.
- **Prefer specific transports**: A persona may prefer WebSocket over raw TCP,
  or vice versa.

**Storage:** Connection hints are stored per-agent alongside the keypair:

```typescript
type AgentConnectionHints = {
  publicKey: string;                // 64-char hex Ed25519 public key
  requireRelay?: boolean;           // force connections through relay
  allowDirectConnect?: boolean;     // accept direct inbound connections
  preferredTransports?: string[];   // ordered list of transport preferences
  relayAddresses?: string[];        // specific relay nodes to use
};
```

Connection hints are advisory — the network layer uses them to configure
listener behavior and to advertise appropriate addresses to peers, but the
agent's keypair is the ultimate identity.

### Locator Construction with Agent Keys

When an agent constructs a locator for external consumption, it should use
*its own* public key as the peer/node component, not `localNodeNumber`. This
means the same local formula can appear under different locators depending on
which agent is sharing it.

### Null Local Node in Formula Keys

With multiple agent public keys, there is no single canonical
`localNodeNumber` to embed in formula keys for locally-stored formulas. Using
any specific agent's public key would create an artificial dependency between
formula storage and agent identity.

**Proposal: Sentinel Null Node**

Use 64 characters of `'0'` (`'0'.repeat(64)`) as a sentinel "null node" value
in locally-stored formula keys. This is analogous to how `0.0.0.0` works in
networking — a "this host" placeholder that is never a valid Ed25519 public key
(since the all-zeros point is not on the curve).

```js
const NULL_NODE = /** @type {NodeNumber} */ ('0'.repeat(64));
```

**Formula key construction:**

```js
// Local formula key (stored on disk)
const localId = formatId({ number: formulaNumber, node: NULL_NODE });

// Locator for external consumption (agent-specific)
const locator = formatId({ number: formulaNumber, node: agentPublicKey });
```

**`isLocalId` change:**

```js
// Current
const isLocalId = id => parseId(id).node === localNodeNumber;

// Proposed
const isLocalId = id => parseId(id).node === NULL_NODE;
```

**Inbound locator normalization:** When receiving a locator from the network
and converting it to a formula key for local storage, the daemon replaces the
agent's public key with `NULL_NODE`:

```js
const normalizeInboundId = id => {
  const { number, node } = parseId(id);
  if (isKnownLocalKey(node)) {
    return formatId({ number, node: NULL_NODE });
  }
  return id; // remote formula, keep as-is
};
```

**Outbound locator construction:** When constructing a locator for external
consumption, the daemon replaces `NULL_NODE` with the sharing agent's public
key:

```js
const externalizeId = (id, agentPublicKey) => {
  const { number, node } = parseId(id);
  if (node === NULL_NODE) {
    return formatId({ number, node: agentPublicKey });
  }
  return id; // remote formula, keep as-is
};
```

## Security Considerations

- **256-bit random**: Provides 2^256 collision resistance, which is
  astronomically sufficient. A collision would require ~2^128 attempts on
  average (birthday bound), which exceeds the computational capacity of any
  conceivable adversary.

- **SHA-256**: Provides 128-bit security against collision attacks (birthday
  bound) and 256-bit security against preimage attacks. This is sufficient for
  content addressing where an attacker would need to find a collision to
  substitute malicious content.

- **Ed25519**: Provides 128-bit security level. The public key serves as a
  permanent identifier, while the private key enables authentication during
  OCapN-Noise handshakes. Ed25519 signatures are deterministic, preventing
  nonce-reuse vulnerabilities.

- **No weakening of security**: The migration from 512-bit to 256-bit
  identifiers does not weaken security in any practical sense. 256-bit security
  is considered safe against quantum computers with Grover's algorithm
  (effective 128-bit security).

## Migration Notes

- **No backward compatibility**: This migration does not maintain compatibility
  with the original 512-bit identifiers. All test users must purge their daemon
  state (`rm -rf ~/.local/state/endo/`).

- **Clean slate**: The migration assumes fresh daemon state. Future work may
  introduce versioned formula identifiers if backward compatibility becomes
  necessary.

- **OCapN-Noise alignment**: The daemon's node identifier is now the Ed25519
  public key, which is already used by OCapN-Noise for peer authentication.
  This eliminates the need to maintain two separate peer identification schemes.

## Test Plan

1. **Unit tests for crypto functions**:
   - `randomHex256()` returns 64-character hex strings
   - `makeSha256()` produces correct digests
   - `generateEd25519Keypair()` returns valid keypairs

2. **Validation tests**:
   - `isValidNumber()` accepts 64-char hex, rejects 128-char
   - `parseId()` correctly parses new format
   - `formatId()` produces valid identifiers

3. **Integration tests**:
   - Fresh daemon starts with 256-bit identifiers
   - Formula storage uses new path format
   - Content addressing uses SHA-256
   - Locators parse correctly
   - Keypair formula JSON files appear in test state directories
   - Agents have KEYPAIR in their special names

4. **Cross-package tests**:
   - CLI commands handle new identifier format
   - Chat displays identifiers correctly

## Compatibility Considerations

- **Breaking change**: Existing daemon state is incompatible. Users must delete
  `~/.local/state/endo/` and start fresh.

- **Network protocol**: No wire protocol changes. OCapN-Noise already uses
  Ed25519 keys.

- **API stability**: The daemon API returns identifiers; callers should not
  assume identifier length. TypeScript branded types enforce this.

## Upgrade Considerations

- **State purge required**: `rm -rf ~/.local/state/endo/ ~/.config/endo/`

- **No automatic migration**: Manual state purge is required. Future work may
  provide migration tooling if backward compatibility becomes important.

- **Documentation update**: Update any user-facing documentation that references
  identifier format or length.
