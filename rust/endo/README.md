# endo (Rust)

Rust implementation of Endo components.
Provides the unified `endor` binary, which can act as the top-level
endo daemon (the capability bus), a manager child (which bootstraps
the pet-name store and formula graph), a worker, or a standalone
archive runner depending on the subcommand.

## Building

```sh
# Builds the unified `endor` binary (and pulls in xsnap as a library).
cargo build --release -p endo --bin endor
```

The xsnap library ships JS bundles (`daemon_bootstrap.js` — the
manager bundle, kept under its legacy filename to minimize bundler
churn — and `worker_bootstrap.js`) that must be generated first via
`packages/daemon/scripts/bundle-bus-daemon-rust-xs.mjs` and
`packages/daemon/scripts/bundle-bus-worker-xs.mjs`.

The binary lands at `target/release/endor`.

## Binaries

### endor

Unified binary. All subprocesses are spawned by self-execing this
same binary via `std::env::current_exe()`.

```sh
# Foreground (legacy Node.js manager, requires ENDO_DAEMON_PATH)
endor daemon

# Foreground (XS manager child, self-exec'd as `endor manager -e xs`)
ENDO_MANAGER_XS=1 endor daemon

# Detached (daemonizes via setsid)
endor start

# Stop a running daemon
endor stop

# Check liveness
endor ping
```

Child-facing subcommands (normally invoked by the daemon, but
documented here for completeness):

```sh
endor manager [-e xs]               # supervised manager child
endor worker  [-e xs]               # supervised worker child
endor run     [-e xs] <archive.zip> # standalone archive runner
```

XS is the default engine for every child-facing subcommand, so `-e xs`
is optional and the daemon passes it explicitly only for clarity
in `ps` output.

The **daemon** is the capability bus: it routes envelopes between its
children but runs no JavaScript itself. The **manager** is the
privileged child that bootstraps the pet-name store, formula graph,
and host agent — historically the Node.js daemon script, now also
available as an XS-hosted bundle.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `ENDO_DAEMON_PATH` | Path to Node.js manager script (legacy manager role) |
| `ENDO_MANAGER_XS` | Set to run the manager child as an XS subprocess instead of the legacy Node.js manager |
| `ENDO_XS_BIN` | Optional override for the XS manager binary. When unset, `endor` self-execs via `current_exe()`. |
| `ENDO_WORKER_BIN` | Path to worker binary (used by the JS manager for its own spawn requests) |
| `ENDO_NODE_PATH` | Path to Node.js binary |
| `ENDO_TRACE` | Enable debug envelope tracing |
| `ENDO_IROH` | Manager: request an iroh network device from the daemon at startup |
| `ENDO_IROH_LOCAL` | Daemon: bind iroh without relay/discovery (same-host / private LAN) |
| `ENDO_IROH_PUBLISH_PRIVATE` | Daemon: publish loopback/private direct addresses as dial hints |

## Architecture

### Daemon socket listener

When using the XS manager, the daemon owns the Unix socket listener
and bridges CLI client connections into the envelope protocol.
The manager requests this via the `listen` control verb.
Client connections get unique handles and their netstring-framed
CapTP traffic is bridged as `deliver` envelopes.

### Control verbs

| Verb | Direction | Purpose |
|------|-----------|---------|
| `spawn` | manager → daemon | Request worker spawn |
| `spawned` | daemon → manager | Worker spawn response |
| `listen` | manager → daemon | Request socket bind |
| `listening` | daemon → manager | Socket bound |
| `connect` | daemon → manager | New client connection |
| `disconnect` | daemon → manager | Client disconnected |
| `deliver` | bidirectional | CapTP message payload |
| `exited` | daemon → manager | Worker exited |
| `ready` | manager → daemon | Manager initialization complete |
| `listen-iroh` | manager → daemon | Request an iroh network device (payload: NodeNumber) |
| `listening-iroh` | daemon → manager | Iroh endpoint bound (payload: published address) |
| `iroh-connect` | daemon → manager | New inbound iroh peer connection |

### Iroh networking

