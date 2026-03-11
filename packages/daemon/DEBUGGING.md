# Debugging the Endo Daemon

This guide covers the daemon's debugging and observability tools:
environment variables, log interpretation, and recipes for common
failure modes.

## Reading Logs

### Daemon log

The daemon writes to a single log file (`endo.log` in the state directory).

```sh
endo log          # print the daemon log once
endo log -f       # follow (tail) the daemon log
```

### All logs (daemon + workers)

Workers write their stdout/stderr to individual log files at
`<state>/worker/<id>/worker.log`. Use `--all` to see everything:

```sh
endo log --all          # print daemon + all worker logs
endo log --all -f       # follow daemon + all worker logs
```

With `--all`, each log section is headed with `==> <source> <==`
(e.g. `==> worker/a018b8f3 <==`). New worker logs are picked up
automatically when following.

### Log file locations

```sh
endo where state   # state directory (contains endo.log)
endo where log     # log file path directly
```

Worker logs live at `<state>/worker/<hash>/worker.log`.

## Environment Variables

### Always-on (default)

| Variable | Purpose |
|---|---|
| Lifecycle log | Formula lifecycle events are logged by default. Set `ENDO_LIFECYCLE_LOG=0` to suppress. |

### Opt-in

| Variable | Purpose |
|---|---|
| `ENDO_CAPTP_TRACE` | Log every CapTP message (SEND/RECV) per connection. Very verbose. |
| `ENDO_FORMULA_GRAPH` | Dump the full formula dependency graph after loading from persistence at startup. |
| `ENDO_GC=0` | Disable formula garbage collection for a daemon run. |

### Examples

```sh
# Trace CapTP messages to see what's being sent between daemon and workers
ENDO_CAPTP_TRACE=1 endo start

# Dump the formula graph at startup to verify dependency structure
ENDO_FORMULA_GRAPH=1 endo start

# Disable formula GC to rule out premature collection
ENDO_GC=0 endo start

# Suppress the lifecycle log (not recommended during debugging)
ENDO_LIFECYCLE_LOG=0 endo start

# Combine multiple flags
ENDO_CAPTP_TRACE=1 ENDO_FORMULA_GRAPH=1 endo start
```

## Formula Lifecycle Log

The lifecycle log is **on by default** and prints structured events for
every formula state transition. Each line has the format:

```
T+<ms>  <id-prefix>  <type>  <event>  <detail>
```

| Field | Description |
|---|---|
| `T+<ms>` | Milliseconds since daemon core initialization |
| `<id-prefix>` | First 12 characters of the formula identifier |
| `<type>` | Formula type (`worker`, `guest`, `make-unconfined`, `host`, etc.) |
| `<event>` | Lifecycle event (see below) |
| `<detail>` | Optional extra information |

### Events

| Event | Meaning |
|---|---|
| `FORMULATE` | New formula created and persisted |
| `REINCARNATE` | Existing formula being re-evaluated from persistence |
| `WORKER_READY` | Worker process spawned and CapTP connected |
| `REVIVE_PIN` | Pinned formula about to be provided during startup |
| `CANCEL_REQUEST` | Explicit cancellation requested (via `endo cancel`) |
| `COLLECTED` | Formula selected for garbage collection |

### Example: healthy startup

```
T+0ms     cf1ba7f3e2a1  endo          REINCARNATE
T+5ms     a018b8d94c12  worker        REINCARNATE
T+10ms    6a623ef001ab  guest         REINCARNATE
T+15ms    afc966c833d0  worker        REINCARNATE
T+50ms    a018b8d94c12  worker        WORKER_READY
T+55ms    afc966c833d0  worker        WORKER_READY
```

### Example: reincarnation loop

```
T+50ms    afc966c833d0  worker        WORKER_READY
T+100ms   afc966c833d0  worker        REINCARNATE
T+150ms   afc966c833d0  worker        WORKER_READY
T+200ms   afc966c833d0  worker        REINCARNATE
```

A formula repeatedly appearing with `REINCARNATE` shortly after
`WORKER_READY` indicates a crash loop.

## Cancellation Log

When a formula is cancelled, the daemon logs:

```
* <full-id> (<type>) REASON: <error-message>
```

Cascading cancellations indent the `*` prefix:

