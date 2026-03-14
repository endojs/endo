# Daemon Agent Network Identity

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The [daemon-256-bit-identifiers](daemon-256-bit-identifiers.md) design
migrated the daemon to 256-bit identifiers and gave every host and guest
agent its own Ed25519 keypair (accessible via the `KEYPAIR` special name).
The core migration is complete: keypairs are generated, stored as formulas,
and available to agents.

However, the keypairs are not yet *used* for anything beyond storage. Three
pieces of follow-up work remain to connect per-agent keypairs to the network
layer and to the formula identifier system:

1. **Network registration.** Installed networks do not know about agent
   keypairs. When a remote peer connects targeting a specific agent's public
   key, the network layer cannot route the connection to the correct agent.

2. **Locator construction with agent keys.** When an agent shares a formula
   with an external peer, the locator should use the agent's public key as
   the node component — not the daemon's root `localNodeNumber`. Currently
   all locators use the root key, meaning all agents appear as the same
   network identity.

3. **Null local node for formula storage.** Locally-stored formula
   identifiers embed `localNodeNumber` as the node component. With multiple
   agent keys, there is no single canonical local node. A sentinel "null
   node" value (`'0'.repeat(64)`) should replace `localNodeNumber` in stored
   formula keys, with translation to/from agent-specific keys happening at
   the network boundary.

## Design

### Network Registration

Each installed network (accessible through the NETS formula) needs to know
the public keys of all active agents so the network layer can accept and
negotiate connections on behalf of any persona.

**Registration flow:**

1. When a new agent with a keypair is created, the daemon registers that
   agent's public key with every installed network.
2. Each agent tracks its own set of retained agents (via its pet store) and
   maintains the list of known keys for each installed network incrementally.
3. When a network receives an inbound connection, it can identify which local
   agent the remote peer is trying to reach by matching the target public key.

**Interface:**

```typescript
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

**Sentinel Null Node:**

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

## Dependencies

- [daemon-256-bit-identifiers](daemon-256-bit-identifiers.md) — provides the
  per-agent keypairs and 256-bit identifier infrastructure this design builds
  on.
- [ocapn-network-transport-separation](ocapn-network-transport-separation.md)
  — the network abstraction layer that will implement `registerAgentKey`.
- [daemon-capability-persona](daemon-capability-persona.md) — the persona
  system that motivates per-agent network identity.

## Related Designs

- [daemon-256-bit-identifiers](daemon-256-bit-identifiers.md) — parent design;
  this was originally the "Future Work" section of that document.
- [daemon-locator-terminology](daemon-locator-terminology.md) — locator format
  changes that interact with null-node normalization.
- [ocapn-noise-network](ocapn-noise-network.md) — the OCapN-Noise protocol
  that uses Ed25519 keys for peer authentication.
