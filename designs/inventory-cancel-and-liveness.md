# Inventory Liveness Indicator and Cancel

| | |
|---|---|
| **Created** | 2026-02-14 |
| **Updated** | 2026-03-13 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The inventory shows pet names but gives no indication of whether the
underlying capability currently has a live incarnation (a running worker, an
active connection, a resolved promise). Users need to see at a glance which
capabilities are alive, and need the ability to cancel a live incarnation
directly from the inventory — which is especially important for
service-like capabilities (network listeners, cron schedulers) that consume
resources while alive.

The inventory also needs efficient status observation. It may contain
hundreds of pet names. Opening a separate subscription per item creates an
N+1 problem over CapTP. The daemon needs a coalesced watcher: the client
sends the set of identifiers it cares about, the server streams only
transitions for those identifiers, and the client can update the watched
set as items scroll in and out of view or as the inventory changes.

## Design

### Cancel button with indicator light

The liveness indicator and cancel button are a single element: a circular
button (12–14px diameter) whose fill color shows the incarnation state.
Clicking it cancels the incarnation. One element, two functions.

| State | Fill | Meaning |
|-------|------|---------|
| Live | Green | Incarnation exists and is running |
| Settled | Blue | Promise resolved to a durable value |
| Pending | Amber, pulsing | Promise not yet settled |
| Not incarnated | Gray | Formula exists but not currently provided |
| Cancelled | Hollow (border only) | Incarnation was cancelled |

The button is always visible (it is the indicator). A tooltip on hover
shows the state in text ("Live", "Pending", "Not incarnated", "Cancelled").

**Click** cancels the incarnation by calling
`E(powers).cancel(...petNamePath)`. The indicator transitions to the
cancelled (hollow) state.

**Disabled for special names**: `AGENT`, `SELF`, `HOST`, and other
uppercase system names cannot be cancelled. The button renders the
indicator light but is not interactive (no hover effect, no click handler).

Before the watcher delivers the first status for an item, the indicator
shows the neutral state (gray). This corrects itself as soon as the
watcher's initial status arrives.

#### Confirm-on-cancel

Cancelling a live incarnation is consequential — it terminates a running
worker, breaks dependent formulas, and cannot be undone (the formula must
be re-provided). The button requires a confirmation gesture:

- **Single click**: the button enters a "confirm" state — it grows slightly
  and changes to a warning color (red border). A tooltip reads "Click
  again to cancel."
- **Second click within 3 seconds**: executes the cancel.
- **Click elsewhere or timeout**: reverts to the indicator state.

This prevents accidental cancellation while keeping the interaction
lightweight (no modal dialog).

### Remove button

The existing remove button (×) is retained as a separate affordance. It
calls `E(powers).remove(...petNamePath)` as today. It is disabled for
special names.

Deletion and cancellation are distinct operations:

- **Deletion** (× button) removes the pet name from the pet store. This is
  a naming operation: it says "I no longer want this name." If the formula
  has no remaining pet names or pins, the daemon garbage-collects it —
  which causes cancellation as a side effect.
- **Cancellation** (indicator button) terminates the live incarnation. The
  pet name remains. The formula can be re-provided later. This is a
  lifecycle operation: it says "stop this thing."

For pinned capabilities, removal of a pet name never causes cancellation
because the PINS directory retains the formula. If other names still
reference the same formula, removal deletes only the name — the
incarnation continues and remains visible under the other names.

### Visual layout

```
┌─ inventory row ───────────────────────────────┐
│ ▶  my-worker           ℹ  (●)  ×             │
│ ▶  api-key             ℹ  (●)  ×             │
│    pending-result      ℹ  (◉)  ×  ← pulsing  │
│ ▶  old-service         ℹ  (○)  ×  ← hollow   │
└───────────────────────────────────────────────┘
```

- **(●)** — cancel button with liveness indicator, always visible.
- **ℹ** — inspect, appears on hover (unchanged from today).
- **×** — remove, appears on hover (unchanged from today). Disabled for
  special names.

### Coalesced liveness watcher

#### Problem

The inventory renders N items. Each needs liveness status. A naive
implementation opens N subscriptions:

```js
// Bad: N+1 subscriptions over CapTP
for (const name of names) {
  for await (const status of E(powers).followIncarnationStatus(name)) {
    updateIndicator(name, status);
  }
}
```

Each subscription is a CapTP async iterator — a long-lived remote
reference with its own message flow. For 200 pet names, this is 200
concurrent remote iterators.

#### Solution: a watched-set protocol

The daemon exposes a single liveness watcher per client. The client sends
updates to the set of identifiers it wants to watch. The server sends
transitions only for watched identifiers.

```js
const watcher = await E(powers).makeIncarnationWatcher();

// Client adds identifiers to the watch set
await E(watcher).watch(id1);
await E(watcher).watch(id2);

// Client removes identifiers it no longer cares about
await E(watcher).unwatch(id1);

// Server streams transitions for watched identifiers only
for await (const transition of E(watcher).followTransitions()) {
  // { id, status: 'live' | 'settled' | 'pending' | 'not-incarnated' | 'cancelled' }
  updateIndicator(transition.id, transition.status);
}
```

A single CapTP async iterator carries all transitions. The watch/unwatch
methods are fire-and-forget `E.sendOnly()` calls that update the server's
filter set without round-trip latency.

#### Daemon-side implementation

```js
const IncarnationWatcherI = M.interface('IncarnationWatcher', {
  watch: M.call(M.string()).returns(M.undefined()),
  unwatch: M.call(M.string()).returns(M.undefined()),
  watchAll: M.call(M.arrayOf(M.string())).returns(M.undefined()),
  followTransitions: M.call().returns(M.remotable('AsyncIterator')),
  help: M.call().returns(M.string()),
});
```

