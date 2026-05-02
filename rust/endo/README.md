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
