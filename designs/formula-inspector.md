# Formula Inspector

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

There is no way for a user to "pop the bonnet" and see the underlying formula
for a pet-named capability. The daemon stores rich formula structures (26 types
with fields like `worker`, `source`, `endowments`, `hub`, `path`, etc.) but the
chat UI only shows the rendered value. Power users and developers need to
inspect — and potentially edit — the formula graph to understand and debug the
system.

## Description of the Design

Add a "Formula Inspector" panel accessible from each inventory item (e.g., a
wrench/gear icon or context menu). The panel should:

- Display the formula type and all formula fields for the selected capability,
  retrieved via the existing `InspectorHub.lookup(petName)` API which already
  returns formula-type-specific metadata (endowments, source, worker, hub, path,
  etc.).
- Render formula identifier references as clickable links that navigate to the
  referenced formula's inspector view.
- For `eval` formulas, display the source code with syntax highlighting.
- For `lookup` formulas, show the hub and path chain.
- Read-only by default, with an "edit" toggle for advanced users that allows
  modifying mutable formula fields (e.g., re-pointing a lookup path). Editing
  requires a new daemon API method — `E(agent).revise(petName, patch)` or
  similar — that validates and persists formula changes.

The CLI should gain an `endo inspect <name>` command that prints the formula
JSON.

Provide a facility for revealing every retention path in the formula graph
for identified formulas.

### Key Interfaces

The `InspectorHub` interface already exists in
`packages/daemon/src/interfaces.js` and may or *may not* be useful for this.

```js
export const InspectorHubInterface = M.interface('EndoInspectorHub', {
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  list: M.call().returns(M.array()),
});
```

The `makePetStoreInspector` function in `packages/daemon/src/daemon.js`
(lines 3210-3319) creates inspectors that return formula-type-specific metadata:

- `eval`: `endowments`, `source`, `worker`
- `lookup`: `hub`, `path`
- `guest`: `hostAgent`, `hostHandle`
- `make-bundle`: `bundle`, `powers`, `worker`
- `make-unconfined`: `powers`, `specifier`, `worker`
- `peer`: `NODE`, `ADDRESSES`
- Other types: empty metadata object

### Affected Packages

- `packages/daemon` — surface inspector data, add `revise` API for editing
- `packages/chat` — new inspector panel UI
- `packages/cli` — new `endo inspect <name>` command

## Security Considerations

- Formula inspection reveals the internal structure of the capability graph.
  This is acceptable for the owning user/host but must not be exposed to guests
  without explicit policy.
- Formula editing is a highly privileged operation. It must be gated behind
  host-level authority and should log an audit trail.
- Editing should validate formula invariants (e.g., a `worker` field must
  reference a valid worker formula).

## Scaling Considerations

- Inspector lookups are on-demand and per-item; no new persistent subscriptions
  needed.
- Deep formula graphs could be large; consider lazy loading of referenced
  formulas.

## Test Plan

- Exercise what is implemented.
- Integration test: CLI `endo inspect` prints expected JSON for eval, lookup,
  guest, and host formulas.

Maybe:

- Unit test: `InspectorHub.lookup()` returns correct metadata for each formula
  type.
- UI test: Formula inspector panel renders and navigates formula references.

## Compatibility Considerations

- The `InspectorHub` interface already exists. New metadata fields should be
  additive.
- The CLI command is purely additive.

## Upgrade Considerations

- No formula schema migration needed for read-only inspection.
- Formula editing would require versioning the formula persistence format.
