## What is the Problem Being Solved?

The inventory is a flat, ungrouped list of pet names. As the number of
capabilities grows, users can't easily distinguish between different kinds of
things: agent handles (representing people/guests), naming hubs (directories,
hosts, guests that expose `lookup`), and leaf values (blobs, eval results,
promises). The daemon knows the formula type for every capability but doesn't
currently expose it through the agent's naming API.

## Description of the Design

### Inventory Groups

Group inventory items into collapsible sections:

| Group | Formula Types | Icon | Description |
|-------|--------------|------|-------------|
| **Handles** | `handle` | Person silhouette | Agent identities (hosts, guests) |
| **Hubs** | `directory`, `host`, `guest`, `pet-store` | Folder | Naming containers that expose `lookup` / `list` |
| **Workers** | `worker` | Gear | Execution sandboxes |
| **Everything Else** | All remaining types | Circle | Blobs, eval results, promises, lookups, etc. |

Each item should display a small type badge showing the formula type (e.g.,
`eval`, `readable-blob`, `worker`).

The "system" items (all-caps names like `SELF`, `AGENT`) that are currently
hidden by default should remain in their respective type groups but with the
existing toggle to show/hide them.

### Daemon API Changes

The fundamental problem is that the chat UI currently only receives pet names
from `followNameChanges()`, with no type information. Two approaches:

**Option A: Extend `followNameChanges()`** (preferred)

Extend the change events to include type metadata:

```js
// Current: { add: 'my-file' } or { remove: 'my-file' }
// Proposed: { add: 'my-file', type: 'readable-blob' }
```

This avoids N+1 lookups and lets the UI group at subscription time. The change
event shape is additive — old consumers that don't read `type` are unaffected.

**Option B: New `identifyType(petName)` method**

```js
const type = await E(agent).identifyType('my-file');
// => 'readable-blob'
```

Simpler to implement but requires a round-trip per item.

### Future: Alleged Interface

In the fullness of time, also expose the alleged interface name (from
`M.interface()` guard definitions) as additional metadata. This would let the UI
show richer type information, e.g., "EndoHost" rather than just "host". This is
a stretch goal that requires plumbing interface names through the formula
metadata.

### Key Implementation Points

- Formula types are defined in `packages/daemon/src/formula-type.js` (26 types).
- The `identify()` method on the agent already returns formula identifiers. The
  formula type is embedded in the stored formula but not currently returned to
  the client.
- Grouping and sorting are purely client-side operations in
  `packages/chat/inventory-component.js` and `packages/chat/src/chat.js`.

### Affected Packages

- `packages/daemon` — extend `followNameChanges()` or add `identifyType()`
- `packages/chat` — grouped inventory rendering
- `packages/cli` — `endo list` could gain a `--grouped` or `--type` flag

## Security Considerations

- Exposing formula type to the owning agent is safe — it's their own pet store.
- Exposing alleged interface names could leak implementation details to guests.
  Consider restricting interface metadata to host-level authority.
- Formula type is already determinable by inspecting behavior; exposing it
  explicitly doesn't grant new capabilities.

## Scaling Considerations

- The batch approach (extending `followNameChanges`) avoids N+1 lookups and
  scales to large inventories.
- Grouping is purely client-side sorting/filtering after receiving the data.
- Collapsible groups improve perceived performance for large inventories by
  reducing visible DOM elements.

## Test Plan

- Unit test: `identifyType` or extended `followNameChanges` returns correct
  type for each formula kind.
- Integration test: create items of different types, verify grouping in
  `endo list --type`.
- UI test: items appear in correct groups; collapsing/expanding works; type
  badges display correctly.

## Compatibility Considerations

- Extending `followNameChanges()` output shape must be backward compatible.
  The `type` field is additive — old consumers that destructure only `add` or
  `remove` are unaffected.
- New `identifyType` method is purely additive.
- The `NameHubInterface` in `packages/daemon/src/interfaces.js` may need a new
  method shape added.

## Upgrade Considerations

- Existing stored formulas already have `type` fields. No migration needed.
- The UI change is purely presentational; old state is fully compatible.