The watcher exo maintains:

- `watchedIds`: a `Set<string>` of formula identifiers the client is
  watching.
- `transitionTopic`: a topic/publisher that the `followTransitions()`
  iterator subscribes to.

The watcher hooks into the daemon's existing formula lifecycle:

1. **`provide(id)` completes** → if `id` is in `watchedIds`, publish
   `{ id, status: 'live' }`.
2. **`context.cancel(reason)` called** → if `id` is in `watchedIds`,
   publish `{ id, status: 'cancelled' }`.
3. **Promise settles** → if the promise's `id` is in `watchedIds`, publish
   `{ id, status: 'settled' }`.
4. **`watch(id)` called** → immediately publish the current status of `id`
   so the client gets an initial value.

The watcher is scoped to the agent's own formulas. It cannot observe
formulas outside the agent's pet store.

#### Batch watch for initial load

To avoid N individual `watch()` messages on initial render, the watcher
supports a batch variant:

```js
await E(watcher).watchAll(ids); // string[]
```

The inventory calls `followNameChanges()` to get the initial set of names,
resolves their identifiers via `identify()`, and sends them all at once
via `watchAll()`.

#### Client-side integration

The inventory component manages the watcher:

1. On mount, create the watcher:
   `const watcher = await E(powers).makeIncarnationWatcher()`.
2. Start consuming `E(watcher).followTransitions()` in a background loop.
3. When an inventory item is rendered, call `E.sendOnly(watcher).watch(id)`
   where `id` comes from `E(powers).identify(...petNamePath)`.
4. When an inventory item is removed from the DOM (name deleted, or
   collapsed in a nested inventory), call `E.sendOnly(watcher).unwatch(id)`.
5. On unmount, the watcher's CapTP reference is dropped and the daemon
   garbage-collects it.

For nested inventories (expanded directories), the same watcher instance is
shared. The nested inventory adds its items' identifiers to the same
watched set.

## Security Considerations

- Cancellation is already an authorized operation on the agent. No new
  authority is granted.
- Status observation is scoped to the agent's own pet store, not
  cross-agent.

## Scaling Considerations

- The coalesced watcher avoids N+1 subscriptions and scales to large
  inventories.
- Consider debouncing rapid status changes in the UI.

## Test Plan

- Unit test: status API returns correct state for provided, cancelled, and
  pending formulas.
- Integration test: cancel via the API, verify status transitions to
  cancelled.
- Integration test: remove a pet name that is the sole reference, verify
  incarnation is cancelled as a GC side effect.
- Integration test: remove a pet name that has other references, verify
  incarnation continues.
- UI test: indicator renders correct colors; confirm-on-cancel gesture
  works; remove button remains independent.

## Compatibility Considerations

- New daemon API methods are additive.
- The existing `cancel` CLI command already exercises the underlying
  mechanism.
- Old clients that don't call the status APIs are unaffected.

## Upgrade Considerations

- The daemon may need to persist incarnation events for crash recovery of
  status state.
- Workers that were alive before the upgrade will need to report their
  status upon first query.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-capability-bank](daemon-capability-bank.md) | Capability lifecycle observable via the watcher |

## Affected Packages

- `packages/daemon/src/daemon.js` — incarnation watcher exo, lifecycle
  hooks to publish transitions.
- `packages/daemon/src/types.d.ts` — `IncarnationWatcher` interface,
  `IncarnationStatus` type, `IncarnationTransition` type.
- `packages/daemon/src/host.js` — expose `makeIncarnationWatcher()` on
  EndoHost and EndoAgent.
- `packages/chat/inventory-component.js` — add cancel/indicator button,
  manage watcher lifecycle.
- `packages/chat/index.css` — cancel/indicator button styles, confirm
  animation.
- `packages/cli` — consider `endo status <name>` command.

## Design Decisions

1. **One button, two functions.** The cancel button *is* the indicator.
   This keeps the row compact while ensuring the most important status
   information (is this thing alive?) is always visible. The remove button
   (×) remains separate because deletion and cancellation are distinct
   operations with different semantics.

2. **Coalesced watcher over per-item subscriptions.** A single watcher
   with a mutable watched set avoids the N+1 subscription problem. The
   client controls what it watches, the server filters transitions. This
   scales to inventories with hundreds of items.

3. **Fire-and-forget watch/unwatch.** Using `E.sendOnly()` for
   watch/unwatch means the client does not wait for the server to
   acknowledge each addition. The watcher will deliver the initial status
   asynchronously via the transition stream.

4. **Confirm-on-cancel instead of a dialog.** A modal confirmation dialog
   interrupts flow and is disproportionate for a single-item action. The
   two-click confirm pattern is lightweight and prevents accidents.

5. **Deletion and cancellation are distinct.** The × button removes the
   pet name (a naming operation); the indicator button cancels the
   incarnation (a lifecycle operation). Cancellation may occur as a
   consequence of deletion via garbage collection, but the user's intent
   is different and the affordances reflect that.

## Prompt

> Please add a design to add a circular cancel button to each petnamed item
> in the inventory that, instead of a label, has an indicator light for
> whether there is a current, living incarnation of the referent. This will
> require the EndoHost to expose a mechanism for watching for updates to the
> online/offline status for each value, which in turn may require a
> coallesced watcher: that is, a system over CapTP where the client can send
> updates to the set of identifiers it is watching and server that sends
> transitions for only those identifiers.
>
> (Consolidated with live-reference-indicator, which proposed status dots
> with a cancel popover, daemon API options, and security/scaling/upgrade
> considerations.)
