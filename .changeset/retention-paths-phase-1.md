---
'@endo/daemon': minor
'@endo/cli': minor
---

Surface retention-path inspection on `EndoHost` and as `endo paths` (Phase 1 of `designs/daemon-retention-paths.md`).

The daemon already computed retention paths internally for GC. This change exposes them to the host facet so users can ask "why is this value still alive?" without polling the whole formula graph.

- **`EndoHost.listRetentionPaths(locator)`** snapshots every retention path from a GC root to the target. Pet-store edges along the path render as `pet:<name>` labels; internal field edges keep their field name (e.g. `worker`, `petStore`, `retention`).
- **`EndoHost.followRetentionPaths(locator)`** subscribes to retention-path changes. The first delta is a full `{ snapshot }`; subsequent deltas are `{ added, removed }` diffs over a microtask-coalesced batch window. Drop the returned far reference to release the subscription, exactly as with `followNameChanges` / `followLocatorNameChanges`.
- **`endo paths <name-or-locator>`** CLI verb prints the path set in the design's human-readable notation (or `--json` for the raw `RetentionPath[]`). Accepts either a pet name or a `--locator`-flagged endo:// URL.
- Both methods live on the host facet only, never on `EndoGuest` or the CapTP gateway: enumerating paths through capabilities a guest does not own would leak host structure.

Phase 2 (Chat UI panel embedding the paths viewer) and Phase 4 (per-value disincarnate / reincarnate / delete-pet-name affordances) are deferred to follow-up work.
