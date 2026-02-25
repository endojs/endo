
## Current State

This document describes terminology and format changes for the daemon's
identifier and locator system, building on the 256-bit identifier migration
from `designs/daemon-256-bit-identifiers.md`.

### Current Terminology

| Term | Definition |
|------|------------|
| Node Number | 64-char hex string (Ed25519 public key after 256-bit migration) |
| Formula Number | 64-char hex string (SHA-256 or random 256-bit) |
| Formula Identifier | `{formulaNumber}:{nodeNumber}` |
| Locator | `endo://{nodeNumber}/?id={formulaNumber}&type={type}` |

### Current Locator Format

Standard locator (locator.js:89-101):
```
endo://{nodeNumber}/?id={formulaNumber}&type={formulaType}
```

Invitation locator (daemon.js:3166-3173):
```
endo://{nodeNumber}?id={invitationNumber}&from={handleNumber}&at={address1}&at={address2}
```

Connection hints are passed as repeated `at` query parameters.

### Current Types (types.d.ts)

```typescript
/** A 64-character hex string identifying a formula within a node */
export type FormulaNumber = string & { [FormulaNumberBrand]: true };

/** A 64-character hex string identifying a node */
export type NodeNumber = string & { [NodeNumberBrand]: true };

/** A full formula identifier in the format {FormulaNumber}:{NodeNumber} */
export type FormulaIdentifier = string & { [FormulaIdentifierBrand]: true };
```

Connection hints are stored in `PeerFormula.addresses: Array<string>`
(types.d.ts:233).

### Current Methods

The daemon already has parallel identifier and locator methods:

| Method | Location | Purpose |
|--------|----------|---------|
| `parseId(id)` | formula-identifier.js | Parse identifier → `{number, node}` |
| `formatId({number, node})` | formula-identifier.js | Format `{number, node}` → identifier |
| `parseLocator(locator)` | locator.js | Parse locator → `{formulaType, node, number}` |
| `formatLocator(id, type)` | locator.js | Format identifier + type → locator |
| `idFromLocator(locator)` | locator.js | Extract identifier from locator |
| `identify(...path)` | NameHub | Resolve pet name path → identifier |
| `locate(...path)` | NameHub | Resolve pet name path → locator |
| `reverseIdentify(id)` | EndoAgent | Identifier → pet names |
| `reverseLocate(locator)` | NameHub | Locator → pet names |
| `listIdentifiers(...path)` | NameHub | List identifiers in directory |
| `lookupById(id)` | EndoAgent | Identifier → value |

---

## Target State

### New Terminology

| Current Term | New Term | Definition |
|--------------|----------|------------|
| Node Number | **Peer Key** | Ed25519 public key (64-char hex) |
| Formula Number | **Formula Address** | Content address (SHA-256) or capability address (random 256-bit) |
| Formula Identifier | **Formula Key** | `{formulaAddress}:{peerKey}` |
| (new concept) | **Connection Hint** | Transport-prefixed address string (e.g., `ws:example.com:8920`) |
| (new concept) | **Peer Locator** | Peer key + connection hints |
| (new concept) | **Formula Locator** | Formula key + connection hints + type |

### New Locator Format

Standard locator:
```
endo://{peerKey}/{formulaAddress}?type={formulaType}
```

Locator with connection hints:
```
endo://{peerKey}/{formulaAddress}@{hint1}@{hint2}?type={formulaType}
```

Invitation locator:
```
endo://{peerKey}/{invitationAddress}@{hint1}@{hint2}?type=invitation&from={handleAddress}
```

The `from` parameter contains only the handle's formula address (peer key is
the same as the hostname).

### New Types (types.d.ts)

```typescript
// Semantic aliases for existing types
export type PeerKey = NodeNumber;
export type FormulaAddress = FormulaNumber;
export type FormulaKey = FormulaIdentifier;

// Connection hint type
export type ConnectionHint = string;

// Locator structures
export type PeerLocator = {
  peerKey: PeerKey;
  hints: ConnectionHint[];
};

export type FormulaLocator = {
  formulaKey: FormulaKey;
  formulaType: string;
  hints: ConnectionHint[];
};
```

---

## Method Changes

**Invariant: No existing method signatures change.** Existing methods continue
to work with identifiers as they do today. New methods are added for
locator-with-hints operations.

### Low-Level Functions (locator.js, formula-identifier.js)

