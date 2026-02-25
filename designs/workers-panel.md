# Workers Panel

| | |
|---|---|
| **Date** | 2026-02-14 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Workers are opaque. There is no way to see which worker processes are running,
what capabilities are tenanted in each worker, what their resource consumption
looks like, or to correlate logs and metrics with specific workers. For a system
designed to host potentially untrusted guest code, observability is essential.

## Description of the Design

Add a "Workers" panel to the chat UI (alongside Inbox and Inventory).

### Event Loop Latency Sparkline

Instrument each worker with a periodic `setTimeout(0)` probe that measures
scheduling delay. This is the single most informative metric for a
single-threaded JS worker: if the event loop is blocked, everything queued
behind it stalls.

- Report via a new streaming API: `E(worker).followMetrics()` returning an
  async iterator of `{ timestamp, eventLoopLatencyMs }` samples.
- Render as a small inline sparkline (SVG or canvas) next to each worker name.
- Color thresholds: green < 10ms, yellow < 100ms, red > 100ms.
- Default probe interval: 1 second. Configurable.

### Tenant Capabilities

List the pet names of capabilities whose formulas reference a given worker.
Specifically, formulas with a `worker` field matching this worker's formula
identifier:

- `eval` — evaluated expressions
- `make-bundle` — bundled plugins
- `make-unconfined` — unconfined caplets

This is a reverse lookup on the formula graph. The daemon's `graph.js` already
tracks formula references for GC; this information needs to be surfaced.

- New API: `E(agent).listWorkerTenants(workerPetName)` returning an array of
  `{ petName, formulaType }`.

### Pet Name Retention Paths

Show why a worker is alive — trace the retention graph from the worker back to
GC roots (PINS directory, agent pet stores). This helps users understand why a
worker isn't being collected and what would need to be removed/unpinned to
release it.

- Reuse the GC graph from `packages/daemon/src/graph.js` which already
  implements union-find and reachability analysis.
- New API: `E(agent).retentionPath(petName)` returning an array of
  `{ name, formulaType }` from the target back to a root.

### Per-Worker Logs

Stream worker logs filtered to a specific worker. The daemon already has
per-formula logging (the `endo log` command accesses it); it needs to be
filterable by worker formula identifier.

- New API: `E(agent).followWorkerLog(workerPetName)` returning an async
  iterator of log entries.
- In the panel, each worker has an expandable log viewer showing timestamped
  entries.

### Correlated View

A timeline-aligned view where log entries and latency spikes can be viewed
together:

- Shared X-axis (time).
- Top lane: sparkline of event loop latency.
- Bottom lane: log entries as markers/rows at their timestamps.
- Clicking a latency spike scrolls to the nearest log entries.

### CLI Additions

- `endo workers` — list active workers with pet names and status.
- `endo worker <name> --logs` — tail logs for a specific worker.
- `endo worker <name> --metrics` — show current event loop latency.
- `endo worker <name> --tenants` — list capabilities tenanted in this worker.

### Key Implementation Points

- Worker process entry point: `packages/daemon/src/worker.js` `main()` function.
  The latency probe would be added here.
- Formula graph: `packages/daemon/src/graph.js` tracks references between
  formulas using union-find for GC.
- Worker formula type is minimal: `{ type: 'worker' }` in
  `packages/daemon/src/types.d.ts` (lines 112-114). The worker's tenants are
  found by scanning other formulas that reference this worker's ID.
- Existing log infrastructure: `endo log --follow --all` in
  `packages/cli/src/commands/log.js`.

### Affected Packages

- `packages/daemon` — worker metrics probe, tenant listing, retention path API,
  filtered log streaming
- `packages/chat` — workers panel UI, sparkline rendering, log viewer
- `packages/cli` — new `endo workers` and `endo worker` commands

## Security Considerations

- Worker metrics and logs may contain sensitive data from guest code. Restrict
  observability APIs to host-level authority.
- Event loop probing adds minimal overhead (~1ms per probe per second) but
  should be configurable or disableable for production deployments where the
  overhead is unacceptable.
- Retention path computation reveals the formula graph structure. This is
  acceptable for the owning host but must not be exposed to guests.

## Scaling Considerations

- Metrics streaming adds one message per probe interval per worker. At 1s
  intervals with 10 workers, this is 10 messages/second — negligible.
- Retention path computation could be expensive for large formula graphs. Cache
  the result and update incrementally when the graph changes.
- Tenant listing requires scanning all formulas with a `worker` field. Consider
  maintaining a reverse index for efficiency.
- The sparkline should use a fixed-size ring buffer (e.g., last 60 samples) to
  bound memory.

## Test Plan

- Unit test: event loop latency probe reports values within expected range
  under idle and loaded conditions.
- Integration test: create worker, run eval, verify tenant list includes the
  eval formula's pet name.
- Integration test: worker logs filtered by worker pet name contain only
  entries from that worker.
- Integration test: retention path from a worker traces back to a pet store
  root.
- UI test: sparkline renders with correct color coding; tenant list is
  accurate; log stream updates in real time.

## Compatibility Considerations

- New worker API methods (`followMetrics`, etc.) are additive.
- Sparkline rendering is client-only; no protocol changes.
- Log filtering requires the daemon to tag log entries with the originating
  worker formula identifier. If log entries don't currently carry this tag,
  the log schema needs a backward-compatible addition.

## Upgrade Considerations

- Existing workers (before upgrade) don't report metrics. The UI should handle
  the absence gracefully (show "no data" instead of a sparkline).
- The latency probe must be added to `worker.js` `main()`. This changes the
  worker process behavior but doesn't affect the formula schema.
- Log entries written before the upgrade won't have worker tags; filtered log
  views will simply not show historical entries for those workers.