```
* a018b8...  (worker)          REASON: Connection stream ended
 * cf1ba7... (make-unconfined) REASON: Connection stream ended
  * 6a623e.. (guest)           REASON: Connection stream ended
```

This shows the root cause (worker `a018b8` died with "Connection stream
ended") and which dependent formulas were cancelled as a result.

Garbage-collected formulas use `!` instead of `*`:

```
! 3cc8a6... (mailbox-store) REASON: Collected formula
```

## CapTP Message Tracing

When `ENDO_CAPTP_TRACE` is set, every CapTP message is logged:

```
[captp:Worker abc123] SEND {"type":"CTP_CALL","questionID":1,...}
[captp:Worker abc123] RECV {"type":"CTP_RETURN","answerID":1,...}
```

The connection name (e.g. `Worker abc123`) identifies which CapTP
connection the message belongs to. This helps distinguish:

- **Message sent but never answered** — you see the SEND but no
  matching RECV with the same `answerID`
- **Message couldn't be delivered** — the SEND fails or the connection
  closes before delivery
- **Target rejected the call** — you see a RECV with an `exception` field

### CapTP error logging

CapTP exceptions are logged with the raw error message and stack trace:

```
CapTP Worker abc123 exception: <message> <stack>
```

This replaces the default `CapTP Endo exception: {}` with actionable
information even when the error doesn't marshal cleanly.

## Formula Graph Dump

When `ENDO_FORMULA_GRAPH` is set, the daemon prints the full dependency
graph after loading formulas from persistence:

```
Formula graph after persistence seed:
  cf1ba7f3e2a1 make-unconfined deps=[a018b8d94c12, 6a623ef001ab]
  a018b8d94c12 worker [ROOT] deps=[none]
  6a623ef001ab guest deps=[afc966c833d0, c23a0301ff82, 3cc8a6e92b10]
  afc966c833d0 worker deps=[none]
  c23a0301ff82 pet-store deps=[none]
  3cc8a6e92b10 mailbox-store deps=[none]
```

| Annotation | Meaning |
|---|---|
| `[ROOT]` | Formula is in the GC root set (never collected) |
| `deps=[...]` | Static dependency IDs (first 12 chars) |

## Common Debugging Scenarios

### "Why is my formula reincarnating in a loop?"

1. Run `endo log --all -f` and watch for the lifecycle events
2. Look for the pattern: `REINCARNATE` → `WORKER_READY` →
   cancellation (`*`) → `REINCARNATE` repeating for the same formula ID
3. The cancellation line tells you which formula died first and why
4. Check the worker log for the crashed worker to see the actual error

### "Why does E(powers).lookup(...) hang?"

1. Set `ENDO_CAPTP_TRACE=1` and restart
2. Look for a `CTP_CALL` with method `lookup` in the trace
3. If the SEND appears but no RECV follows, the target is unreachable
   or hasn't resolved
4. Check whether the target worker is alive (look for `WORKER_READY`
   in the lifecycle log)

### "Why is CapTP exception empty ({})?

The daemon logs the raw error with message and stack before marshalling.
Look for `CapTP <name> exception:` lines in the log — these show the
actual error even when the marshalled form is opaque.

### "Which dependency died first after restart?"

1. Enable `ENDO_FORMULA_GRAPH=1` to see the dependency structure
2. Watch the lifecycle log — the first `*` cancellation line after
   `REINCARNATE` events is the root cause
3. Cascading cancellations indent further, so the leftmost `*` is
   the originator

### "Is my formula being garbage collected?"

1. Look for `COLLECTED` events in the lifecycle log
2. Set `ENDO_GC=0` to disable collection and see if the problem
   goes away
3. Use `ENDO_FORMULA_GRAPH=1` to verify the formula has incoming
   references (deps from other formulas or pet store edges)

## Killing Stale Workers

After an unclean daemon shutdown, worker processes may linger:

```sh
# Find leftover worker processes
ps aux | grep daemon-node

# Kill them
pkill -f "daemon-node.*packages/daemon/tmp"

# Clean ephemeral state
rm -rf packages/daemon/tmp/
```

Or use the daemon lifecycle commands:

```sh
endo stop         # graceful shutdown
endo clean        # erase ephemeral state
endo purge        # erase all persistent state (destructive!)
```