| Current Method | Signature | Change |
|----------------|-----------|--------|
| `parseId(id)` | `string → {number, node}` | Unchanged |
| `formatId(record)` | `{number, node} → string` | Unchanged |
| `parseLocator(locator)` | `string → {formulaType, node, number}` | Returns additional `hints` field |
| `formatLocator(id, type)` | `(string, string) → string` | Unchanged (no hints) |
| `idFromLocator(locator)` | `string → string` | Unchanged |

| New Method | Signature | Purpose |
|------------|-----------|---------|
| `formatLocatorWithHints(id, type, hints)` | `(string, string, string[]) → string` | Format locator with connection hints |

### High-Level Methods (NameHub, EndoAgent, EndoHost)

| Current Method | Signature | Change |
|----------------|-----------|--------|
| `identify(...path)` | `...string[] → Promise<string?>` | Unchanged |
| `locate(...path)` | `...string[] → Promise<string?>` | Internal format change only |
| `reverseIdentify(id)` | `string → Name[]` | Unchanged |
| `reverseLocate(locator)` | `string → Promise<Name[]>` | Unchanged |
| `listIdentifiers(...path)` | `...string[] → Promise<string[]>` | Unchanged |
| `lookupById(id)` | `string → Promise<unknown>` | Unchanged |

| New Method | Signature | Purpose |
|------------|-----------|---------|
| `locateWithHints(...path)` | `...string[] → Promise<string?>` | Resolve path → locator with current hints |

### Invitation Methods (EndoHost)

| Current Method | Signature | Change |
|----------------|-----------|--------|
| `invite(guestName)` | `string → Promise<Invitation>` | Unchanged; `Invitation.locate()` returns new format |
| `accept(locator, guestName)` | `(string, string) → Promise<void>` | Parses new format internally |

---

## Dehydration and Hydration

Locators carry both stable data (formula key) and ephemeral data (connection
hints). These are separated at ingestion and recombined at presentation:

**Dehydration** (on ingestion): When a locator is received, extract the
formula key and store it. Separately, update the peer's connection hints in
`PeerFormula.addresses`. The formula key is the durable reference; hints are
transient.

```js
const { peerKey, formulaAddress, hints, formulaType } = parseLocator(locator);
const formulaKey = formatId({ number: formulaAddress, node: peerKey });

// Store the stable reference
await petStore.write(petName, formulaKey);

// Update peer hints separately
await addPeerInfo({ node: peerKey, addresses: hints });
```

**Hydration** (on presentation): When a locator is needed, look up the peer's
current connection hints and combine them with the stored formula key.

```js
const formulaKey = await petStore.read(petName);
const { node: peerKey } = parseId(formulaKey);
const { addresses: hints } = await getPeerInfo(peerKey);

const locator = formatLocatorWithHints(formulaKey, formulaType, hints);
```

**Round-trip invariant**: If a locator is dehydrated and then hydrated without
any intervening hint changes, the resulting locator is identical to the
original.

---

## Files to Modify

**`packages/daemon/src/types.d.ts`**
- Add `PeerKey`, `FormulaAddress`, `FormulaKey` type aliases
- Add `ConnectionHint`, `PeerLocator`, `FormulaLocator` types
- Add `locateWithHints` to `NameHub` interface

**`packages/daemon/src/formula-identifier.js`**
- Update function documentation to use new terminology (no signature changes)

**`packages/daemon/src/locator.js`**
- Update `parseLocator` return type to include `hints`
- Add `formatLocatorWithHints`
- Add backward compatibility: detect old format (has `id` query param)

**`packages/daemon/src/directory.js`**
- Add `locateWithHints` implementation
- Update `locate` to use new format internally

**`packages/daemon/src/daemon.js`**
- Lines 3162-3173: `makeInvitation.locate()` — use new format
- Lines 3179-3199: `makeInvitation.accept()` — parse new format
- Add `locateWithHints` to directory implementations

**`packages/daemon/src/host.js`**
- Lines 587-637: `accept()` — parse new invitation format, dehydrate hints

---

## Migration

Type aliases allow incremental code migration. `parseLocator` detects the
format by checking for the `id` query parameter (old format) vs formula
address in path (new format). No state migration is needed since formulas
store formula keys, not locators.

## Test Plan

- Parse/format round-trip for new locator format
- Parse with URL-encoded hints containing `@` or `/`
- Backward compatibility: parse old `?id=` format
- `locateWithHints` returns locator with current peer hints
- Dehydration/hydration round-trip invariant
- Integration: invitation creation and acceptance with new format
