# Durable OCapN Baggage Schema

This document defines the baggage hierarchy used by `@endo/ocapn-durable-client`.

The durable model assumes values persisted in baggage are durable references
(for example durable Exo instances) or copy data. In particular, entries under
`localSlots` are expected to be durable values, not ephemeral `Far` objects.

## Top-level baggage keys

```text
root baggage
├── ocapn:swissnumTable
├── ocapn:giftTable
└── ocapn-durable:tables
```

---

## `ocapn:swissnumTable`

`Map<string, DurableValue>`

- **key**: swissnum string (`decodeSwissnum(...)` result)
- **value**: durable target value for sturdyref resolution

Examples:

- `swissnum -> durable Exo reference`
- `swissnum -> copyRecord`

---

## `ocapn:giftTable`

`Map<string, any>`

- **key**: composed gift key (for example `${sessionIdHex}:${giftIdHex}`)
- **value**: deposited gift/pending gift state

Note: current core behavior still uses in-memory-like semantics for pending
gift resolution. Durable hardening of pending gift lifecycle is a follow-on.

---

## `ocapn-durable:tables`

`Map<LocationId, DurableTableState>`

- **key**: peer location id (`locationToLocationId(peerLocation)`)
- **value**: state bundle for that peer's import/export table continuity

`DurableTableState`:

```text
DurableTableState
├── localSlots: Map<Slot, DurableValue>
└── nextExportPosition: bigint (required for full continuity)
```

- `localSlots` stores persisted local exports (`o+N`, `p+N`, excluding bootstrap slot 0)
- `nextExportPosition` must track the next allocatable local export position
  so slot assignment remains monotonic across restarts

---

## Required continuity invariants

For restart-safe import/export behavior:

1. If a local export slot exists in `localSlots`, rehydration must re-register it
   before normal message processing.
2. `nextExportPosition` must be restored from baggage so new exports do not reuse
   prior slot positions.
3. Dropping a local export to refcount 0 must remove it from `localSlots`.
4. Persisted values in `localSlots` must be durable-capable values.

---

## Future schema extensions

Recommended additional durable keys:

```text
root baggage
└── ocapn-durable:sessions
    ├── byId: Map<SessionIdHex, SessionRecord>
    └── byPeerLocation: Map<LocationId, SessionIdHex>
```

These support explicit `op:resume-session` lookup, authentication material, and
session metadata continuity.
