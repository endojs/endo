# Endo Locator Reference

| | |
|---|---|
| **Created** | 2026-03-18 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Current |

## Overview

An **endo locator** is a URL that identifies a formula on the Endo network.
Locators are the external representation of formula identifiers, suitable for
sharing between agents and across network boundaries. Internally, the daemon
stores **formula identifiers** (compact `{number}:{node}` strings); locators
are produced on demand by combining identifiers with type information and
optional connection hints.

## Locator Format

### Standard Locator

```
endo://{nodeNumber}/?id={formulaNumber}&type={formulaType}
```

| Component | Description |
|-----------|-------------|
| `nodeNumber` | 64-char hex Ed25519 public key of the peer that hosts the formula |
| `formulaNumber` | 64-char hex formula number (SHA-256 content address or random capability address) |
| `formulaType` | Formula type string (e.g., `host`, `guest`, `handle`, `worker`, `directory`, `remote`) |

### Locator with Connection Hints

```
endo://{nodeNumber}/?id={formulaNumber}&type={formulaType}&at={address1}&at={address2}
```

Connection hints are repeated `at` query parameters providing transport
addresses where the peer can be reached. Hints are ephemeral — they reflect the
peer's current network configuration and may change over time.

### Invitation Locator

```
endo://{nodeNumber}/?id={invitationNumber}&type=invitation&from={hostHandleNumber}&at={address1}
```

Invitation locators extend the standard format with:

| Parameter | Description |
|-----------|-------------|
| `type` | Always `invitation` |
| `from` | The host's handle formula number (used by the accepting peer to identify the inviting host) |
| `at` | Connection hints for reaching the inviting peer |

The `from` parameter is specific to invitation locators. Standard locators
and invitation locators are parsed separately: `parseLocator` validates
standard locators (allowing only `id`, `type`, and `at` parameters), while
invitation locators are parsed directly via `new URL()` in the invitation
acceptance code paths.

## Formula Identifiers

Internally, the daemon represents formulas as **formula identifiers**:

```
{formulaNumber}:{nodeNumber}
```

The `formulaNumber` and `nodeNumber` are both 64-character hex strings.
Local formulas use `LOCAL_NODE` (`'0'.repeat(64)`) as the node number — a
sentinel that is never a valid Ed25519 public key.

## Externalization and Internalization

The daemon maintains a duality between internal identifiers and external
locators:

### `externalizeId(id, formulaType, agentNodeNumber, addresses?)`

Converts an internal formula identifier to a locator for agent consumption.
Replaces `LOCAL_NODE` with the agent's own public key so that recipients know
which peer to contact.

```
internal id:  {number}:{LOCAL_NODE}
    → locator: endo://{agentKey}/?id={number}&type={type}
```

If `addresses` are provided, they are appended as `at` query parameters.

Remote identifiers (where node is not `LOCAL_NODE`) pass through with the
node number unchanged.

### `internalizeLocator(locator, isLocalKey)`

Converts a locator from an agent back to an internal formula identifier.
Recognizes any known local agent key and normalizes it to `LOCAL_NODE`.

```
locator: endo://{agentKey}/?id={number}&type={type}&at={addr}
    → id: {number}:{LOCAL_NODE}
    → formulaType: {type}
    → addresses: [{addr}]
```

### Round-trip Invariant

For local formulas:
```
internalId → externalizeId → internalizeLocator → internalId  ✓
```

For remote formulas, the node number is preserved through both operations.

## Method Taxonomy

### Name Resolution

| Method | Signature | Description |
|--------|-----------|-------------|
| `identify(...path)` | `name → identifier` | Resolve a pet name path to an internal formula identifier |
| `locate(...path)` | `name → locator` | Resolve a pet name path to a locator (calls through `externalizeId`) |
| `lookup(...path)` | `name → value` | Resolve a pet name path to the formula's value |

### Reverse Resolution

