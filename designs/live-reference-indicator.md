# Live Reference Indicator

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The inventory shows pet names but gives no indication of whether the underlying
capability currently has a live incarnation (a running worker, an active
connection, a resolved promise). The only action is "Dismiss" (×). Users need to
see at a glance which capabilities are alive, and need the ability to cancel a
live reference directly from the inventory — which is especially important for
service-like capabilities (network listeners, cron schedulers) that consume
resources while alive.

## Description of the Design

For each inventory item, add a status dot indicator:

- **Green dot**: Live incarnation — the formula is currently
  provided/incarnated and the value is available.
- **Gray dot**: Not currently incarnated — the formula exists but hasn't been
  revived or has been cancelled.
- **Pulsing/animated dot**: Pending — a promise formula that hasn't yet
  resolved.

Clicking the dot opens a small popover with:

- The incarnation status and formula type.
- A "Cancel" button that calls `E(agent).cancel(petName, reason)` (this API
  already exists).
- For pinned capabilities, a warning that cancellation will not collect the
  formula since it's retained by the PINS directory.

### Daemon API Additions

Implementation requires a new daemon API to observe incarnation status. Options:

1. **Streaming**: `E(agent).followIncarnationStatus(petName)` — returns an async
   iterator of status change events.
2. **Batch streaming**: `E(agent).followAllStatuses()` — emits
   `{name, status}` change events for the entire pet store, similar to the
   existing `followNameChanges()` pattern. Preferred to avoid N+1 subscriptions.
3. **Poll**: `E(agent).getStatus(petName)` — returns current status on demand.

The daemon's internal `provide()` / formula lifecycle already tracks incarnation
state; it needs to be surfaced through these APIs.

### Existing Infrastructure

- `E(agent).cancel(petName, reason)` already exists (`packages/cli/src/commands/cancel.js`).
- Formula lifecycle is managed in `packages/daemon/src/daemon.js` through the
  `provide()` mechanism which tracks whether a formula has been incarnated.

### Affected Packages

- `packages/daemon` — new status observation APIs
- `packages/chat` — status dot UI, cancel popover
- `packages/cli` — consider `endo status <name>` command

## Security Considerations

- Cancellation is already an authorized operation on the agent. No new authority
  is granted.
- Status observation should be scoped to the agent's own pet store, not
  cross-agent.

## Scaling Considerations

- Status subscriptions per-item could be expensive with many names. The batch
  `followAllStatuses()` approach avoids N+1 subscriptions and scales to large
  inventories.
- Consider debouncing rapid status changes in the UI.

## Test Plan

- Unit test: status API returns correct state for provided, cancelled, and
  pending formulas.
- Integration test: cancel via the API, verify status transitions to gray/not
  incarnated.
- UI test: dots render correct colors; clicking opens popover with cancel
  action.

## Compatibility Considerations

- New daemon API methods are additive.
- The existing `cancel` CLI command already exercises the underlying mechanism.
- Old clients that don't call the status APIs are unaffected.

## Upgrade Considerations

- The daemon may need to persist incarnation events for crash recovery of status
  state.
- Workers that were alive before the upgrade will need to report their status
  upon first query.
