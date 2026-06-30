# Inventory Grouping by Type

| | |
|---|---|
| **Created** | 2026-02-14 |
| **Updated** | 2026-06-28 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## What is the Problem Being Solved?

The inventory is a flat, ungrouped list of pet names. As the number of
capabilities grows, users can't easily distinguish between different kinds of
things: agent handles (representing people/guests), naming hubs (directories,
hosts, guests that expose `lookup`), and leaf values (blobs, eval results,
promises). The daemon knows the formula type for every capability but doesn't
currently expose it through the agent's naming API.

## Description of the Design

### Inventory Groups

Group inventory items into collapsible sections, rendered in this fixed manual
order (not alphabetical or derived):

| Group | Formula Types | Icon | Description |
|-------|--------------|------|-------------|
| **Handles** | `handle` | Bust in silhouette | Agent handles (identities representing people / contacts) |
| **Directories** | `directory`, `readable-tree`, `mount`, `scratch-mount`, `pet-store` | Folder | Directories, readable trees, mounts, scratch mounts, pet stores |
| **Values** | `marshal` | Diamond | Marshalled values |
| **Capabilities** | All remaining types | Key | Everything else: workers, blobs, eval results, promises, lookups, peers, remotes, etc. |
| **Agents** | `guest` | Robot | Delegated guests |
| **Personas** | `host` | Performing-arts masks | The agent's own host identities |

A group renders **only when it has at least one visible item**. An empty group
does not appear at all (for example the Agents section is absent when there are
no guests), and neither does a group whose only members are special
(`@`-prefixed system) names that the show-special toggle currently hides.
(Empty-group hiding is implemented declaratively in the Preact
`InventoryGroupSection` — a zero visible-item count returns `null` — and on the
CLI side, which skips a bucket with no members. The chat CSS also hides an empty
group's header outright as a backstop.)

Each group header's item count reflects the **same special-name filter** that
governs the body, so the count agrees with the number of items the section
actually shows when expanded. When the show-special toggle reveals `@`-prefixed
system names, both the body and every header count include them; the host
wrapper threads the live toggle state into the confined tree and re-renders on
change.

Handles are a first-class top-level category and carry no per-item speech-bubble
prefix (the earlier conversable-item marker was removed in favor of the group
heading).

Each item should display a small type badge showing the formula type (e.g.,
`eval`, `readable-blob`, `worker`).

The "system" items (`@`-prefixed special names like `@self`, `@agent`) that are
currently hidden by default should remain in their respective type groups but
with the existing toggle to show/hide them.

> **2026-06-28 revision.** The taxonomy was first reshaped to five role-named
> groups (`Directories`, `Agents`, `Personas`, `Values`, `Capabilities`) and
> then, in the follow-up round on PR #405, promoted `Handles` back to a
> dedicated top-level category and fixed a manual heading order: **Handles,
> Directories, Values, Capabilities, Agents, Personas.** `Directories` includes
> `pet-store`; the catch-all `Capabilities` collects everything not enumerated
> elsewhere (workers, blobs, eval results, peers, remotes). The earlier
> four-group scheme (Handles, Hubs, Workers, Everything Else) and the interim
> five- and seven-group schemes are all superseded. The same round made each
> header's count honor the show-special filter, removed the per-handle
> speech-bubble prefix, and nudged the indent under each disclosure-triangle
> section.

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