| Method | Signature | Description |
|--------|-----------|-------------|
| `reverseIdentify(id)` | `identifier → name[]` | Find all pet names for a formula identifier |
| `reverseLocate(locator)` | `locator → name[]` | Find all pet names for a locator (calls through `internalizeLocator`) |
| `reverseLookup(presence)` | `value → name[]` | Find all pet names for a live value |

### Enumeration

| Method | Signature | Description |
|--------|-----------|-------------|
| `list(...path)` | `name → name[]` | List pet names in a directory |
| `listIdentifiers(...path)` | `name → identifier[]` | List unique identifiers in a directory |
| `listLocators(...path)` | `name → Record<name, locator>` | Map pet names to locators in a directory |

### Writing

| Method | Signature | Description |
|--------|-----------|-------------|
| `write(path, id)` | `(name, identifier) → void` | Bind a pet name to a formula identifier (internal) |
| `writeLocator(path, locatorOrId)` | `(name, locator\|id) → void` | Bind a pet name; accepts locator or identifier |

`writeLocator` is the canonical write method exposed through exos. It
accepts either a locator string (starting with `endo://`) or a raw formula
identifier. When given a locator, it calls `internalizeLocator` to extract
the identifier before delegating to `write`. This method is defined once in
`directory.js` and carried up through `host.js` and `guest.js` via
destructuring — not re-implemented at each layer.

### Subscription

| Method | Signature | Description |
|--------|-----------|-------------|
| `followNameChanges(...path)` | `name → AsyncIterator<NameChange>` | Subscribe to pet name changes |
| `followLocatorNameChanges(locator)` | `locator → AsyncIterator<LocatorNameChange>` | Subscribe to name changes for a locator |

## LOCAL_NODE Sentinel

```js
const LOCAL_NODE = '0'.repeat(64);
```

All-zeros is never a valid Ed25519 public key, making it a safe sentinel for
"this daemon". The daemon maintains a `localKeys` set containing all known
local agent public keys. The predicate `isLocalKey(node)` returns `true` for
any key in this set, enabling `internalizeLocator` to normalize locators from
sibling agents on the same daemon.

## Locator Validation

`parseLocator(locator)` validates standard locators:

- Protocol must be `endo://`
- Node (hostname) must be a valid 64-char hex string
- Required parameters: `id` (formula number) and `type` (formula type)
- Allowed parameters: `id`, `type`, `at`
- Any other parameter causes validation failure

Invitation locators include additional parameters (`from`) and are not
validated through `parseLocator`. They are parsed directly in the invitation
acceptance code paths in `daemon.js` and `host.js`.

## Connection Hints and Peer Info

Connection hints (`at` parameters) are ephemeral transport addresses.
When a locator with hints is received:

1. The formula identifier is extracted and stored durably
2. The hints are forwarded to the peer info system via `addPeerInfo`
3. Hints are not stored with the formula — they are looked up fresh when
   producing a locator for sharing

When producing a locator for sharing (`locate`), the current hints for the
peer are fetched from the network layer and appended as `at` parameters.

## Files

| File | Key Exports |
|------|------------|
| `locator.js` | `parseLocator`, `formatLocator`, `formatLocatorForSharing`, `externalizeId`, `internalizeLocator`, `idFromLocator`, `addressesFromLocator`, `LOCAL_NODE` |
| `formula-identifier.js` | `parseId`, `formatId`, `isValidNumber` |
| `formula-type.js` | `isValidFormulaType`, `assertValidFormulaType` |
| `directory.js` | `makeDirectoryMaker` (provides `locate`, `writeLocator`, etc.) |
| `host.js` | `makeHostMaker` (carries up directory methods) |
| `guest.js` | `makeGuestMaker` (carries up directory methods) |
| `mail.js` | `makeMailboxMaker` (externalizes message identifiers to locators) |
| `daemon.js` | `makeInvitation` (constructs invitation locators) |
