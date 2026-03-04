# Daemon Development Guide

## Formula Lifecycle

### Disk before graph

Formula JSON must be persisted to disk **before** the formula ID enters the in-memory `formulaForId` map or dependency graph. Otherwise, if evaluation fails, retries and reincarnation find the ID but no backing JSON file on disk (`No reference exists at path ...`).

The safe pattern (see `formulateNumberedHandle`):

```js
// 1. Write to disk first
await persistencePowers.writeFormula(formulaNumber, formula);
// 2. Then add to in-memory graph
await withFormulaGraphLock(async () => {
  formulaForId.set(id, formula);
  formulaGraph.onFormulaAdded(id, formula);
});
```

### Formula types and their dependencies

`provideGuest` creates a chain of dependent formulas: handle, mailbox-store, mail-hub, keypair, pet-store, worker, guest. Each must be fully persisted before the next depends on it.

### Special names

`AGENT`, `SELF`, `HOST`, `KEYPAIR`, `MAIL` are reserved uppercase names managed by `makePetSitter` in `guest.js`. They match the pattern `/^[A-Z][A-Z0-9-]{0,127}$/` (see `isSpecialName` in `src/pet-name.js`). The daemon's `exports` map does not expose `src/pet-name.js` to external packages.

## Guest Provisioning

### introducedNames

`introducedNames` maps `{ parentName: childName }` where `parentName` is resolved in the host's namespace and `childName` is written into the guest's namespace. The `childName` must be a valid **pet name** (lowercase, matching `/^[a-z0-9][a-z0-9-]{0,127}$/`), not a special name.

### Handle vs Guest

`lookup(petName)` where the pet name was written to a `handleId` returns a **Handle** (only has `open`, `receive`). To get the full `EndoGuest` (with `makeDirectory`, `list`, `send`, etc.), use the return value of `provideGuest()`.

### provideGuest idempotency

On restart, calling `provideGuest` with `introducedNames` on an already-existing guest fails because the reincarnated handle formula lacks `write`. Guard with `E(agent).has(name)` before calling `provideGuest`.

## Message Protocol

### Message types

- `type: 'package'` messages work with `adopt()`.
- `type: 'value'` messages (created by form submissions via `submit()`) have a `valueId`. Use `E(powers).lookupById(msg.valueId)` to resolve the value — `adopt()` will throw `"Message must be a package"`.

### Form flow

A guest sends a form to HOST via `E(powers).form('HOST', title, fields)`. The host user submits via `E(agent).submit(messageNumber, values)`, which creates a `type: 'value'` message in the guest's inbox with `replyTo` pointing to the form's `messageId`.

## Gateway

The gateway (`src/daemon.js` line ~851) rejects requests for non-local node IDs with `"Gateway can only provide local values"`. After a daemon restart, the node number changes, so any client holding a stale formula ID from a previous session will hit this error.