`endor` can host an [iroh](https://www.iroh.computer) QUIC transport that is
wire-compatible with the Node.js `@endo/daemon` iroh transport, so a Rust
`endor` and a Node.js daemon can cross-connect ("dial keys, not IPs").

The transport lives in the [`endo_iroh`](../endo_iroh) crate, built and tested
independently of the XS engine.
The daemon hosts it on the manager's behalf — the XS manager cannot open
sockets or speak QUIC itself — exactly as it hosts the Unix socket listener:

1. With `ENDO_IROH=1`, the manager sends `listen-iroh` (carrying its
   NodeNumber) once it is ready.
2. The daemon (`src/iroh_net.rs`) derives the iroh identity from the
   NodeNumber, binds the endpoint, and replies `listening-iroh` with the
   published `iroh+captp0://` address.
3. Inbound peers are bridged to the manager as `iroh-connect` + `deliver`
   envelopes; the manager backs each peer session with the greeter, since
   peers speak the `hello` handshake rather than the CLI's endo bootstrap.

Compatibility with the Node.js transport is byte-for-byte: ALPN
`endo/captp/0`, the NodeNumber-derived identity, the `iroh+captp0://` address
scheme, and one netstring-framed CapTP bidi stream per connection.
See [`../endo_iroh/README.md`](../endo_iroh/README.md) for the Rust transport
and
[`packages/daemon/designs/iroh-network-design.md`](../../packages/daemon/designs/iroh-network-design.md)
for the Node.js side.
Set `ENDO_IROH_LOCAL=1` to bind without relay/discovery for same-host or
private-LAN use.

#### Implementation status

Implemented and verified:

- The `endo_iroh` transport crate (address/key/netstring helpers, bind, dial,
  accept), with unit tests and a gated two-node integration test, plus an
  `endo-iroh` harness binary that cross-connects at the transport layer.
- The daemon-side bridge (`src/iroh_net.rs`) and the `listen-iroh` control
  verb, exercised end to end by `tests/iroh_supervisor.rs` (gated behind
  `ENDO_IROH_INTEGRATION=1`): a real peer dials the bound endpoint and frames
  bridge both ways.
- The XS manager wiring in `packages/daemon/src/bus-daemon-rust-xs.js`
  (the `listen-iroh` request and greeter-backed peer sessions), which passes
  `node --check` and eslint.

Not yet runnable as a full daemon-to-daemon CapTP handshake in this tree, for
reasons **out of scope for the iroh work**:

1. **The XS daemon bundle pulls in Node-only packages.**
   `bundle-bus-daemon-rust-xs.mjs` currently fails because `@endo/git`
   (`makeNativeGitBackend`, imported eagerly in `daemon.js`) and a transitive
   path under `@endo/platform/fs/lite` import `node:` builtins the bundler's
   `EXCLUDED_PACKAGES` list does not cover.
   This is pre-existing — it fails on the unmodified manager too.
   The fix is to make the git backend injectable (as `better-sqlite3` already
   is) and extend the exclude list; roughly a half-day of bundler hygiene.
2. **The worker/SES boot generators are absent.**
   Only the daemon bundler is in the tree; `bundle-bus-worker-xs.mjs` (cited
   under [Building](#building)) and the SES boot generator — and the
   `bus-worker-xs.js` worker entry they bundle — are not present and are not
   in git history.
   The XS worker/boot path is therefore not buildable from this tree alone;
   resolving it means locating those bundlers/artifacts (likely an unmerged
   branch) or authoring the worker entry and its bundlers.
3. **Sandbox discovery.**
   iroh's public relay/discovery is unreachable in restricted CI/sandbox
   environments (addresses come back as placeholders), so dial-by-NodeId
   across networks cannot be exercised there.
   Same-host direct-address dialing (`ENDO_IROH_LOCAL=1`) works and is what
   the integration tests use.

Items 1 and 2 block a live `endor` boot regardless of the iroh work; once they
are resolved, `ENDO_MANAGER_XS=1 ENDO_IROH=1 endor daemon` (add
`ENDO_IROH_LOCAL=1` for same-host) completes the path.

## Integration tests

From the workspace root:

```sh
cd packages/daemon

# Legacy Node.js manager under the Rust daemon
ENDO_BIN=../../target/release/endor \
  ENDO_WORKER_BIN='../../target/release/endor worker' \
  yarn ava test/endo.test.js --timeout=120s

# XS manager under the Rust daemon (Node.js-free), using self-exec
ENDO_MANAGER_XS=1 \
  ENDO_BIN=../../target/release/endor \
  ENDO_WORKER_BIN='../../target/release/endor worker' \
  yarn ava test/endo.test.js --timeout=120s
```

`ENDO_XS_BIN` is no longer required for the default case: the
daemon self-execs its manager child via `current_exe()`. Setting
`ENDO_XS_BIN` remains supported as a development override (e.g. to
run a separately-built binary against an installed daemon).

The cross-node networking tests (11 tests) require TCP listeners
and will time out in environments without network access.
Under XS manager mode, P2P networking tests are expected to fail/skip.
